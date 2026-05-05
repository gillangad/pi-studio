import { accessSync, constants } from "node:fs";
import path from "node:path";

export type TuiLaunchCommand = {
  file: string;
  args: string[];
  source: "pi" | "pi-wsl" | "fallback-shell" | "shell";
};

type ResolveTuiLaunchCommandOptions = {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  cwd?: string | null;
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

type WslWorkspaceLocation = {
  distro: string;
  linuxPath: string;
};

const WSL_UNC_PREFIX = /^\\\\wsl\.localhost\\([^\\]+)\\(.+)$/i;
const WINDOWS_DRIVE_PREFIX = /^([a-zA-Z]):[\\/](.*)$/;

function normalizeLinuxPath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function parseWslWorkspaceLocation(targetPath: string | null | undefined): WslWorkspaceLocation | null {
  if (!targetPath) return null;
  const match = targetPath.match(WSL_UNC_PREFIX);
  if (!match) return null;

  const [, distro, linuxPath] = match;
  return {
    distro,
    linuxPath: normalizeLinuxPath(linuxPath),
  };
}

function toWslMountPath(targetPath: string, defaultDistro?: string) {
  const wslLocation = parseWslWorkspaceLocation(targetPath);
  if (wslLocation) {
    if (!defaultDistro || defaultDistro === wslLocation.distro) {
      return wslLocation.linuxPath;
    }
    return null;
  }

  if (targetPath.startsWith("/")) {
    return targetPath;
  }

  const windowsDriveMatch = targetPath.match(WINDOWS_DRIVE_PREFIX);
  if (!windowsDriveMatch) {
    return targetPath.replace(/\\/g, "/");
  }

  const [, driveLetter, remainder] = windowsDriveMatch;
  const linuxRemainder = remainder
    .split(/[/\\]+/)
    .filter(Boolean)
    .join("/");

  return `/mnt/${driveLetter.toLowerCase()}/${linuxRemainder}`;
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
  const cwd = options.cwd ?? null;
  const sessionFile = options.sessionFile ?? null;
  const lookup = options.findExecutable ?? findExecutable;
  const pathValue = env.PATH ?? "";

  if (platform === "win32") {
    const wslLocation = parseWslWorkspaceLocation(cwd);
    if (wslLocation) {
      const args = ["-d", wslLocation.distro, "--cd", wslLocation.linuxPath, "pi"];
      if (sessionFile) {
        const resolvedSessionFile = toWslMountPath(sessionFile, wslLocation.distro);
        if (resolvedSessionFile) {
          args.push("--session", resolvedSessionFile);
        } else {
          args.push("-c");
        }
      } else {
        args.push("-c");
      }

      for (const extensionPath of options.extensionPaths ?? []) {
        const resolved = toWslMountPath(extensionPath, wslLocation.distro);
        if (resolved?.trim()) {
          args.push("-e", resolved);
        }
      }

      for (const skillPath of options.skillPaths ?? []) {
        const resolved = toWslMountPath(skillPath, wslLocation.distro);
        if (resolved?.trim()) {
          args.push("--skill", resolved);
        }
      }

      return {
        file: "wsl.exe",
        args,
        source: "pi-wsl",
      };
    }

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
