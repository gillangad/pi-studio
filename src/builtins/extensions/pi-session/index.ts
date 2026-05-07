import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  PI_STUDIO_SESSION_RUNTIME_KEY,
  type SessionRuntime,
  type SessionToolRequest,
} from "../../../pi-host/session-extension-runtime";

const SessionParams = Type.Object({
  action: Type.Union([
    Type.Literal("list"),
    Type.Literal("create"),
    Type.Literal("send"),
    Type.Literal("status"),
    Type.Literal("close"),
  ]),
  target_session_id: Type.Optional(Type.String()),
  prompt: Type.Optional(Type.String()),
  title: Type.Optional(Type.String()),
});

function getSessionRuntime() {
  const runtime = (globalThis as Record<string, unknown>)[PI_STUDIO_SESSION_RUNTIME_KEY];
  if (runtime && typeof runtime === "object") {
    return runtime as SessionRuntime;
  }

  throw new Error("Pi Studio session runtime is unavailable.");
}

function ensureToolActive(pi: ExtensionAPI, toolName: string) {
  const active = pi.getActiveTools();
  if (active.includes(toolName)) {
    return;
  }

  pi.setActiveTools([...active, toolName]);
}

function ensureToolInactive(pi: ExtensionAPI, toolName: string) {
  const active = pi.getActiveTools();
  if (!active.includes(toolName)) {
    return;
  }

  pi.setActiveTools(active.filter((entry) => entry !== toolName));
}

function sessionFileFromContext(ctx: ExtensionContext) {
  const explicit = ctx.sessionManager?.getSessionFile?.();
  return typeof explicit === "string" && explicit.trim().length > 0 ? explicit : undefined;
}

function formatSessionList(result: Awaited<ReturnType<SessionRuntime["performAction"]>>) {
  const sessions = Array.isArray(result.sessions) ? result.sessions : [];
  if (sessions.length === 0) {
    return "No worker sessions are open right now.";
  }

  return [
    result.message,
    "",
    ...sessions.map((session) => `- ${session.sessionId}: ${session.title} [${session.status}]`),
  ].join("\n");
}

function formatActionResult(result: Awaited<ReturnType<SessionRuntime["performAction"]>>) {
  if (result.action === "list" || (result.action === "status" && result.sessions)) {
    return formatSessionList(result);
  }

  return result.message;
}

export default function sessionExtension(pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    const runtime = getSessionRuntime();
    const sessionFile = sessionFileFromContext(ctx);

    if (runtime.isControllerSession(sessionFile)) {
      ensureToolActive(pi, "session");
      return;
    }

    ensureToolInactive(pi, "session");
  });

  pi.registerTool({
    name: "session",
    label: "Session",
    description: "Create, inspect, message, and close Pi Studio worker sessions.",
    promptSnippet:
      "Manage Pi Studio worker sessions. Use this when you need to create a worker, delegate a task, inspect session state, or close one.",
    parameters: SessionParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = getSessionRuntime();
      const sessionFile = sessionFileFromContext(ctx);
      if (!runtime.isControllerSession(sessionFile)) {
        throw new Error("The session tool is only available from the Pi Studio controller session.");
      }

      const request: SessionToolRequest = {
        action: params.action,
        targetSessionId: params.target_session_id?.trim() || undefined,
        prompt: params.prompt?.trim() || undefined,
        title: params.title?.trim() || undefined,
      };

      const result = await runtime.performAction(request);

      return {
        content: [{ type: "text", text: formatActionResult(result) }],
        details: result,
      };
    },
  });
}
