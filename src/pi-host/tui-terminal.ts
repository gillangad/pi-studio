import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import type { IPty } from "node-pty";
import {
  resolveShellLaunchCommand,
  resolveTuiLaunchCommand,
  toScriptWrappedCommand,
  type TuiLaunchCommand,
} from "./tui-launch";

type TerminalEvents = {
  onData: (data: string) => void;
  onExit: (event: { exitCode: number; signal?: number }) => void;
  onError: (error: Error) => void;
};

type NodePtyModule = typeof import("node-pty");

const require = createRequire(import.meta.url);

function tryLoadNodePty(): NodePtyModule | null {
  try {
    return require("node-pty") as NodePtyModule;
  } catch {
    return null;
  }
}

export class TuiTerminal {
  private ptyProcess: IPty | null = null;
  private childProcess: ChildProcessWithoutNullStreams | null = null;
  private ptyDisposers: Array<() => void> = [];
  private childDisposers: Array<() => void> = [];

  constructor(private readonly events: TerminalEvents) {}

  get active() {
    return Boolean(this.ptyProcess || this.childProcess);
  }

  start(cwd: string, cols = 120, rows = 32, sessionFile?: string | null) {
    const command = resolveTuiLaunchCommand({ cwd, sessionFile });
    const prefixNotice =
      command.source === "fallback-shell"
        ? "\r\n[pi-studio] `pi` is not on PATH, launched your default shell instead.\r\n"
        : null;

    this.startWithCommand(command, cwd, cols, rows, prefixNotice);
  }

  startPiSession(
    cwd: string,
    cols = 120,
    rows = 32,
    options?: { sessionFile?: string | null; extensionPaths?: string[]; skillPaths?: string[] },
  ) {
    const command = resolveTuiLaunchCommand({
      cwd,
      sessionFile: options?.sessionFile,
      extensionPaths: options?.extensionPaths,
      skillPaths: options?.skillPaths,
    });
    const prefixNotice =
      command.source === "fallback-shell"
        ? "\r\n[pi-studio] `pi` is not on PATH, launched your default shell instead.\r\n"
        : null;

    this.startWithCommand(command, cwd, cols, rows, prefixNotice);
  }

  startShell(cwd: string, cols = 120, rows = 32) {
    const command = resolveShellLaunchCommand();
    this.startWithCommand(command, cwd, cols, rows);
  }

  write(data: string) {
    if (this.ptyProcess) {
      this.ptyProcess.write(data);
      return;
    }

    this.childProcess?.stdin.write(data);
  }

  resize(cols: number, rows: number) {
    if (this.ptyProcess) {
      this.ptyProcess.resize(cols, rows);
      return;
    }

    if (this.childProcess) {
      this.childProcess.stdin.write(`\u001b[8;${rows};${cols}t`);
    }
  }

  stop() {
    if (this.ptyProcess) {
      this.disposePtyBindings();
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }

    if (this.childProcess) {
      this.disposeChildBindings();
      this.childProcess.kill();
      this.childProcess = null;
    }
  }

  private attachPtyProcess(ptyProcess: IPty) {
    this.ptyProcess = ptyProcess;

    const disposeOutput = ptyProcess.onData((data) => {
      this.events.onData(data);
    });

    const disposeExit = ptyProcess.onExit((event) => {
      this.disposePtyBindings();
      this.ptyProcess = null;
      this.events.onExit({
        exitCode: event.exitCode,
        signal: typeof event.signal === "number" ? event.signal : undefined,
      });
    });

    this.ptyDisposers = [
      () => disposeOutput.dispose(),
      () => disposeExit.dispose(),
    ];
  }

  private startWithCommand(
    command: TuiLaunchCommand,
    cwd: string,
    cols: number,
    rows: number,
    prefixNotice?: string | null,
  ) {
    this.stop();

    const terminalEnv = {
      ...process.env,
      COLUMNS: String(cols),
      LINES: String(rows),
      TERM: "xterm-256color",
      COLORTERM: "truecolor",
    };

    if (prefixNotice) {
      this.events.onData(prefixNotice);
    }

    const nodePty = tryLoadNodePty();

    if (nodePty) {
      try {
        const ptyProcess = nodePty.spawn(command.file, command.args, {
          cwd,
          cols,
          rows,
          env: terminalEnv,
          name: process.platform === "win32" ? "xterm-color" : "xterm-256color",
        });

        this.attachPtyProcess(ptyProcess);
        return;
      } catch (error) {
        this.events.onData("\r\n[pi-studio] PTY adapter failed to start, falling back to pipe transport.\r\n");
        this.events.onError(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.startChildProcess(command, cwd, terminalEnv);
  }

  private startChildProcess(command: TuiLaunchCommand, cwd: string, env: NodeJS.ProcessEnv) {
    const wrappedCommand = process.platform === "win32" ? command : toScriptWrappedCommand(command);

    try {
      this.childProcess = spawn(wrappedCommand.file, wrappedCommand.args, {
        cwd,
        env,
        stdio: "pipe",
        shell: process.platform === "win32",
      });
    } catch (error) {
      this.events.onError(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    const handleStdout = (data: Buffer) => {
      this.events.onData(data.toString("utf8"));
    };

    const handleStderr = (data: Buffer) => {
      this.events.onData(data.toString("utf8"));
    };

    const handleError = (error: Error) => {
      this.events.onError(error);
    };

    const handleExit = (exitCode: number | null) => {
      this.disposeChildBindings();
      this.childProcess = null;
      this.events.onExit({
        exitCode: exitCode ?? 0,
      });
    };

    this.childProcess.stdout.on("data", handleStdout);
    this.childProcess.stderr.on("data", handleStderr);
    this.childProcess.on("error", handleError);
    this.childProcess.on("exit", handleExit);

    this.childDisposers = [
      () => this.childProcess?.stdout.off("data", handleStdout),
      () => this.childProcess?.stderr.off("data", handleStderr),
      () => this.childProcess?.off("error", handleError),
      () => this.childProcess?.off("exit", handleExit),
    ];
  }

  private disposePtyBindings() {
    for (const dispose of this.ptyDisposers) {
      dispose();
    }

    this.ptyDisposers = [];
  }

  private disposeChildBindings() {
    for (const dispose of this.childDisposers) {
      dispose();
    }

    this.childDisposers = [];
  }
}
