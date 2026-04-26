import { describe, expect, it } from "vitest";
import { resolveTuiLaunchTarget } from "../../src/pi-host/tui-target";

describe("resolveTuiLaunchTarget", () => {
  it("prefers the active gui session when it has a concrete session file", () => {
    const target = resolveTuiLaunchTarget(
      {
        projectId: "p1",
        projectPath: "/tmp/demo",
        sessionFile: "/tmp/demo/session.jsonl",
      },
      {
        id: "p2",
        path: "/tmp/other",
      },
    );

    expect(target).toEqual({
      projectId: "p1",
      cwd: "/tmp/demo",
      sessionFile: "/tmp/demo/session.jsonl",
    });
  });

  it("falls back to the active project when no gui session is available", () => {
    const target = resolveTuiLaunchTarget(null, {
      id: "p2",
      path: "/tmp/other",
    });

    expect(target).toEqual({
      projectId: "p2",
      cwd: "/tmp/other",
      sessionFile: null,
    });
  });
});
