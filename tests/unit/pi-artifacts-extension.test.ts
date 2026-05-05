import { describe, expect, it } from "vitest";
import artifactsExtension from "../../src/builtins/extensions/pi-artifacts/index";

describe("pi-artifacts extension", () => {
  it("registers the artifact tool, hooks session startup, and keeps artifact active", async () => {
    const tools: Array<{ name: string; description?: string; promptSnippet?: string; promptGuidelines?: string[] }> = [];
    const events: string[] = [];
    const handlers = new Map<string, (...args: any[]) => unknown>();
    const activeTools: string[] = ["read", "bash", "edit", "write"];

    artifactsExtension({
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
    expect(tools[0].name).toBe("artifact");
    expect(tools[0].description).toBe("Create or update a Pi Studio artifact for the current chat sidebar.");
    expect(tools[0].promptSnippet).toBe("Create or update a Pi Studio artifact in the current chat sidebar.");
    expect(tools[0].promptGuidelines).toContain(
      "Use this tool when the user asks for a Pi Studio artifact, dashboard, mini app, explorer, or custom sidebar surface.",
    );
    expect(events).toEqual(["session_start"]);
    expect(activeTools).not.toContain("artifact");

    await handlers.get("session_start")?.({}, {});
    expect(activeTools.filter((tool) => tool === "artifact")).toHaveLength(1);
  });
});
