import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { getAgentDir, withFileMutationQueue } from "@mariozechner/pi-coding-agent";
import {
  type ControlRunRecord,
  type ControlTargetRecord,
  createManualTargetId,
  createStudioTargetId,
  now,
  optionalString,
  RUNS_DIR,
  TARGETS_DIR,
  targetFilePath,
  runFilePath,
} from "./types.ts";

let storageInitPromise: Promise<void> | null = null;

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

async function writeJson(filePath: string, value: unknown) {
  await ensureStorage();
  await mkdir(dirname(filePath), { recursive: true });
  await withFileMutationQueue(filePath, async () => {
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  });
}

async function removeJson(filePath: string) {
  await withFileMutationQueue(filePath, async () => {
    await rm(filePath, { force: true });
  });
}

export async function ensureStorage() {
  if (!storageInitPromise) {
    storageInitPromise = Promise.all([mkdir(TARGETS_DIR, { recursive: true }), mkdir(RUNS_DIR, { recursive: true })]).then(
      () => undefined,
    );
  }
  await storageInitPromise;
}

export async function assertProjectDirectory(projectPath: string) {
  const info = await stat(projectPath).catch(() => undefined);
  if (!info || !info.isDirectory()) {
    throw new Error(`project_path does not exist or is not a directory: ${projectPath}`);
  }
}

