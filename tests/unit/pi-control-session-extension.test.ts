import { describe, expect, it } from "vitest";
import controlSessionExtension from "../../src/builtins/extensions/pi-control-session/index";

describe("pi-control-session extension", () => {
  it("registers one control tool and keeps prompt hooks empty", () => {
    const tools: Array<{ name: string; description?: string }> = [];
    const events: string[] = [];

    controlSessionExtension({
      registerTool(tool: { name: string; description?: string }) {
        tools.push(tool);
      },
      on(event: string) {
        events.push(event);
      },
    } as any);

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("control");
    expect(tools[0].description).toBe("Control and inspect other Pi Studio sessions.");
    expect(events).toEqual(["session_start"]);
  });
});
