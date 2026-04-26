import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { StringDecoder } from "node:string_decoder";
import {
  type ControlRunRecord,
  type ControlTargetRecord,
  type RpcResponse,
  type RunPromptOptions,
  clip,
  createRunId,
  DEFAULT_TIMEOUT_SECONDS,
  isTerminal,
  now,
  PI_BINARY,
  type ControlRunState,
} from "./types";
import { latestRunsByTarget, listRuns, loadRun, saveRun, saveTarget } from "./storage";

const activeRuns = new Map<string, ControlRunRecord>();
const runPromises = new Map<string, Promise<void>>();
const runControllers = new Map<string, AbortController>();
const targetLocks = new Set<string>();

function safeKill(child: ReturnType<typeof spawn>) {
  if (child.killed) return;
  try {
    child.kill("SIGTERM");
  } catch {
    // noop
  }

  setTimeout(() => {
    if (child.killed) return;
    try {
      child.kill("SIGKILL");
    } catch {
      // noop
    }
  }, 1200);
}

function attachJsonlReader(stream: NodeJS.ReadableStream, onLine: (line: string) => void) {
  const decoder = new StringDecoder("utf8");
  let buffer = "";

  stream.on("data", (chunk) => {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    while (true) {
      const newline = buffer.indexOf("\n");
      if (newline === -1) break;
      let line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      onLine(line);
    }
  });

  stream.on("end", () => {
    buffer += decoder.end();
    if (!buffer.length) return;
    const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
    onLine(line);
  });
}

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function runPromptInSession(options: RunPromptOptions) {
  await mkdir(dirname(options.sessionPath), { recursive: true });

  const args = ["--mode", "rpc", "--session", options.sessionPath];
  if (options.modelArg) args.push("--model", options.modelArg);

  const child = spawn(PI_BINARY, args, {
    cwd: options.projectPath,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  let commandCounter = 0;
  let sawAgentEnd = false;
  let expectedShutdown = false;
  let closed = false;
  let stderrTail = "";
  const pending = new Map<string, { resolve: (response: RpcResponse) => void; reject: (error: Error) => void }>();

  let resolveAgentEnd: (() => void) | undefined;
  let rejectAgentEnd: ((error: Error) => void) | undefined;
  const agentEndPromise = new Promise<void>((resolveDone, rejectDone) => {
    resolveAgentEnd = resolveDone;
    rejectAgentEnd = rejectDone;
  });
  const closePromise = new Promise<void>((resolveClosed) => {
    child.once("close", () => {
      closed = true;
      resolveClosed();
    });
  });

  const rejectPending = (error: Error) => {
    for (const item of pending.values()) item.reject(error);
    pending.clear();
  };

  child.on("error", (error) => {
    const wrapped = new Error(`Failed to start Pi subprocess: ${error.message}`);
    rejectPending(wrapped);
    rejectAgentEnd?.(wrapped);
  });

  child.on("close", (code, signal) => {
    const reason = signal ? `signal ${signal}` : `code ${code ?? "null"}`;
    if (!sawAgentEnd && !expectedShutdown) {
      const error = new Error(`Pi subprocess exited before completion (${reason})`);
      rejectPending(error);
      rejectAgentEnd?.(error);
      return;
    }
    rejectPending(new Error(`Pi subprocess closed (${reason})`));
  });

  attachJsonlReader(child.stdout, (line) => {
    const payload = parseJson<any>(line.trim());
    if (!payload) return;
    if (payload.type === "response") {
      const id = typeof payload.id === "string" ? payload.id : undefined;
      if (!id) return;
      const waiter = pending.get(id);
      if (!waiter) return;
      pending.delete(id);
      waiter.resolve(payload as RpcResponse);
      return;
    }
    if (payload.type === "agent_end") {
      sawAgentEnd = true;
      resolveAgentEnd?.();
    }
  });

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrTail += String(chunk);
    if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000);
  });

  const send = async (command: Record<string, unknown>) => {
    if (closed) throw new Error("Pi subprocess already closed");
    const id = `rpc_${++commandCounter}`;
    const payload = JSON.stringify({ id, ...command });
    return await new Promise<RpcResponse>((resolveResponse, rejectResponse) => {
      pending.set(id, { resolve: resolveResponse, reject: rejectResponse });
      child.stdin.write(`${payload}\n`, "utf8", (error) => {
        if (!error) return;
        pending.delete(id);
        rejectResponse(error instanceof Error ? error : new Error(String(error)));
      });
    });
  };

  const request = async (command: Record<string, unknown>) => {
    const response = await send(command);
    if (response.success) return response.data;
    throw new Error(`RPC ${String(command.type)} failed: ${response.error ?? "unknown error"}`);
  };

  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;

  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        safeKill(child);
        reject(new Error(`Timed out after ${options.timeoutSeconds}s`));
      }, Math.max(1, options.timeoutSeconds) * 1000);
    });

    const abortPromise = new Promise<never>((_, reject) => {
      if (!options.signal) return;
      if (options.signal.aborted) {
        safeKill(child);
        reject(new Error("Aborted"));
        return;
      }
      abortListener = () => {
        safeKill(child);
        reject(new Error("Aborted"));
      };
      options.signal.addEventListener("abort", abortListener, { once: true });
    });

    if (options.sessionName) {
      await request({ type: "set_session_name", name: options.sessionName }).catch(() => undefined);
    }

    await request({ type: "prompt", message: options.prompt });
    await Promise.race([agentEndPromise, timeoutPromise, abortPromise]);

    expectedShutdown = true;
    safeKill(child);
    await Promise.race([closePromise, new Promise<void>((resolveSoon) => setTimeout(resolveSoon, 1500))]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (stderrTail.trim()) {
      throw new Error(`${message}\n\nPi stderr:\n${clip(stderrTail.trim(), 1200)}`);
    }
    throw error;
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    if (abortListener && options.signal) options.signal.removeEventListener("abort", abortListener);
    expectedShutdown = true;
    safeKill(child);
  }
}

