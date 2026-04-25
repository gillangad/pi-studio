#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const require = createRequire(import.meta.url);

function resolveElectronCli() {
  return require.resolve("electron/cli.js", { paths: [appRoot] });
}

function main() {
  const electronCli = resolveElectronCli();
  const args = process.argv.slice(2);
  const launchCwd = process.env.PI_STUDIO_LAUNCH_CWD || process.cwd();
  const spawnCwd = appRoot;

  const child = spawn(process.execPath, [electronCli, appRoot, ...args], {
    cwd: spawnCwd,
    stdio: "inherit",
    env: {
      ...process.env,
      PI_STUDIO_LAUNCH_CWD: launchCwd,
    },
  });

  child.on("error", (error) => {
    console.error(`Failed to launch Pi Studio: ${error.message}`);
    process.exit(1);
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

main();