export function projectSessionDir(projectPath: string) {
  const safe = `--${resolve(projectPath).replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return join(getAgentDir(), "sessions", safe);
}

export function createTargetSessionPath(projectPath: string, targetId: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return join(projectSessionDir(projectPath), `${stamp}_${targetId}.jsonl`);
}

export async function findLatestProjectSession(projectPath: string) {
  const dir = projectSessionDir(projectPath);
  if (!existsSync(dir)) return undefined;
  const entries = await readdir(dir).catch(() => []);
  const files = entries.filter((entry) => entry.endsWith(".jsonl"));
  let latestPath: string | undefined;
  let latestMtime = -1;

  for (const file of files) {
    const full = join(dir, file);
    const info = await stat(full).catch(() => undefined);
    if (!info) continue;
    if (info.mtimeMs > latestMtime) {
      latestMtime = info.mtimeMs;
      latestPath = full;
    }
  }

  return latestPath;
}

export async function loadTarget(targetId: string) {
  const data = await readFile(targetFilePath(targetId), "utf8").catch(() => undefined);
  if (!data) return undefined;
  const parsed = parseJson<ControlTargetRecord>(data);
  if (!parsed?.targetId || !parsed.projectPath || !parsed.sessionPath || !parsed.name) return undefined;
  return parsed;
}

export async function saveTarget(target: ControlTargetRecord) {
  target.updatedAt = now();
  await writeJson(targetFilePath(target.targetId), target);
}

export async function deleteTarget(targetId: string) {
  await removeJson(targetFilePath(targetId));
}

export async function listTargets() {
  await ensureStorage();
  const files = (await readdir(TARGETS_DIR).catch(() => [])).filter((name) => name.endsWith(".json"));
  const targets: ControlTargetRecord[] = [];
  for (const file of files) {
    const target = await loadTarget(file.replace(/\.json$/, ""));
    if (target) targets.push(target);
  }
  targets.sort((left, right) => (right.lastSyncedAt ?? right.updatedAt) - (left.lastSyncedAt ?? left.updatedAt));
  return targets;
}

export async function findTargetBySessionPath(sessionPath: string) {
  const normalized = resolve(sessionPath);
  const targets = await listTargets();
  return targets.find((target) => resolve(target.sessionPath) === normalized);
}

export async function createManualTarget(projectPath: string, name?: string, sessionName?: string) {
  await assertProjectDirectory(projectPath);
  const targetId = createManualTargetId();
  const target: ControlTargetRecord = {
    targetId,
    name: name?.trim() || sessionName?.trim() || basename(projectPath),
    projectPath: resolve(projectPath),
    sessionPath: createTargetSessionPath(projectPath, targetId),
    sessionTitle: sessionName?.trim() || name?.trim() || basename(projectPath),
    source: "manual",
    createdAt: now(),
    updatedAt: now(),
  };
  await saveTarget(target);
  return target;
}

export async function linkExistingTarget(projectPath: string, sessionPath?: string, name?: string) {
  await assertProjectDirectory(projectPath);
  const resolvedSessionPath = sessionPath ? resolve(projectPath, sessionPath) : await findLatestProjectSession(projectPath);
  if (!resolvedSessionPath) {
    throw new Error(`No session found for project: ${projectPath}`);
  }

  const existing = await findTargetBySessionPath(resolvedSessionPath);
  if (existing) {
    const nextName = optionalString(name);
    if (nextName && nextName !== existing.name) {
      existing.name = nextName;
      existing.sessionTitle = nextName;
      await saveTarget(existing);
    }
    return existing;
  }

  const target: ControlTargetRecord = {
    targetId: createManualTargetId(),
    name: name?.trim() || basename(projectPath),
    projectPath: resolve(projectPath),
    sessionPath: resolve(resolvedSessionPath),
    sessionTitle: name?.trim() || basename(resolvedSessionPath, ".jsonl"),
    source: "manual",
    createdAt: now(),
    updatedAt: now(),
  };
  await saveTarget(target);
  return target;
}

export async function loadRun(runId: string) {
  const data = await readFile(runFilePath(runId), "utf8").catch(() => undefined);
  if (!data) return undefined;
  const parsed = parseJson<ControlRunRecord>(data);
  if (!parsed?.runId || !parsed.targetId || !parsed.projectPath || !parsed.sessionPath) return undefined;
  return parsed;
}

export async function saveRun(run: ControlRunRecord) {
  run.updatedAt = now();
  await writeJson(runFilePath(run.runId), run);
}

export async function listRuns(inMemoryRuns: Iterable<ControlRunRecord> = []) {
  await ensureStorage();
  const files = (await readdir(RUNS_DIR).catch(() => [])).filter((name) => name.endsWith(".json"));
  const runs: ControlRunRecord[] = [];

  for (const file of files) {
    const run = await loadRun(file.replace(/\.json$/, ""));
    if (run) runs.push(run);
  }

  for (const run of inMemoryRuns) {
    const index = runs.findIndex((candidate) => candidate.runId === run.runId);
    if (index >= 0) runs[index] = run;
    else runs.push(run);
  }

  runs.sort((left, right) => right.updatedAt - left.updatedAt);
  return runs;
}

export async function latestRunsByTarget(inMemoryRuns: Iterable<ControlRunRecord> = []) {
  const map = new Map<string, ControlRunRecord>();
  const runs = await listRuns(inMemoryRuns);
  for (const run of runs.sort((left, right) => right.startedAt - left.startedAt)) {
    if (!map.has(run.targetId)) {
      map.set(run.targetId, run);
    }
  }
  return map;
}

export async function upsertStudioTarget(
  projectId: string,
  projectName: string,
  projectPath: string,
  sessionPath: string,
  title: string,
  updatedAtMs: number,
) {
  const existing = await findTargetBySessionPath(sessionPath);
  const target: ControlTargetRecord = {
    targetId: existing?.targetId ?? createStudioTargetId(projectId, sessionPath),
    name: title,
    projectId,
    projectName,
    projectPath: resolve(projectPath),
    sessionPath: resolve(sessionPath),
    sessionTitle: title,
    source: "studio",
    createdAt: existing?.createdAt ?? now(),
    updatedAt: existing?.updatedAt ?? now(),
    lastRunId: existing?.lastRunId,
    lastError: existing?.lastError,
    lastSyncedAt: now(),
    threadUpdatedAtMs: updatedAtMs,
  };
  await saveTarget(target);
  return target;
}
