import { describe, expect, it } from "vitest";
import type { ProjectRecord } from "../../src/shared/types";
import { ensureWorkspaceSelection, type WorkspaceState } from "../../src/pi-host/workspace-bootstrap";

function makeProject(projectPath: string): ProjectRecord {
  return {
    id: `id:${projectPath}`,
    name: projectPath.split("/").filter(Boolean).at(-1) ?? projectPath,
    path: projectPath,
  };
}

function createState(partial: Partial<WorkspaceState>): WorkspaceState {
  return {
    projects: [],
    activeProjectId: null,
    activeMode: "gui",
    masterSessionPath: null,
    projectFavorites: {},
    threadMetadataByProject: {},
    gitCommentsByProject: {},
    gitBaselineByProject: {},
    studioSessionsByProject: {},
    ...partial,
  };
}

describe("ensureWorkspaceSelection", () => {
  it("bootstraps the default project when the workspace is empty", () => {
    const result = ensureWorkspaceSelection({
      state: createState({}),
      createProject: makeProject,
      defaultProjectPath: "/workspace/default",
    });

    expect(result.changed).toBe(true);
    expect(result.state.projects).toEqual([makeProject("/workspace/default")]);
    expect(result.state.activeProjectId).toBe("id:/workspace/default");
  });

  it("adds and selects the launch project when provided", () => {
    const result = ensureWorkspaceSelection({
      state: createState({
        projects: [makeProject("/workspace/old")],
        activeProjectId: "id:/workspace/old",
      }),
      createProject: makeProject,
      defaultProjectPath: "/workspace/default",
      launchProjectPath: "/workspace/new",
    });

    expect(result.changed).toBe(true);
    expect(result.state.projects).toEqual([makeProject("/workspace/old"), makeProject("/workspace/new")]);
    expect(result.state.activeProjectId).toBe("id:/workspace/new");
  });

  it("selects an existing launch project without duplicating it", () => {
    const result = ensureWorkspaceSelection({
      state: createState({
        projects: [makeProject("/workspace/a"), makeProject("/workspace/b")],
        activeProjectId: "id:/workspace/a",
      }),
      createProject: makeProject,
      defaultProjectPath: "/workspace/default",
      launchProjectPath: "/workspace/b",
    });

    expect(result.changed).toBe(true);
    expect(result.state.projects).toEqual([makeProject("/workspace/a"), makeProject("/workspace/b")]);
    expect(result.state.activeProjectId).toBe("id:/workspace/b");
  });

  it("is a no-op when the launch project is already active", () => {
    const result = ensureWorkspaceSelection({
      state: createState({
        projects: [makeProject("/workspace/current")],
        activeProjectId: "id:/workspace/current",
      }),
      createProject: makeProject,
      defaultProjectPath: "/workspace/default",
      launchProjectPath: "/workspace/current",
    });

    expect(result.changed).toBe(false);
    expect(result.state.projects).toEqual([makeProject("/workspace/current")]);
    expect(result.state.activeProjectId).toBe("id:/workspace/current");
  });
});
