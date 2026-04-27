import { describe, expect, it } from "vitest";
import type { ThreadSummary } from "../../src/shared/types";
import { shouldUsePiStudioBuiltins } from "../../src/pi-host/builtin-selection";

function makeThread(sessionFile: string, updatedAtMs: number): ThreadSummary {
  return {
    id: sessionFile,
    sessionId: sessionFile,
    sessionFile,
    title: sessionFile,
    updatedAt: new Date(updatedAtMs).toISOString(),
    updatedAtMs,
    ageLabel: "now",
    messageCount: 0,
    isPinned: false,
    isArchived: false,
    running: false,
  };
}

describe("shouldUsePiStudioBuiltins", () => {
  it("enables builtins for newly created project threads", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "new" },
      threadsForProject: [],
      metadataBySessionFile: {},
    });

    expect(result).toBe(true);
  });

  it("enables builtins for opened sessions tagged by Pi Studio", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "open", sessionFile: "/tmp/session-a.jsonl" },
      threadsForProject: [],
      metadataBySessionFile: {
        "/tmp/session-a.jsonl": { piStudioBuiltins: true },
      },
    });

    expect(result).toBe(true);
  });

  it("disables builtins for externally created sessions", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "open", sessionFile: "/tmp/session-a.jsonl" },
      threadsForProject: [],
      metadataBySessionFile: {},
    });

    expect(result).toBe(false);
  });

  it("uses metadata from the most recent thread when continuing", () => {
    const result = shouldUsePiStudioBuiltins({
      options: { kind: "continue" },
      threadsForProject: [
        makeThread("/tmp/older.jsonl", 10),
        makeThread("/tmp/newer.jsonl", 20),
      ],
      metadataBySessionFile: {
        "/tmp/newer.jsonl": { piStudioBuiltins: true },
      },
    });

    expect(result).toBe(true);
  });
});
