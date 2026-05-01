import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { clipboard, webContents } from "electron";

export const PI_STUDIO_BROWSER_RUNTIME_KEY = "__PI_STUDIO_BROWSER_RUNTIME__";
export const PI_STUDIO_BROWSER_BRIDGE_URL_ENV = "PI_STUDIO_BROWSER_BRIDGE_URL";
export const PI_STUDIO_BROWSER_BRIDGE_TOKEN_ENV = "PI_STUDIO_BROWSER_BRIDGE_TOKEN";

export type BrowserToolAction =
  | "navigate"
  | "back"
  | "forward"
  | "reload"
  | "state"
  | "snapshot"
  | "click"
  | "fill"
  | "type"
  | "press"
  | "wait"
  | "extract"
  | "screenshot"
  | "logs"
  | "clipboard_read"
  | "clipboard_write";

export type BrowserToolRequest = {
  action: BrowserToolAction;
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
};

export type BrowserConsoleEntry = {
  level: "log" | "warning" | "error";
  message: string;
  sourceId: string;
  line: number;
  timestamp: string;
};

type BrowserBinding = {
  sessionFile: string;
  webContentsId: number;
  lastKnownUrl: string;
  lastKnownTitle: string;
  updatedAt: number;
  logs: BrowserConsoleEntry[];
};

type BoundWebContents = ReturnType<typeof webContents.fromId>;

type DebuggerLike = {
  isAttached(): boolean;
  attach(version: string): void;
  sendCommand(method: string, params?: Record<string, unknown>): Promise<any>;
};

type BrowserContentsLike = {
  id: number;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  goBack(): void;
  goForward(): void;
  reload(): void;
  loadURL(url: string): Promise<void>;
  capturePage(): Promise<{ toPNG(): Buffer; getSize(): { width: number; height: number } }>;
  isDestroyed(): boolean;
  isLoading(): boolean;
  isLoadingMainFrame?(): boolean;
  debugger: DebuggerLike;
  on(event: "console-message", listener: (...args: any[]) => void): BrowserContentsLike;
  removeListener(event: "console-message", listener: (...args: any[]) => void): BrowserContentsLike;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_LOGS_PER_BINDING = 80;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("A browser URL is required.");
  }

  if (/^[a-zA-Z][a-zA-Z0-9+\-.]*:/.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function nowIsoString() {
  return new Date().toISOString();
}

function clampLimit(limit: number | undefined, fallback: number, max: number) {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(limit)));
}

function coerceConsoleLevel(level: number) {
  if (level >= 2) {
    return "error" as const;
  }

  if (level >= 1) {
    return "warning" as const;
  }

  return "log" as const;
}

function buildSnapshotExpression(limit: number) {
  return `(() => {
    const MAX_ELEMENTS = ${limit};
    const selectors = new Set();
    const toSelector = (element) => {
      if (!(element instanceof Element)) return null;
      if (element.id) return "#" + CSS.escape(element.id);
      const testId = element.getAttribute("data-testid") || element.getAttribute("data-test-id");
      if (testId) return '[data-testid="' + testId.replace(/"/g, '\\\\\\"') + '"]';
      const name = element.getAttribute("name");
      if (name) return element.tagName.toLowerCase() + '[name="' + name.replace(/"/g, '\\\\\\"') + '"]';
      const role = element.getAttribute("role");
      if (role) return '[role="' + role.replace(/"/g, '\\\\\\"') + '"]';
      return element.tagName.toLowerCase();
    };
    const textFor = (element) => (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 140);
    const valueFor = (element) => {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return String(element.value || "").slice(0, 140);
      }
      return "";
    };
    const elements = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [contenteditable="true"]'))
      .filter((element) => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .slice(0, MAX_ELEMENTS)
      .map((element) => {
        const selector = toSelector(element);
        if (selector) selectors.add(selector);
        return {
          selector,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          text: textFor(element),
          placeholder: element.getAttribute("placeholder"),
          href: element instanceof HTMLAnchorElement ? element.href : null,
          value: valueFor(element),
          disabled: "disabled" in element ? Boolean(element.disabled) : false,
        };
      });
    const active = document.activeElement instanceof HTMLElement ? {
      tag: document.activeElement.tagName.toLowerCase(),
      selector: toSelector(document.activeElement),
      text: textFor(document.activeElement),
      value: valueFor(document.activeElement),
    } : null;
    return {
      title: document.title,
      url: location.href,
      activeElement: active,
      text: (document.body?.innerText || "").replace(/\\s+/g, " ").trim().slice(0, 2000),
      elements,
      selectorHints: Array.from(selectors).slice(0, MAX_ELEMENTS),
    };
  })()`;
}

