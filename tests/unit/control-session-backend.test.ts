import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectRecord, ProjectThreadsMap } from "../../src/shared/types";

const mockState = vi.hoisted(() => ({
  agentDir: "",
}));

vi.mock("@mariozechner/pi-coding-agent", () => ({
  getAgentDir: () => mockState.agentDir,
  withFileMutationQueue: async (_path: string, mutate: () => Promise<void>) => {
    await mutate();
  },
}));

function writeSessionFile(filePath: string, entries: unknown[]) {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
}

describe("control-session sync", () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "pi-studio-control-session-"));
    mockState.agentDir = join(tempRoot, "agent");
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
    vi.resetModules();
  });

  it("syncs Studio threads into servant targets and surfaces latest responses", async () => {
    const projectPath = join(tempRoot, "demo");
    const sessionPath = join(projectPath, "session.jsonl");
    mkdirSync(projectPath, { recursive: true });
    writeSessionFile(sessionPath, [
      {
        type: "message",
        id: "u1",
        timestamp: "2026-01-01T00:00:00.000Z",
        message: { role: "user", content: [{ type: "text", text: "Check the repo" }] },
      },
      {
        type: "message",
        id: "a1",
        timestamp: "2026-01-01T00:00:01.000Z",
        message: { role: "assistant", content: [{ type: "text", text: "Repo looks good" }] },
      },
    ]);

    const sync = await import("../../src/builtins/extensions/pi-control-session/sync");
    const projects: ProjectRecord[] = [{ id: "p1", name: "demo", path: projectPath }];
    const threadsByProject: ProjectThreadsMap = {
      p1: [
        {
          id: "t1",
          sessionId: "s1",
          sessionFile: sessionPath,
          title: "Review repo",
          updatedAt: new Date("2026-01-01T00:00:01.000Z").toISOString(),
          updatedAtMs: Date.parse("2026-01-01T00:00:01.000Z"),
          ageLabel: "now",
          messageCount: 2,
          isPinned: false,
          isArchived: false,
          running: false,
        },
      ],
    };

    await sync.syncStudioTargets(projects, threadsByProject);
    const dashboard = await sync.getDashboardState();

    expect(dashboard.targets).toHaveLength(1);
    expect(dashboard.targets[0]?.projectName).toBe("demo");
    expect(dashboard.targets[0]?.name).toBe("Review repo");
    expect(dashboard.targets[0]?.latestResponse).toBe("Repo looks good");
  });
});
