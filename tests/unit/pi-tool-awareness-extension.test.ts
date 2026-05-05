import { describe, expect, it } from "vitest";
import toolAwarenessExtension from "../../src/builtins/extensions/pi-tool-awareness/index";

describe("pi-tool-awareness extension", () => {
  it("injects exact active tool inventory guidance for tool availability prompts", async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>();

    toolAwarenessExtension({
      on(event: string, handler: (...args: any[]) => unknown) {
        handlers.set(event, handler);
      },
      getActiveTools() {
        return ["read", "bash", "browser", "artifact", "control"];
      },
      getAllTools() {
        return [
          { name: "read", description: "Read file contents." },
          { name: "bash", description: "Run shell commands." },
          { name: "browser", description: "Control the browser." },
          { name: "artifact", description: "Create artifacts." },
          { name: "control", description: "Control other sessions." },
        ];
      },
    } as any);

    const result = await handlers.get("before_agent_start")?.(
      { prompt: "what tools you got", systemPrompt: "base prompt" },
      {},
    );

    expect(result).toEqual({
      systemPrompt: expect.stringContaining("- control: Control other sessions."),
    });
    expect(result).toEqual({
      systemPrompt: expect.stringContaining("Do not omit an active tool"),
    });
  });

  it("does nothing for unrelated prompts", async () => {
    const handlers = new Map<string, (...args: any[]) => unknown>();

    toolAwarenessExtension({
      on(event: string, handler: (...args: any[]) => unknown) {
        handlers.set(event, handler);
      },
      getActiveTools() {
        return ["read", "bash"];
      },
      getAllTools() {
        return [];
      },
    } as any);

    const result = await handlers.get("before_agent_start")?.(
      { prompt: "build me a dashboard", systemPrompt: "base prompt" },
      {},
    );

    expect(result).toBeUndefined();
  });
});
