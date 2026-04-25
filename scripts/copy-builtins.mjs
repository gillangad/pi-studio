import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";

async function pathExists(targetPath) {
  try {
    await stat(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function copyIfExists(sourcePath, targetPath) {
  if (!(await pathExists(sourcePath))) {
    return;
  }

  await cp(sourcePath, targetPath, { recursive: true, force: true });
}

async function main() {
  const projectRoot = process.cwd();
  const sourceRoot = path.join(projectRoot, "src", "builtins");
  const targetRoot = path.join(projectRoot, "out", "main", "builtins");

  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });

  await copyIfExists(path.join(sourceRoot, "extensions"), path.join(targetRoot, "extensions"));
  await copyIfExists(path.join(sourceRoot, "skills"), path.join(targetRoot, "skills"));
}

await main();
