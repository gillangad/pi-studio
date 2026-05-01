import { describe, expect, it } from "vitest";
import artifactsExtension from "../../src/builtins/extensions/pi-artifacts/index";

describe("pi-artifacts extension", () => {
  it("does not inject artifact guidance into the system prompt", async () => {
    const events: string[] = [];

    artifactsExtension({
      on(event: string) {
        events.push(event);
      },
    } as any);

    expect(events).toEqual([]);
  });
});
