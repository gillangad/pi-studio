import { describe, expect, it } from "vitest";
import browserExtension from "../../src/builtins/extensions/pi-browser/index";

describe("pi-browser extension", () => {
  it("registers one browser tool, hooks session startup, and keeps browser active", async () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const events: string[] = [];
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const activeTools: string[] = ["read", "bash", "edit", "write"];

    browserExtension({
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
    expect(tools[0].name).toBe("browser");
    expect(tools[0].description).toBe("Control the live Pi Studio browser panel for this thread.");
    expect((tools[0] as { promptSnippet?: string }).promptSnippet).toBe(
      "Control the live Pi Studio browser panel for this thread.",
    );
    expect(events).toEqual(["session_start"]);
    expect(activeTools).not.toContain("browser");

    await handlers.get("session_start")?.({}, {});
    expect(activeTools.filter((tool) => tool === "browser")).toHaveLength(1);
  });
});
