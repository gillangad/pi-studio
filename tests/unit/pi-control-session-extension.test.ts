import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

  it("can be imported from its raw entrypoint file URL", async () => {
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const entrypointPath = path.resolve(testDir, "../../src/builtins/extensions/pi-control-session/index.ts");
    const module = await import(pathToFileURL(entrypointPath).href);

    expect(typeof module.default).toBe("function");
  });
});