function buildClickExpression(selector: string) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      return { ok: false, error: "No element matched selector.", selector };
    }
    element.scrollIntoView({ block: "center", inline: "center" });
    element.focus();
    element.click();
    return {
      ok: true,
      selector,
      tag: element.tagName.toLowerCase(),
      text: (element.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 140),
      url: location.href,
    };
  })()`;
}

function buildFillExpression(selector: string, text: string, append: boolean) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const text = ${JSON.stringify(text)};
    const append = ${append ? "true" : "false"};
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      return { ok: false, error: "No element matched selector.", selector };
    }

    const dispatch = () => {
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    };

    element.focus();
    element.scrollIntoView({ block: "center", inline: "center" });

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = append ? (element.value + text) : text;
      dispatch();
      return { ok: true, selector, value: element.value };
    }

    if (element instanceof HTMLSelectElement) {
      element.value = text;
      dispatch();
      return { ok: true, selector, value: element.value };
    }

    if (element.isContentEditable) {
      const nextValue = append ? ((element.textContent || "") + text) : text;
      element.textContent = nextValue;
      dispatch();
      return { ok: true, selector, value: nextValue };
    }

    return { ok: false, error: "Target is not fillable.", selector, tag: element.tagName.toLowerCase() };
  })()`;
}

function buildPressExpression(selector: string | undefined, key: string) {
  return `(() => {
    const selector = ${JSON.stringify(selector ?? "")};
    const rawKey = ${JSON.stringify(key)};
    const normalizedKey = rawKey === "Space" ? " " : rawKey;
    const target = selector ? document.querySelector(selector) : document.activeElement;
    if (!(target instanceof HTMLElement)) {
      return { ok: false, error: "No focused element or selector target available.", selector };
    }

    target.focus();
    target.scrollIntoView({ block: "center", inline: "center" });

    const eventInit = { key: rawKey, bubbles: true, cancelable: true };
    target.dispatchEvent(new KeyboardEvent("keydown", eventInit));
    target.dispatchEvent(new KeyboardEvent("keypress", eventInit));

    const canInsert = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
    if (canInsert) {
      if ((rawKey === "Backspace") && (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) {
        target.value = target.value.slice(0, -1);
      } else if (normalizedKey.length === 1) {
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          target.value += normalizedKey;
        } else if (target.isContentEditable) {
          target.textContent = (target.textContent || "") + normalizedKey;
        }
      } else if (rawKey === "Enter" && target instanceof HTMLTextAreaElement) {
        target.value += "\\n";
      }

      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
    }

    target.dispatchEvent(new KeyboardEvent("keyup", eventInit));
    return { ok: true, selector: selector || null, key: rawKey };
  })()`;
}

function buildExtractExpression(selector: string, extractMode: "text" | "html" | "value" | "attribute", attribute: string | undefined) {
  return `(() => {
    const selector = ${JSON.stringify(selector)};
    const attribute = ${JSON.stringify(attribute ?? "")};
    const extractMode = ${JSON.stringify(extractMode)};
    const element = document.querySelector(selector);
    if (!(element instanceof HTMLElement)) {
      return { ok: false, error: "No element matched selector.", selector };
    }

    if (extractMode === "html") {
      return { ok: true, selector, value: element.innerHTML };
    }

    if (extractMode === "value") {
      if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
        return { ok: true, selector, value: element.value };
      }

      return { ok: true, selector, value: element.textContent || "" };
    }

    if (extractMode === "attribute") {
      return { ok: true, selector, attribute, value: element.getAttribute(attribute) };
    }

    return { ok: true, selector, value: (element.textContent || "").replace(/\\s+/g, " ").trim() };
  })()`;
}

