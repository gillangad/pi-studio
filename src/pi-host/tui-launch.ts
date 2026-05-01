import { accessSync, constants } from "node:fs";
import path from "node:path";

export type TuiLaunchCommand = {
  file: string;
  args: string[];
  source: "pi" | "fallback-shell" | "shell";
};

type ResolveTuiLaunchCommandOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  sessionFile?: string | null;
  extensionPaths?: string[];
  skillPaths?: string[];
  findExecutable?: (candidateNames: string[], pathValue: string) => string | null;
};

function appendResourceFlags(args: string[], options: ResolveTuiLaunchCommandOptions) {
  for (const extensionPath of options.extensionPaths ?? []) {
    if (extensionPath.trim()) {
      args.push("-e", extensionPath);
    }
  }

  for (const skillPath of options.skillPaths ?? []) {
    if (skillPath.trim()) {
      args.push("--skill", skillPath);
    }
  }
}

export function findExecutable(candidateNames: string[], pathValue = process.env.PATH ?? "") {
  if (!pathValue.trim()) return null;

  const entries = pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const entry of entries) {
    for (const name of candidateNames) {
      const candidate = path.join(entry, name);

      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Try next candidate.
      }
    }
  }

  return null;
}

export function resolveTuiLaunchCommand(options: ResolveTuiLaunchCommandOptions = {}): TuiLaunchCommand {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const sessionFile = options.sessionFile ?? null;
  const lookup = options.findExecutable ?? findExecutable;
  const pathValue = env.PATH ?? "";

  if (platform === "win32") {
    const piCommand = lookup(["pi.cmd", "pi.exe", "pi.bat"], pathValue);

    if (piCommand) {
      const args = sessionFile ? ["--session", sessionFile] : ["-c"];
      appendResourceFlags(args, options);
      return {
        file: piCommand,
        args,
        source: "pi",
      };
    }

    return {
      file: env.COMSPEC || "powershell.exe",
      args: [],
      source: "fallback-shell",
    };
  }

  const piCommand = lookup(["pi"], pathValue);

  if (piCommand) {
    const args = sessionFile ? ["--session", sessionFile] : ["-c"];
    appendResourceFlags(args, options);
    return {
      file: piCommand,
      args,
      source: "pi",
    };
  }

  return {
    file: env.SHELL || "/bin/bash",
    args: ["-i"],
    source: "fallback-shell",
  };
}

export function resolveShellLaunchCommand(options: ResolveTuiLaunchCommandOptions = {}): TuiLaunchCommand {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;

  if (platform === "win32") {
    return {
      file: env.COMSPEC || "powershell.exe",
      args: [],
      source: "shell",
    };
  }

  return {
    file: env.SHELL || "/bin/bash",
    args: ["-i"],
    source: "shell",
  };
}

export function toScriptWrappedCommand(command: TuiLaunchCommand) {
  const encodedCommand = [command.file, ...command.args].map(quoteForShell).join(" ");

  return {
    file: "script",
    args: ["-qfc", encodedCommand, "/dev/null"],
  };
}

function quoteForShell(segment: string) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(segment)) {
    return segment;
  }

  return `'${segment.replace(/'/g, `'\\''`)}'`;
}
