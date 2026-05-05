import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import controlSessionExtension from "../../src/builtins/extensions/pi-control-session/index";

describe("pi-control-session extension", () => {
  it("registers one control tool, hooks session startup, and keeps control active", async () => {
    const tools: Array<{ name: string; description?: string; promptSnippet?: string; promptGuidelines?: string[] }> = [];
    const events: string[] = [];
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const activeTools: string[] = ["read", "bash", "edit", "write"];

    controlSessionExtension({
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on(event: string, handler: (...args: any[]) => unknown) {
        events.push(event);
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
    expect(tools[0].name).toBe("control");
    expect(tools[0].description).toBe("Control and inspect other Pi Studio sessions.");
    expect(tools[0].promptSnippet).toBe("Control and inspect other Pi Studio sessions from this session.");
    expect(tools[0].promptGuidelines).toContain(
      "Use this tool when the user asks to inspect, create, steer, monitor, or cancel work in other Pi Studio sessions.",
    );
    expect(events).toEqual(["session_start"]);
    expect(activeTools).not.toContain("control");

    await handlers.get("session_start")?.({}, {});
    expect(activeTools.filter((tool) => tool === "control")).toHaveLength(1);
  });

  it("can be imported from its raw entrypoint file URL", async () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const entrypointPath = path.resolve(testDir, "../../src/builtins/extensions/pi-control-session/index.ts");
    const module = await import(pathToFileURL(entrypointPath).href);

    expect(typeof module.default).toBe("function");
  });
});
