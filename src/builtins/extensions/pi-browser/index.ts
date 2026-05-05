import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

const BROWSER_RUNTIME_KEY = "__PI_STUDIO_BROWSER_RUNTIME__";
const BROWSER_BRIDGE_URL_ENV = "PI_STUDIO_BROWSER_BRIDGE_URL";
const BROWSER_BRIDGE_TOKEN_ENV = "PI_STUDIO_BROWSER_BRIDGE_TOKEN";

const BrowserParams = Type.Object({
  action: Type.Union([
    Type.Literal("navigate"),
    Type.Literal("back"),
    Type.Literal("forward"),
    Type.Literal("reload"),
    Type.Literal("state"),
    Type.Literal("snapshot"),
    Type.Literal("click"),
    Type.Literal("fill"),
    Type.Literal("type"),
    Type.Literal("press"),
    Type.Literal("wait"),
    Type.Literal("extract"),
    Type.Literal("screenshot"),
    Type.Literal("logs"),
    Type.Literal("clipboard_read"),
    Type.Literal("clipboard_write"),
  ]),
  session_file: Type.Optional(Type.String()),
  url: Type.Optional(Type.String()),
  selector: Type.Optional(Type.String()),
  text: Type.Optional(Type.String()),
  key: Type.Optional(Type.String()),
  attribute: Type.Optional(Type.String()),
  extract_mode: Type.Optional(
    Type.Union([
      Type.Literal("text"),
      Type.Literal("html"),
      Type.Literal("value"),
      Type.Literal("attribute"),
    ]),
  ),
  wait_for: Type.Optional(
    Type.Union([Type.Literal("load"), Type.Literal("selector"), Type.Literal("url")]),
  ),
  timeout_ms: Type.Optional(Type.Integer({ minimum: 250, maximum: 120000 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
});

type BrowserRuntime = {
  setSessionName(name: string): void;
  performAction(request: {
    action: string;
    sessionFile?: string;
    url?: string;
    selector?: string;
    text?: string;
    key?: string;
    attribute?: string;
    extractMode?: "text" | "html" | "value" | "attribute";
    waitFor?: "load" | "selector" | "url";
    timeoutMs?: number;
    limit?: number;
  }): Promise<any>;
};

function ensureToolActive(pi: ExtensionAPI, toolName: string) {
  const active = pi.getActiveTools();
  if (active.includes(toolName)) {
    return;
  }

  pi.setActiveTools([...active, toolName]);
}

function getBrowserRuntime() {
  const runtime = (globalThis as Record<string, unknown>)[BROWSER_RUNTIME_KEY];
  if (runtime && typeof runtime === "object") {
    return runtime as BrowserRuntime;
  }

  const bridgeUrl = process.env[BROWSER_BRIDGE_URL_ENV];
  const bridgeToken = process.env[BROWSER_BRIDGE_TOKEN_ENV];
  if (!bridgeUrl || !bridgeToken) {
    throw new Error("Pi Studio browser runtime is unavailable.");
  }

  const bridgeCall = async (method: string, args: unknown[]) => {
    const response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pi-studio-browser-token": bridgeToken,
      },
      body: JSON.stringify({ method, args }),
    });

    const payload = (await response.json()) as { ok?: boolean; result?: unknown; error?: string };
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "Pi Studio browser bridge request failed.");
    }

    return payload.result;
  };

  return {
    setSessionName(name: string) {
      return bridgeCall("setSessionName", [name]) as Promise<void>;
    },
    performAction(request) {
      return bridgeCall("performAction", [request]);
    },
  } as BrowserRuntime;
}

function sessionFileFromContext(ctx: ExtensionContext) {
  const explicit = ctx.sessionManager?.getSessionFile?.();
  return typeof explicit === "string" && explicit.trim().length > 0 ? explicit : undefined;
}

function formatBindingSummary(result: any) {
  return [
    `Session: ${result.sessionFile}`,
    `Title: ${result.title || "(untitled)"}`,
    `URL: ${result.url || "(none)"}`,
    `Back: ${result.canGoBack ? "yes" : "no"}`,
    `Forward: ${result.canGoForward ? "yes" : "no"}`,
    `Loading: ${result.isLoading ? "yes" : "no"}`,
  ].join("\n");
}