function buildSelectorCheckExpression(selector: string) {
  return `(() => Boolean(document.querySelector(${JSON.stringify(selector)})))()`;
}

export class BrowserRuntime {
  private readonly bindings = new Map<string, BrowserBinding>();
  private readonly sessionsByWebContentsId = new Map<number, Set<string>>();
  private readonly listenersByWebContentsId = new Map<number, (...args: any[]) => void>();
  private readonly bridgeToken = randomUUID();
  private readonly bridgeServer: Server;
  private readonly bridgeReady: Promise<void>;
  private sessionName = "browser";

  constructor() {
    this.bridgeServer = createServer((request, response) => {
      void this.handleBridgeRequest(request, response);
    });
    this.bridgeReady = new Promise((resolve, reject) => {
      this.bridgeServer.once("error", reject);
      this.bridgeServer.listen(0, "127.0.0.1", () => {
        this.bridgeServer.off("error", reject);
        const address = this.bridgeServer.address();
        if (!address || typeof address === "string") {
          reject(new Error("Pi Studio browser bridge failed to bind."));
          return;
        }

        process.env[PI_STUDIO_BROWSER_BRIDGE_URL_ENV] = `http://127.0.0.1:${(address as AddressInfo).port}`;
        process.env[PI_STUDIO_BROWSER_BRIDGE_TOKEN_ENV] = this.bridgeToken;
        resolve();
      });
    });

    (globalThis as Record<string, unknown>)[PI_STUDIO_BROWSER_RUNTIME_KEY] = this;
  }

  async whenReady() {
    await this.bridgeReady;
  }

  dispose() {
    for (const [webContentsId, listener] of this.listenersByWebContentsId.entries()) {
      const contents = this.resolveWebContentsById(webContentsId);
      contents?.removeListener("console-message", listener);
    }

    this.listenersByWebContentsId.clear();
    this.sessionsByWebContentsId.clear();
    this.bindings.clear();
    this.bridgeServer.close();
    delete process.env[PI_STUDIO_BROWSER_BRIDGE_URL_ENV];
    delete process.env[PI_STUDIO_BROWSER_BRIDGE_TOKEN_ENV];
    delete (globalThis as Record<string, unknown>)[PI_STUDIO_BROWSER_RUNTIME_KEY];
  }

  setSessionName(name: string) {
    if (name.trim()) {
      this.sessionName = name.trim();
    }
  }

  getSessionName() {
    return this.sessionName;
  }

  bindSurface(sessionFile: string, webContentsId: number, metadata?: { url?: string; title?: string }) {
    const normalizedSessionFile = sessionFile.trim();
    if (!normalizedSessionFile) {
      throw new Error("A session file is required to bind the browser surface.");
    }

    const contents = this.resolveLiveWebContents(webContentsId);
    const binding: BrowserBinding = {
      sessionFile: normalizedSessionFile,
      webContentsId,
      lastKnownUrl: metadata?.url?.trim() || contents.getURL() || "",
      lastKnownTitle: metadata?.title?.trim() || contents.getTitle() || "",
      updatedAt: Date.now(),
      logs: this.bindings.get(normalizedSessionFile)?.logs ?? [],
    };

    this.bindings.set(normalizedSessionFile, binding);
    const sessions = this.sessionsByWebContentsId.get(webContentsId) ?? new Set<string>();
    sessions.add(normalizedSessionFile);
    this.sessionsByWebContentsId.set(webContentsId, sessions);
    this.ensureConsoleListener(contents);

    return this.describeBinding(binding, contents);
  }

