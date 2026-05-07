import { describe, expect, it } from "vitest";
import sessionExtension from "../../src/builtins/extensions/pi-session/index";
import {
  PI_STUDIO_SESSION_RUNTIME_KEY,
  type SessionRuntime,
} from "../../src/pi-host/session-extension-runtime";

describe("pi-session extension", () => {
  it("registers the session tool and only activates it for controller sessions", async () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const activeTools: string[] = ["read", "bash", "edit", "write", "browser"];

    (globalThis as Record<string, unknown>)[PI_STUDIO_SESSION_RUNTIME_KEY] = {
      isControllerSession(sessionFile?: string) {
        return sessionFile === "/tmp/controller.jsonl";
      },
      async performAction() {
        return {
          ok: true,
          action: "list",
          message: "Visible worker sessions:",
          sessions: [],
        };
      },
    } satisfies SessionRuntime;

    sessionExtension({
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on(event: string, handler: (...args: any[]) => unknown) {
        handlers.set(event, handler);
      },
      getActiveTools() {
        return [...activeTools];
      },
      setActiveTools(next: string[]) {
        activeTools.splice(0, activeTools.length, ...next);
      },
    } as any);

    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("session");

    await handlers.get("session_start")?.({}, {
      sessionManager: {
        getSessionFile() {
          return "/tmp/controller.jsonl";
        },
      },
    });
    expect(activeTools).toContain("session");

    await handlers.get("session_start")?.({}, {
      sessionManager: {
        getSessionFile() {
          return "/tmp/worker.jsonl";
        },
      },
    });
    expect(activeTools).not.toContain("session");

    delete (globalThis as Record<string, unknown>)[PI_STUDIO_SESSION_RUNTIME_KEY];
  });
});
