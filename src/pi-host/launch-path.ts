const WINDOWS_PATH_PATTERN = /^[a-zA-Z]:[\\/]/;

export type LaunchPathResolverDependencies = {
  platform: NodeJS.Platform;
  isDirectory: (targetPath: string) => Promise<boolean>;
  toWslPath: (windowsPath: string) => Promise<string | null>;
};

export async function resolveLaunchProjectPathCandidate(
  projectPath: string | null | undefined,
  dependencies: LaunchPathResolverDependencies,
) {
  if (!projectPath) return null;

  try {
    if (await dependencies.isDirectory(projectPath)) {
      return projectPath;
    }
  } catch {
    return null;
  }

  if (dependencies.platform !== "linux") {
    return null;
  }

  if (!WINDOWS_PATH_PATTERN.test(projectPath)) {
    return null;
  }

  try {
    const wslPath = await dependencies.toWslPath(projectPath);
    if (!wslPath) {
      return null;
    }

    if (await dependencies.isDirectory(wslPath)) {
      return wslPath;
    }
  } catch {
    return null;
  }

  return null;
}
