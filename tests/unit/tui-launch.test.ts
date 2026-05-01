import { describe, expect, it } from "vitest";
import { resolveTuiLaunchCommand, toScriptWrappedCommand } from "../../src/pi-host/tui-launch";

describe("resolveTuiLaunchCommand", () => {
  it("prefers pi on unix when available", () => {
    const command = resolveTuiLaunchCommand({
      platform: "linux",
      env: { PATH: "/usr/bin" },
      findExecutable: (candidates) => (candidates.includes("pi") ? "/usr/bin/pi" : null),
    });

    expect(command).toEqual({
      file: "/usr/bin/pi",
      args: ["-c"],
      source: "pi",
    });
  });

  it("opens an explicit session file when provided", () => {
    const command = resolveTuiLaunchCommand({
      platform: "linux",
      env: { PATH: "/usr/bin" },
      sessionFile: "/tmp/demo/session.jsonl",
      findExecutable: (candidates) => (candidates.includes("pi") ? "/usr/bin/pi" : null),
    });

    expect(command).toEqual({
      file: "/usr/bin/pi",
      args: ["--session", "/tmp/demo/session.jsonl"],
      source: "pi",
    });
  });

  it("passes builtin extension and skill paths to pi", () => {
    const command = resolveTuiLaunchCommand({
      platform: "linux",
      env: { PATH: "/usr/bin" },
      extensionPaths: ["/tmp/ext/browser.ts", "/tmp/ext/control.ts"],
      skillPaths: ["/tmp/skills", "/tmp/inline-skills"],
      findExecutable: (candidates) => (candidates.includes("pi") ? "/usr/bin/pi" : null),
    });

    expect(command).toEqual({
      file: "/usr/bin/pi",
      args: [
        "-c",
        "-e",
        "/tmp/ext/browser.ts",
        "-e",
        "/tmp/ext/control.ts",
        "--skill",
        "/tmp/skills",
        "--skill",
        "/tmp/inline-skills",
      ],
      source: "pi",
    });
  });

  it("falls back to login shell on unix when pi is unavailable", () => {
    const command = resolveTuiLaunchCommand({
      platform: "linux",
      env: { PATH: "/usr/bin", SHELL: "/bin/zsh" },
      findExecutable: () => null,
    });

    expect(command).toEqual({
      file: "/bin/zsh",
      args: ["-i"],
      source: "fallback-shell",
    });
  });

  it("prefers pi.cmd on windows when available", () => {
    const command = resolveTuiLaunchCommand({
      platform: "win32",
      env: { PATH: "C:\\Tools" },
      findExecutable: (candidates) => (candidates.includes("pi.cmd") ? "C:\\Tools\\pi.cmd" : null),
    });

    expect(command).toEqual({
      file: "C:\\Tools\\pi.cmd",
      args: ["-c"],
      source: "pi",
    });
  });

  it("falls back to COMSPEC on windows when pi is unavailable", () => {
    const command = resolveTuiLaunchCommand({
      platform: "win32",
      env: { PATH: "C:\\Tools", COMSPEC: "C:\\Windows\\System32\\cmd.exe" },
      findExecutable: () => null,
    });

    expect(command).toEqual({
      file: "C:\\Windows\\System32\\cmd.exe",
      args: [],
      source: "fallback-shell",
    });
  });
});

describe("toScriptWrappedCommand", () => {
  it("wraps commands for script with shell escaping", () => {
    const command = toScriptWrappedCommand({
      file: "/usr/bin/pi",
      args: ["-c", "hello world", "it's"],
      source: "pi",
    });

    expect(command.file).toBe("script");
    expect(command.args).toEqual([
      "-qfc",
      "/usr/bin/pi -c 'hello world' 'it'\\''s'",
      "/dev/null",
    ]);
  });
});
