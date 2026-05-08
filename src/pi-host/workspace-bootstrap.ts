import type { GitComment, GitDiffBaseline, ProjectRecord, StudioMode } from "../shared/types";

export type ThreadMetadata = {
  pinned?: boolean;
  archived?: boolean;
  piStudioBuiltins?: boolean;
};

export type StudioProjectState = {
  workerSessionOrder: string[];
  sessionFilesBySessionId: Record<string, string>;
  nextWorkerNumber: number;
};

export type WorkspaceState = {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  activeMode: StudioMode;
  masterSessionPath: string | null;
  projectFavorites: Record<string, boolean>;
  threadMetadataByProject: Record<string, Record<string, ThreadMetadata>>;
  gitCommentsByProject: Record<string, GitComment[]>;
  gitBaselineByProject: Record<string, GitDiffBaseline>;
  studioSessionsByProject: Record<string, StudioProjectState>;
};

type EnsureWorkspaceSelectionOptions = {
  state: WorkspaceState;
  createProject: (projectPath: string) => ProjectRecord;
  defaultProjectPath: string;
  launchProjectPath?: string | null;
};

type EnsureWorkspaceSelectionResult = {
  state: WorkspaceState;
  changed: boolean;
};

export function ensureWorkspaceSelection({
  state,
  createProject,
  defaultProjectPath,
  launchProjectPath,
}: EnsureWorkspaceSelectionOptions): EnsureWorkspaceSelectionResult {
  let changed = false;
  const projects = [...state.projects];
  let activeProjectId = state.activeProjectId;

  const ensureProject = (projectPath: string) => {
    const project = createProject(projectPath);
    const existing = projects.find((entry) => entry.id === project.id);

    if (existing) {
      return existing;
    }

    projects.push(project);
    changed = true;
    return project;
  };

  if (projects.length === 0) {
    const bootstrapProject = ensureProject(launchProjectPath ?? defaultProjectPath);
    if (activeProjectId !== bootstrapProject.id) {
      activeProjectId = bootstrapProject.id;
      changed = true;
    }
  }

  if (launchProjectPath) {
    const launchProject = ensureProject(launchProjectPath);
    if (activeProjectId !== launchProject.id) {
      activeProjectId = launchProject.id;
      changed = true;
    }
  }

  if (!activeProjectId) {
    const firstProject = projects[0] ?? ensureProject(defaultProjectPath);
    if (activeProjectId !== firstProject.id) {
      activeProjectId = firstProject.id;
      changed = true;
    }
  }

  return {
    state: {
      ...state,
      projects,
      activeProjectId,
    },
    changed,
  };
}