function acquireTargetLock(targetId: string) {
  if (targetLocks.has(targetId)) {
    throw new Error(`Target ${targetId} already has an active control_send run.`);
  }
  targetLocks.add(targetId);
}

function releaseTargetLock(targetId: string) {
  targetLocks.delete(targetId);
}

export function activeRunsSnapshot() {
  return activeRuns.values();
}

export async function startSendRun(target: ControlTargetRecord, prompt: string, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS, modelArg?: string) {
  acquireTargetLock(target.targetId);

  const run: ControlRunRecord = {
    runId: createRunId(),
    targetId: target.targetId,
    targetName: target.name,
    projectPath: target.projectPath,
    sessionPath: target.sessionPath,
    state: "queued",
    promptPreview: clip(prompt.replace(/\s+/g, " ").trim(), 220),
    modelArg,
    startedAt: now(),
    updatedAt: now(),
    timeoutSeconds,
  };
  const controller = new AbortController();

  try {
    activeRuns.set(run.runId, run);
    await saveRun(run);
    runControllers.set(run.runId, controller);
    target.lastRunId = run.runId;
    target.lastError = undefined;
    await saveTarget(target);
    run.state = "running";
    await saveRun(run);
  } catch (error) {
    activeRuns.delete(run.runId);
    runControllers.delete(run.runId);
    releaseTargetLock(target.targetId);
    throw error;
  }

  const promise = (async () => {
    try {
      await runPromptInSession({
        projectPath: target.projectPath,
        sessionPath: target.sessionPath,
        prompt,
        timeoutSeconds,
        modelArg,
        sessionName: target.sessionTitle ?? target.name,
        signal: controller.signal,
      });
      run.state = "done";
      run.finishedAt = now();
      target.lastError = undefined;
      await saveTarget(target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (run.state === "cancelled" || /aborted/i.test(message)) {
        run.state = "cancelled";
        run.cancelReason = run.cancelReason ?? "Cancelled";
      } else if (/timed out/i.test(message)) {
        run.state = "timeout";
        run.error = message;
      } else {
        run.state = "error";
        run.error = message;
      }
      run.finishedAt = now();
      target.lastError = message;
      await saveTarget(target).catch(() => undefined);
    } finally {
      await saveRun(run).catch(() => undefined);
      activeRuns.delete(run.runId);
      runControllers.delete(run.runId);
      runPromises.delete(run.runId);
      releaseTargetLock(run.targetId);
    }
  })();

  runPromises.set(run.runId, promise);
  return run;
}

export async function getStatusRuns(params: {
  runId?: unknown;
  runIds?: unknown;
  targetId?: unknown;
  targetIds?: unknown;
  changesSince?: unknown;
}) {
  const explicitRunIds = [...new Set([params.runId, ...(Array.isArray(params.runIds) ? params.runIds : [])].filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
  const targetIds = [...new Set([params.targetId, ...(Array.isArray(params.targetIds) ? params.targetIds : [])].filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
  const since = typeof params.changesSince === "number" ? params.changesSince : undefined;

  let selected: ControlRunRecord[] = [];
  if (explicitRunIds.length > 0) {
    for (const runId of explicitRunIds) {
      const run = activeRuns.get(runId) ?? (await loadRun(runId));
      if (run) selected.push(run);
    }
    if (selected.length === 0) throw new Error(`No matching runs for ${explicitRunIds.join(", ")}`);
  } else {
    selected = (await listRuns(activeRuns.values())).slice(0, 120);
  }

  if (targetIds.length > 0) {
    selected = selected.filter((run) => targetIds.includes(run.targetId));
  }
  if (since !== undefined) {
    selected = selected.filter((run) => run.updatedAt > since);
  }

  selected.sort((left, right) => right.updatedAt - left.updatedAt);
  return selected;
}

export async function cancelRuns(params: { runId?: unknown; runIds?: unknown; targetId?: unknown; targetIds?: unknown; reason?: unknown }) {
  const explicitRunIds = [...new Set([params.runId, ...(Array.isArray(params.runIds) ? params.runIds : [])].filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
  const explicitTargetIds = [...new Set([params.targetId, ...(Array.isArray(params.targetIds) ? params.targetIds : [])].filter((v): v is string => typeof v === "string" && v.trim().length > 0))];
  const reason = typeof params.reason === "string" && params.reason.trim() ? params.reason.trim() : "Cancelled by control_cancel";

  let runIdsToCancel = explicitRunIds;
  if (runIdsToCancel.length === 0 && explicitTargetIds.length > 0) {
    runIdsToCancel = [...activeRuns.values()].filter((run) => explicitTargetIds.includes(run.targetId)).map((run) => run.runId);
  }
  if (runIdsToCancel.length === 0) {
    throw new Error("Provide run_id/run_ids or target_id/target_ids for control_cancel.");
  }

  const cancelled: ControlRunRecord[] = [];
  const missing: string[] = [];

  for (const runId of runIdsToCancel) {
    const run = activeRuns.get(runId) ?? (await loadRun(runId));
    if (!run) {
      missing.push(runId);
      continue;
    }
    if (isTerminal(run.state)) {
      cancelled.push(run);
      continue;
    }
    run.state = "cancelled";
    run.cancelReason = reason;
    run.finishedAt = now();
    await saveRun(run);
    activeRuns.set(runId, run);
    runControllers.get(runId)?.abort();
    cancelled.push(run);
  }

  return { cancelled, missing };
}

export async function latestRunsMap() {
  return latestRunsByTarget(activeRuns.values());
}
