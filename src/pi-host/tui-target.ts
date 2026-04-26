type TuiTargetSession = {
  projectId: string;
  projectPath: string;
  sessionFile: string | null;
};

type TuiTargetProject = {
  id: string;
  path: string;
};

export type TuiLaunchTarget = {
  projectId: string;
  cwd: string;
  sessionFile: string | null;
};

export function resolveTuiLaunchTarget(
  activeSession: TuiTargetSession | null,
  activeProject: TuiTargetProject | null,
): TuiLaunchTarget | null {
  if (activeSession?.projectId && activeSession.projectPath) {
    return {
      projectId: activeSession.projectId,
      cwd: activeSession.projectPath,
      sessionFile: activeSession.sessionFile ?? null,
    };
  }

  if (activeProject?.id && activeProject.path) {
    return {
      projectId: activeProject.id,
      cwd: activeProject.path,
      sessionFile: null,
    };
  }

  return null;
}
