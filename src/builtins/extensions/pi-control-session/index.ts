import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { createManualTarget, ensureStorage, linkExistingTarget, loadTarget, listTargets } from "./storage";
import { formatPairBlock, readLatestPair, readTargetTranscript } from "./transcript";
import { cancelRuns, getStatusRuns, startSendRun } from "./runtime";
import { buildMasterContext, formatTargetListText } from "./sync";
import { DEFAULT_TIMEOUT_SECONDS } from "./types";

const ControlTargetParams = Type.Object({
  action: Type.Optional(Type.Union([Type.Literal("list"), Type.Literal("new"), Type.Literal("link")])),
  target_id: Type.Optional(Type.String()),
  target_ids: Type.Optional(Type.Array(Type.String())),
  project_path: Type.Optional(Type.String()),
  session_path: Type.Optional(Type.String()),
  name: Type.Optional(Type.String()),
  session_name: Type.Optional(Type.String()),
  running_only: Type.Optional(Type.Boolean()),
});

const SendParams = Type.Object({
  target_id: Type.String(),
  prompt: Type.String(),
  timeout_seconds: Type.Optional(Type.Integer({ minimum: 1, maximum: 86400 })),
  model: Type.Optional(Type.String()),
});

const StatusParams = Type.Object({
  run_id: Type.Optional(Type.String()),
  run_ids: Type.Optional(Type.Array(Type.String())),
  target_id: Type.Optional(Type.String()),
  target_ids: Type.Optional(Type.Array(Type.String())),
  changes_since: Type.Optional(Type.Number()),
});

const CancelParams = Type.Object({
  run_id: Type.Optional(Type.String()),
  run_ids: Type.Optional(Type.Array(Type.String())),
  target_id: Type.Optional(Type.String()),
  target_ids: Type.Optional(Type.Array(Type.String())),
  reason: Type.Optional(Type.String()),
});

const LatestParams = Type.Object({
  target_id: Type.String(),
});

const ReadParams = Type.Object({
  target_id: Type.String(),
  mode: Type.Optional(Type.Union([Type.Literal("full"), Type.Literal("since")], { default: "full" })),
  after_entry_id: Type.Optional(Type.String()),
  after_timestamp: Type.Optional(Type.Number()),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 400 })),
});

function modelFromContext(ctx: ExtensionContext) {
  const model = (ctx as any).model;
  if (!model || typeof model !== "object") return undefined;
  if (typeof model.provider !== "string" || typeof model.id !== "string") return undefined;
  return `${model.provider}/${model.id}`;
}

export default function controlSessionExtension(pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    await ensureStorage();
  });

  pi.on("before_agent_start", async (event) => {
    const contextBlock = await buildMasterContext();
    return {
      systemPrompt: [event.systemPrompt, "", contextBlock].join("\n"),
    };
  });

  pi.registerTool({
    name: "control_target",
    label: "Control target",
    description: "List managed servant sessions, or create/link control targets.",
    parameters: ControlTargetParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const action = params.action ?? "list";
      if (action === "new") {
        const projectPath = params.project_path ?? ctx.cwd;
        const target = await createManualTarget(projectPath, params.name, params.session_name);
        return {
          content: [{ type: "text", text: `Created target ${target.name} (${target.targetId}) in ${target.projectPath}.` }],
          details: { action, target },
        };
      }

      if (action === "link") {
        const projectPath = params.project_path ?? ctx.cwd;
        const target = await linkExistingTarget(projectPath, params.session_path, params.name);
        return {
          content: [{ type: "text", text: `Linked target ${target.name} (${target.targetId}) to ${target.sessionPath}.` }],
          details: { action, target },
        };
      }

      const targetIds = [params.target_id, ...(params.target_ids ?? [])].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      const targets = await listTargets();
      const filtered = targetIds.length > 0 ? targets.filter((target) => targetIds.includes(target.targetId)) : targets;

      return {
        content: [{ type: "text", text: await formatTargetListText(targetIds) }],
        details: { action, targets: filtered },
      };
    },
  });

  pi.registerTool({
    name: "control_send",
    label: "Control send",
    description: "Append a real user-role prompt to a servant session and let it run.",
    parameters: SendParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const target = await loadTarget(params.target_id);
      if (!target) throw new Error(`Unknown target: ${params.target_id}`);
      const run = await startSendRun(
        target,
        params.prompt,
        typeof params.timeout_seconds === "number" ? Math.max(1, Math.floor(params.timeout_seconds)) : DEFAULT_TIMEOUT_SECONDS,
        params.model?.trim() || modelFromContext(ctx),
      );

      return {
        content: [{ type: "text", text: `Sent prompt to ${target.name} and started ${run.runId} (${run.state}).` }],
        details: { run, target },
      };
    },
  });

  pi.registerTool({
    name: "control_status",
    label: "Control status",
    description: "Inspect servant run states.",
    parameters: StatusParams,
    async execute(_toolCallId, params) {
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
                : runs.map((run) => `${run.runId} | ${run.targetName} | ${run.state} | updated=${new Date(run.updatedAt).toISOString()}`).join("\n"),
          },
        ],
        details: { runs, server_time: Date.now() },
      };
    },
  });

  pi.registerTool({
    name: "control_cancel",
    label: "Control cancel",
    description: "Cancel active servant runs.",
    parameters: CancelParams,
    async execute(_toolCallId, params) {
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
              result.cancelled.length > 0 ? `Cancelled: ${result.cancelled.map((run) => `${run.runId} (${run.targetName})`).join(", ")}` : "Cancelled: none",
              result.missing.length > 0 ? `Missing: ${result.missing.join(", ")}` : null,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "control_latest",
    label: "Control latest",
    description: "Return the latest prompt/response pair for a servant session.",
    parameters: LatestParams,
    async execute(_toolCallId, params) {
      const { target, latestPair } = await readLatestPair(params.target_id);
      const text = latestPair
        ? [
            `Target: ${target.name} (${target.targetId})`,
            `Prompt: ${latestPair.prompt.text}`,
            latestPair.response ? `Response: ${latestPair.response.text}` : "Response: [pending]",
          ].join("\n")
        : `Target ${target.name} has no prompt/response pairs yet.`;

      return {
        content: [{ type: "text", text }],
        details: { target, latest_pair: latestPair },
      };
    },
  });

  pi.registerTool({
    name: "control_read",
    label: "Control read",
    description: "Read the servant transcript more deeply, either full or since a cursor.",
    parameters: ReadParams,
    async execute(_toolCallId, params) {
      const result = await readTargetTranscript(params.target_id, {
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
          target: result.target,
          pairs: result.pairs,
          next_after_entry_id: result.nextAfterEntryId,
        },
      };
    },
  });
}