function formatSnapshot(result: any) {
  const snapshot = result.snapshot ?? {};
  const elements = Array.isArray(snapshot.elements) ? snapshot.elements : [];
  const lines = elements.slice(0, 20).map((element: any, index: number) => {
    const parts = [
      `${index + 1}. ${element.tag || "node"}`,
      element.selector ? `selector=${element.selector}` : null,
      element.text ? `text=${JSON.stringify(element.text)}` : null,
      element.placeholder ? `placeholder=${JSON.stringify(element.placeholder)}` : null,
      element.href ? `href=${element.href}` : null,
      element.value ? `value=${JSON.stringify(element.value)}` : null,
    ].filter(Boolean);
    return parts.join(" | ");
  });

  return [
    formatBindingSummary(result),
    "",
    `Page text: ${JSON.stringify(String(snapshot.text ?? ""))}`,
    "",
    lines.length > 0 ? "Interactive elements:" : "Interactive elements: none found.",
    ...lines,
  ].join("\n");
}

function formatLogs(result: any) {
  const logs = Array.isArray(result.logs) ? result.logs : [];
  if (logs.length === 0) {
    return `${formatBindingSummary(result)}\n\nNo browser console messages captured yet.`;
  }

  return [
    formatBindingSummary(result),
    "",
    ...logs.map(
      (entry: any) =>
        `[${entry.timestamp}] ${String(entry.level || "log").toUpperCase()} ${entry.message}` +
        (entry.sourceId ? ` (${entry.sourceId}:${entry.line ?? 0})` : ""),
    ),
  ].join("\n");
}

function formatActionResult(action: string, result: any) {
  if (action === "snapshot") {
    return formatSnapshot(result);
  }

  if (action === "logs") {
    return formatLogs(result);
  }

  if (action === "extract") {
    return `${formatBindingSummary(result)}\n\nExtracted value:\n${String(result.result?.value ?? "")}`;
  }

  if (action === "screenshot") {
    return [
      formatBindingSummary(result),
      "",
      `Captured screenshot ${result.screenshot?.width ?? "?"}x${result.screenshot?.height ?? "?"}.`,
    ].join("\n");
  }

  if (action === "clipboard_read") {
    return `${formatBindingSummary(result)}\n\nClipboard:\n${String(result.text ?? "")}`;
  }

  if (action === "clipboard_write") {
    return `${formatBindingSummary(result)}\n\nWrote text to the browser clipboard.`;
  }

  if (result?.result && typeof result.result === "object") {
    const message = result.result.value ?? result.result.text ?? result.result.url ?? result.result.key ?? "Action completed.";
    return `${formatBindingSummary(result)}\n\n${String(message)}`;
  }

  return formatBindingSummary(result);
}

function assertActionSucceeded(result: any) {
  if (result?.result && typeof result.result === "object" && result.result.ok === false) {
    throw new Error(String(result.result.error || "Browser action failed."));
  }
}

export default function browserExtension(pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    ensureToolActive(pi, "browser");
  });

  pi.registerTool({
    name: "browser",
    label: "Browser",
    description: "Control the live Pi Studio browser panel for this thread.",
    parameters: BrowserParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const runtime = getBrowserRuntime();
      await runtime.setSessionName("pi-browser");

      const result = await runtime.performAction({
        action: params.action,
        sessionFile: params.session_file?.trim() || sessionFileFromContext(ctx),
        url: params.url,
        selector: params.selector,
        text: params.text,
        key: params.key,
        attribute: params.attribute,
        extractMode: params.extract_mode,
        waitFor: params.wait_for,
        timeoutMs: params.timeout_ms,
        limit: params.limit,
      });

      assertActionSucceeded(result);

      return {
        content: [{ type: "text", text: formatActionResult(params.action, result) }],
        details: result,
      };
    },
  });
}
