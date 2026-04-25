import { existsSync } from "node:fs";
import path from "node:path";

export function resolvePreloadScriptPath(
  currentDirPath: string,
  pathExists: (targetPath: string) => boolean = existsSync,
) {
  const cjsPreloadPath = path.join(currentDirPath, "../preload/index.js");
  if (pathExists(cjsPreloadPath)) {
    return cjsPreloadPath;
  }

  return path.join(currentDirPath, "../preload/index.mjs");
}
