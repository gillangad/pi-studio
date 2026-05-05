import { beforeEach, describe, expect, it, vi } from "vitest";
import { PI_STUDIO_BROWSER_BRIDGE_TOKEN_ENV, PI_STUDIO_BROWSER_BRIDGE_URL_ENV } from "../../src/shell/main/browser-runtime";

type ConsoleListener = (_event: unknown, level: number, message: string, line: number, sourceId: string) => void;

const webContentsById = new Map<number, FakeWebContents>();
const clipboardState = { text: "" };

vi.mock("electron", () => ({
  clipboard: {
    readText: () => clipboardState.text,
    writeText: (value: string) => {
      clipboardState.text = value;
    },
  },
  webContents: {
    fromId: (id: number) => webContentsById.get(id),
  },
}));

import { BrowserRuntime } from "../../src/shell/main/browser-runtime";

class FakeWebContents {
  readonly id: number;
  private currentUrl: string;
  private currentTitle: string;
  private listeners = new Set<ConsoleListener>();

  debugger = {
    attached: false,
    isAttached: () => this.debugger.attached,
    attach: () => {
      this.debugger.attached = true;
    },
    sendCommand: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "Runtime.enable") {
        return {};
      }

      if (method === "Runtime.evaluate") {
        const expression = String(params?.expression ?? "");
        if (expression.includes("document.title")) {
          return {
            result: {
              value: {
                title: this.currentTitle,
                url: this.currentUrl,
                text: "Snapshot text",
                elements: [{ selector: "button", tag: "button", text: "Run" }],
              },
            },
          };
        }

        return {
          result: {
            value: {
              ok: true,
              selector: "button",
            },
          },
        };
      }

      throw new Error(`Unexpected debugger command: ${method}`);
    }),
  };

  constructor(id: number, url: string, title: string) {
    this.id = id;
    this.currentUrl = url;
    this.currentTitle = title;
  }

  getURL() {
    return this.currentUrl;
  }

  getTitle() {
    return this.currentTitle;
  }

  canGoBack() {
    return false;
  }

  canGoForward() {
    return false;
  }

  goBack() {}

  goForward() {}

  reload() {}

  async loadURL(url: string) {
    this.currentUrl = url;
  }

  async capturePage() {
    return {
      getSize: () => ({ width: 1280, height: 720 }),
      toPNG: () => Buffer.from("png-data"),
    };
  }

  isDestroyed() {
    return false;
  }

  isLoading() {
    return false;
  }

  on(_event: "console-message", listener: ConsoleListener) {
    this.listeners.add(listener);
    return this;
  }

  removeListener(_event: "console-message", listener: ConsoleListener) {
    this.listeners.delete(listener);
    return this;
  }

  emitConsoleMessage(level: number, message: string, line = 1, sourceId = "app.js") {
    for (const listener of this.listeners) {
      listener({}, level, message, line, sourceId);
    }
  }
}

describe("BrowserRuntime", () => {
  beforeEach(() => {
    webContentsById.clear();
    clipboardState.text = "";
    delete process.env[PI_STUDIO_BROWSER_BRIDGE_URL_ENV];
    delete process.env[PI_STUDIO_BROWSER_BRIDGE_TOKEN_ENV];
  });

  it("binds the live browser surface and reports current state", async () => {
    const runtime = new BrowserRuntime();
    const contents = new FakeWebContents(7, "https://example.com", "Example");
    webContentsById.set(7, contents);

    runtime.bindSurface("/tmp/thread.jsonl", 7);

    const result = await runtime.performAction({
      action: "state",
      sessionFile: "/tmp/thread.jsonl",
    });

    expect(result.url).toBe("https://example.com");
    expect(result.title).toBe("Example");
    expect(runtime.listBindings()).toHaveLength(1);

    runtime.dispose();
  });

  it("captures console logs for the bound session", async () => {
    const runtime = new BrowserRuntime();
    const contents = new FakeWebContents(9, "https://example.com", "Example");
    webContentsById.set(9, contents);

    runtime.bindSurface("/tmp/thread.jsonl", 9);
    contents.emitConsoleMessage(2, "boom");

    const result = await runtime.performAction({
      action: "logs",
      sessionFile: "/tmp/thread.jsonl",
    });

    const logsResult = result as { logs: Array<{ message: string }> };
    expect(logsResult.logs).toHaveLength(1);
    expect(logsResult.logs[0].message).toBe("boom");

    runtime.dispose();
  });

  it("falls back to the only live binding when the requested session is not bound yet", async () => {
    const runtime = new BrowserRuntime();
    const contents = new FakeWebContents(10, "https://example.com", "Example");
    webContentsById.set(10, contents);

    runtime.bindSurface("/tmp/thread.jsonl", 10);

    const result = await runtime.performAction({
      action: "state",
      sessionFile: "/tmp/other-thread.jsonl",
    });

    expect(result.sessionFile).toBe("/tmp/thread.jsonl");
    expect(result.url).toBe("https://example.com");

    runtime.dispose();
  });

  it("reads and writes the browser clipboard", async () => {
    const runtime = new BrowserRuntime();
    const contents = new FakeWebContents(11, "https://example.com", "Example");
    webContentsById.set(11, contents);

    runtime.bindSurface("/tmp/thread.jsonl", 11);

    await runtime.performAction({
      action: "clipboard_write",
      sessionFile: "/tmp/thread.jsonl",
      text: "hello",
    });

    const result = await runtime.performAction({
      action: "clipboard_read",
      sessionFile: "/tmp/thread.jsonl",
    });

    const clipboardResult = result as { text: string };
    expect(clipboardResult.text).toBe("hello");

    runtime.dispose();
  });

  it("serves browser actions through the bridge for out-of-process sessions", async () => {
    const runtime = new BrowserRuntime();
    await runtime.whenReady();

    const contents = new FakeWebContents(13, "https://example.com", "Example");
    webContentsById.set(13, contents);
    runtime.bindSurface("/tmp/thread.jsonl", 13);

    const response = await fetch(String(process.env[PI_STUDIO_BROWSER_BRIDGE_URL_ENV]), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-pi-studio-browser-token": String(process.env[PI_STUDIO_BROWSER_BRIDGE_TOKEN_ENV]),
      },
      body: JSON.stringify({
        method: "performAction",
        args: [{ action: "state", sessionFile: "/tmp/thread.jsonl" }],
      }),
    });

    const payload = (await response.json()) as { ok: boolean; result: { url: string; title: string } };
    expect(response.ok).toBe(true);
    expect(payload.ok).toBe(true);
    expect(payload.result.url).toBe("https://example.com");
    expect(payload.result.title).toBe("Example");

    runtime.dispose();
  });
});
