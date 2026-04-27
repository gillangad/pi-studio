import { describe, expect, it } from "vitest";
import { shouldUsePiStudioBuiltins } from "../../src/pi-host/builtin-selection";

describe("shouldUsePiStudioBuiltins", () => {
  it("enables builtins for newly created project threads", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "new" },
      threadsForProject: [],
      metadataBySessionFile: {},
    });

    expect(result).toBe(true);
  });

  it("enables builtins for opened sessions", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "open", sessionFile: "/tmp/session-a.jsonl" },
      threadsForProject: [],
      metadataBySessionFile: {},
    });

    expect(result).toBe(true);
  });

  it("enables builtins for externally created sessions too", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "open", sessionFile: "/tmp/session-a.jsonl" },
      threadsForProject: [],
      metadataBySessionFile: {},
    });

    expect(result).toBe(true);
  });

  it("enables builtins when continuing a thread", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "continue" },
      threadsForProject: [],
      metadataBySessionFile: {},
    });

    expect(result).toBe(true);
  });
});
