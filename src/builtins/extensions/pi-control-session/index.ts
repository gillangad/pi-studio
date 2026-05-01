import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { cancelRuns, getStatusRuns, startSendRun } from "./runtime";
import { createManualTarget, ensureStorage, linkExistingTarget, loadTarget, listTargets } from "./storage";
import { formatPairBlock, readLatestPair, readTargetTranscript } from "./transcript";
import { DEFAULT_TIMEOUT_SECONDS } from "./types";

const ControlParams = Type.Object({
  action: Type.Union([
    Type.Literal("list"),
    Type.Literal("new"),
    Type.Literal("link"),
    Type.Literal("send"),
    Type.Literal("status"),
    Type.Literal("cancel"),
    Type.Literal("latest"),
    Type.Literal("read"),
  ]),
  target_id: Type.Optional(Type.String()),
  target_ids: Type.Optional(Type.Array(Type.String())),
  project_path: Type.Optional(Type.String()),
  session_path: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  session_name: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.String()),
  timeout_seconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86400 })),
  model: Type.Optional(Type.String()),
  run_id: Type.Optional(Type.String()),
  run_ids: Type.Optional(Type.Array(Type.String())),
  changes_since: Type.Optional(Type.Number()),
  reason: Type.Optional(Type.String()),
  mode: Type.Optional(Type.Union([Type.Literal("full"), Type.Literal("since")])),
  after_entry_id: Type.Optional(Type.String()),
  after_timestamp: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 400 })),
  running_only: Type.Optional(Type.Boolean()),
});

function modelFromContext(ctx: ExtensionContext) {
  const model = (ctx as any).model;
  if (!model || typeof model !== "object") return undefined;
  if (typeof model.provider !== "string" || typeof model.id !== "string") return undefined;
  return `${model.provider}/${model.id}`;
}

function uniqueIds(values: Array<string | undefined> = []) {
  return [...new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0))];
}

function requireString(value: string | undefined, fieldName: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function formatTargetLines(targets: Array<{
  targetId: string;
  name: string;
  sessionPath: string;
  source: string;
}>) {
  if (targets.length === 0) {
    return "No control targets are registered yet.";
  }

  return targets
    .map((target) => `${target.targetId} | ${target.name} | ${target.source} | ${target.sessionPath}`)
    .join("\n");
}

export default function controlSessionExtension(pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    await ensureStorage();
  });

  pi.registerTool({
    name: "control",
    label: "Session Control",
    description: "Control and inspect other Pi Studio sessions.",
    parameters: ControlParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (params.action === "new") {
        const projectPath = params.project_path ?? ctx.cwd;
        const target = await createManualTarget(projectPath, params.name, params.session_name);
        return {
          content: [{ type: "text", text: `Created ${target.name} (${target.targetId}).` }],
          details: { action: params.action, target },
        };
      }

      if (params.action === "link") {
        const projectPath = params.project_path ?? ctx.cwd;
        const sessionPath = requireString(params.session_path, "session_path");
        const target = await linkExistingTarget(projectPath, sessionPath, params.name);
        return {
          content: [{ type: "text", text: `Linked ${target.name} (${target.targetId}).` }],
          details: { action: params.action, target },
        };
      }

      if (params.action === "send") {
        const targetId = requireString(params.target_id, "target_id");
        const prompt = requireString(params.prompt, "prompt");
        const target = await loadTarget(targetId);
        if (!target) {
          throw new Error(`Unknown target: ${targetId}`);
        }

        const run = await startSendRun(
          target,
          prompt,
          typeof params.timeout_seconds === "number"
            ? Math.max(1, Math.floor(params.timeout_seconds))
            : DEFAULT_TIMEOUT_SECONDS,
          params.model?.trim() || modelFromContext(ctx),
        );

        return {
          content: [{ type: "text", text: `Sent prompt to ${target.name} and started ${run.runId} (${run.state}).` }],
          details: { action: params.action, run, target },
        };
      }

      if (params.action === "status") {
        const runs = await getStatusRuns({
          runId: params.run_id,
          runIds: params.run_ids,
          targetId: params.target_id,
          targetIds: params.target_ids,
          changesSince: params.changes_since,
        });

        return {
          content: [
            {
              type: "text",
              text:
                runs.length === 0
                  ? "No matching runs."
                  : runs
                      .map(
                        (run) =>
                          `${run.runId} | ${run.targetName} | ${run.state} | updated=${new Date(run.updatedAt).toISOString()}`,
                      )
                      .join("\n"),
            },
          ],
          details: { action: params.action, runs, server_time: Date.now() },
        };
      }

      if (params.action === "cancel") {
        const result = await cancelRuns({
          runId: params.run_id,
          runIds: params.run_ids,
          targetId: params.target_id,
          targetIds: params.target_ids,
          reason: params.reason,
        });

        return {
          content: [
            {
              type: "text",
              text: [
                result.cancelled.length > 0
                  ? `Cancelled: ${result.cancelled.map((run) => `${run.runId} (${run.targetName})`).join(", ")}`
                  : "Cancelled: none",
                result.missing.length > 0 ? `Missing: ${result.missing.join(", ")}` : null,
              ]
                .filter(Boolean)
                .join("\n"),
            },
          ],
          details: { action: params.action, ...result },
        };
      }

      if (params.action === "latest") {
        const targetId = requireString(params.target_id, "target_id");
        const { target, latestPair } = await readLatestPair(targetId);
        const text = latestPair
          ? [
              `Target: ${target.name} (${target.targetId})`,
              `Prompt: ${latestPair.prompt.text}`,
              latestPair.response ? `Response: ${latestPair.response.text}` : "Response: [pending]",
            ].join("\n")
          : `Target ${target.name} has no prompt/response pairs yet.`;

        return {
          content: [{ type: "text", text }],
          details: { action: params.action, target, latest_pair: latestPair },
        };
      }

      if (params.action === "read") {
        const targetId = requireString(params.target_id, "target_id");
        const result = await readTargetTranscript(targetId, {
          mode: params.mode,
          afterEntryId: params.after_entry_id,
          afterTimestamp: params.after_timestamp,
          limit: params.limit,
        });

        return {
          content: [
            {
              type: "text",
              text:
                result.pairs.length === 0
                  ? `No matching transcript pairs for ${result.target.name}.`
                  : result.pairs.map((pair, index) => formatPairBlock(pair, index)).join("\n\n"),
            },
          ],
          details: {
            action: params.action,
            target: result.target,
            pairs: result.pairs,
            next_after_entry_id: result.nextAfterEntryId,
          },
        };
      }

      const targetIds = uniqueIds([params.target_id, ...(params.target_ids ?? [])]);
      const targets = await listTargets();
      const filtered = targetIds.length > 0 ? targets.filter((target) => targetIds.includes(target.targetId)) : targets;
      const visible = params.running_only
        ? filtered.filter((target) => typeof target.lastRunId === "string" && target.lastRunId.trim().length > 0)
        : filtered;

      return {
        content: [{ type: "text", text: formatTargetLines(visible) }],
        details: { action: params.action, targets: visible },
      };
    },
  });
}