  clearSurfaceBinding(sessionFile: string) {
    const binding = this.bindings.get(sessionFile);
    if (!binding) {
      return false;
    }

    this.bindings.delete(sessionFile);
    const sessions = this.sessionsByWebContentsId.get(binding.webContentsId);
    sessions?.delete(sessionFile);
    if (sessions && sessions.size === 0) {
      this.detachConsoleListener(binding.webContentsId);
      this.sessionsByWebContentsId.delete(binding.webContentsId);
    }

    return true;
  }

  listBindings() {
    return Array.from(this.bindings.values())
      .sort((left, right) => right.updatedAt - left.updatedAt)
      .map((binding) => {
        const contents = this.resolveWebContentsById(binding.webContentsId);
        return this.describeBinding(binding, contents);
      });
  }

  getLatestBoundSessionFile() {
    return this.listBindings()[0]?.sessionFile ?? null;
  }

  async performAction(request: BrowserToolRequest) {
    const timeoutMs = Math.max(250, Math.floor(request.timeoutMs ?? DEFAULT_TIMEOUT_MS));
    const binding = this.resolveBinding(request.sessionFile);
    const contents = this.resolveLiveWebContents(binding.webContentsId);

    binding.lastKnownUrl = contents.getURL() || binding.lastKnownUrl;
    binding.lastKnownTitle = contents.getTitle() || binding.lastKnownTitle;
    binding.updatedAt = Date.now();

    switch (request.action) {
      case "navigate": {
        const url = normalizeBrowserUrl(request.url ?? "");
        await contents.loadURL(url);
        return this.describeBinding(binding, contents);
      }
      case "back": {
        if (!contents.canGoBack()) {
          return { ...this.describeBinding(binding, contents), changed: false };
        }

        contents.goBack();
        await this.waitForLoad(contents, timeoutMs);
        return this.describeBinding(binding, contents);
      }
      case "forward": {
        if (!contents.canGoForward()) {
          return { ...this.describeBinding(binding, contents), changed: false };
        }

        contents.goForward();
        await this.waitForLoad(contents, timeoutMs);
        return this.describeBinding(binding, contents);
      }
      case "reload": {
        contents.reload();
        await this.waitForLoad(contents, timeoutMs);
        return this.describeBinding(binding, contents);
      }
      case "state": {
        return this.describeBinding(binding, contents);
      }
      case "snapshot": {
        const limit = clampLimit(request.limit, 20, 80);
        const snapshot = await this.evaluateJson(contents, buildSnapshotExpression(limit));
        return {
          ...this.describeBinding(binding, contents),
          snapshot,
        };
      }
      case "click": {
        if (!request.selector?.trim()) {
          throw new Error("A selector is required for browser click.");
        }

        const result = await this.evaluateJson(contents, buildClickExpression(request.selector));
        return {
          ...this.describeBinding(binding, contents),
          result,
        };
      }
      case "fill": {
        if (!request.selector?.trim()) {
          throw new Error("A selector is required for browser fill.");
        }

        const result = await this.evaluateJson(contents, buildFillExpression(request.selector, request.text ?? "", false));
        return {
          ...this.describeBinding(binding, contents),
          result,
        };
      }
      case "type": {
        if (!request.selector?.trim()) {
          throw new Error("A selector is required for browser type.");
        }

        const result = await this.evaluateJson(contents, buildFillExpression(request.selector, request.text ?? "", true));
        return {
          ...this.describeBinding(binding, contents),
          result,
        };
      }
      case "press": {
        if (!request.key?.trim()) {
          throw new Error("A key is required for browser press.");
        }

        const result = await this.evaluateJson(contents, buildPressExpression(request.selector?.trim(), request.key.trim()));
        return {
          ...this.describeBinding(binding, contents),
          result,
        };
      }
      case "wait": {
        const waitFor = request.waitFor ?? (request.selector ? "selector" : request.url ? "url" : "load");
        if (waitFor === "selector") {
          if (!request.selector?.trim()) {
            throw new Error("A selector is required when waiting for a selector.");
          }

          await this.waitForCondition(timeoutMs, async () => {
            const matched = await this.evaluateJson<boolean>(contents, buildSelectorCheckExpression(request.selector!));
            return Boolean(matched);
          });
        } else if (waitFor === "url") {
          const url = normalizeBrowserUrl(request.url ?? "");
          await this.waitForCondition(timeoutMs, async () => {
            const currentUrl = contents.getURL();
            return currentUrl === url || currentUrl.startsWith(url);
          });
        } else {
          await this.waitForLoad(contents, timeoutMs);
        }

        return this.describeBinding(binding, contents);
      }
      case "extract": {
        if (!request.selector?.trim()) {
          throw new Error("A selector is required for browser extract.");
        }

        const extractMode = request.extractMode ?? (request.attribute ? "attribute" : "text");
        const result = await this.evaluateJson(
          contents,
          buildExtractExpression(request.selector, extractMode, request.attribute),
        );
        return {
          ...this.describeBinding(binding, contents),
          result,
        };
      }
      case "screenshot": {
        const image = await contents.capturePage();
        const size = image.getSize();
        return {
          ...this.describeBinding(binding, contents),
          screenshot: {
            mimeType: "image/png",
            width: size.width,
            height: size.height,
            base64: image.toPNG().toString("base64"),
          },
        };
      }
      case "logs": {
        const limit = clampLimit(request.limit, 20, MAX_LOGS_PER_BINDING);
        return {
          ...this.describeBinding(binding, contents),
          logs: binding.logs.slice(-limit),
        };
      }
      case "clipboard_read": {
        return {
          ...this.describeBinding(binding, contents),
          text: clipboard.readText(),
        };
      }
      case "clipboard_write": {
        clipboard.writeText(request.text ?? "");
        return {
          ...this.describeBinding(binding, contents),
          text: request.text ?? "",
        };
      }
      default: {
        throw new Error(`Unsupported browser action: ${request.action}`);
      }
    }
  }

  private resolveBinding(sessionFile?: string) {
    if (typeof sessionFile === "string" && sessionFile.trim()) {
      const direct = this.bindings.get(sessionFile.trim());
      if (!direct) {
        throw new Error(`No live browser is bound to ${sessionFile.trim()}. Open the browser panel for that thread first.`);
      }

      return direct;
    }

    const latest = Array.from(this.bindings.values()).sort((left, right) => right.updatedAt - left.updatedAt)[0];
    if (!latest) {
      throw new Error("No live browser is bound to any Pi Studio thread yet. Open the browser panel first.");
    }

    return latest;
  }

  private resolveWebContentsById(webContentsId: number) {
    try {
      return webContents.fromId(webContentsId) as BoundWebContents | undefined;
    } catch {
      return undefined;
    }
  }

  private resolveLiveWebContents(webContentsId: number) {
    const contents = this.resolveWebContentsById(webContentsId);
    if (!contents || contents.isDestroyed()) {
      throw new Error("The bound browser surface is no longer available.");
    }

    return contents as BrowserContentsLike;
  }

  private ensureConsoleListener(contents: BrowserContentsLike) {
    if (this.listenersByWebContentsId.has(contents.id)) {
      return;
    }

    const listener = (_event: unknown, level: number, message: string, line: number, sourceId: string) => {
      const sessions = this.sessionsByWebContentsId.get(contents.id);
      if (!sessions || sessions.size === 0) {
        return;
      }

      for (const sessionFile of sessions) {
        const binding = this.bindings.get(sessionFile);
        if (!binding) continue;

        binding.logs.push({
          level: coerceConsoleLevel(level),
          message,
          sourceId,
          line,
          timestamp: nowIsoString(),
        });

        if (binding.logs.length > MAX_LOGS_PER_BINDING) {
          binding.logs.splice(0, binding.logs.length - MAX_LOGS_PER_BINDING);
        }
      }
    };

    contents.on("console-message", listener);
    this.listenersByWebContentsId.set(contents.id, listener);
  }

  private detachConsoleListener(webContentsId: number) {
    const listener = this.listenersByWebContentsId.get(webContentsId);
    if (!listener) {
      return;
    }

    const contents = this.resolveWebContentsById(webContentsId);
    contents?.removeListener("console-message", listener);
    this.listenersByWebContentsId.delete(webContentsId);
  }

  private describeBinding(binding: BrowserBinding, contents?: BrowserContentsLike) {
    const liveUrl = contents?.getURL?.() || binding.lastKnownUrl;
    const liveTitle = contents?.getTitle?.() || binding.lastKnownTitle;

    binding.lastKnownUrl = liveUrl;
    binding.lastKnownTitle = liveTitle;

    return {
      sessionFile: binding.sessionFile,
      webContentsId: binding.webContentsId,
      url: liveUrl,
      title: liveTitle,
      canGoBack: Boolean(contents?.canGoBack?.()),
      canGoForward: Boolean(contents?.canGoForward?.()),
      isLoading: contents ? this.isLoading(contents) : false,
      boundAt: new Date(binding.updatedAt).toISOString(),
    };
  }

  private isLoading(contents: BrowserContentsLike) {
    return typeof contents.isLoadingMainFrame === "function"
      ? Boolean(contents.isLoadingMainFrame())
      : Boolean(contents.isLoading());
  }

  private async waitForLoad(contents: BrowserContentsLike, timeoutMs: number) {
    await this.waitForCondition(timeoutMs, async () => !this.isLoading(contents));
  }

  private async waitForCondition(timeoutMs: number, predicate: () => Promise<boolean>) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await predicate()) {
        return;
      }
      await delay(120);
    }

    throw new Error(`Timed out after ${timeoutMs}ms while waiting for the browser.`);
  }

  private async ensureDebugger(contents: BrowserContentsLike) {
    if (!contents.debugger.isAttached()) {
      contents.debugger.attach("1.3");
    }

    await contents.debugger.sendCommand("Runtime.enable");
  }

  private async evaluateJson<T = unknown>(contents: BrowserContentsLike, expression: string) {
    await this.ensureDebugger(contents);
    const response = await contents.debugger.sendCommand("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    if (response?.exceptionDetails) {
      const exceptionText =
        response.exceptionDetails.text ||
        response.result?.description ||
        "Browser evaluation failed.";
      throw new Error(String(exceptionText));
    }

    return response?.result?.value as T;
  }

  private async handleBridgeRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      if (request.method !== "POST") {
        this.writeBridgeJson(response, 405, { ok: false, error: "Method not allowed." });
        return;
      }

      if (request.headers["x-pi-studio-browser-token"] !== this.bridgeToken) {
        this.writeBridgeJson(response, 403, { ok: false, error: "Forbidden." });
        return;
      }

      const body = await this.readRequestBody(request);
      const payload = JSON.parse(body || "{}") as {
        method?: string;
        args?: unknown[];
      };

      const args = Array.isArray(payload.args) ? payload.args : [];
      switch (payload.method) {
        case "setSessionName":
          this.setSessionName(String(args[0] ?? ""));
          this.writeBridgeJson(response, 200, { ok: true, result: null });
          return;
        case "getLatestBoundSessionFile":
          this.writeBridgeJson(response, 200, { ok: true, result: this.getLatestBoundSessionFile() });
          return;
        case "listBindings":
          this.writeBridgeJson(response, 200, { ok: true, result: this.listBindings() });
          return;
        case "performAction":
          this.writeBridgeJson(response, 200, { ok: true, result: await this.performAction(args[0] as BrowserToolRequest) });
          return;
        default:
          this.writeBridgeJson(response, 400, { ok: false, error: `Unknown browser bridge method: ${String(payload.method ?? "")}` });
      }
    } catch (error) {
      this.writeBridgeJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private readRequestBody(request: IncomingMessage) {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      });
      request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      request.on("error", reject);
    });
  }

  private writeBridgeJson(response: ServerResponse, statusCode: number, payload: unknown) {
    const body = JSON.stringify(payload);
    response.statusCode = statusCode;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("content-length", Buffer.byteLength(body));
    response.end(body);
  }
}
