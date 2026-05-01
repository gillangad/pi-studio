import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const writeMock = vi.fn();
const focusMock = vi.fn();
let terminalOnData: ((data: string) => void) | null = null;

vi.mock("@wterm/react", () => ({
  Terminal: ({ onReady, onData, autoResize, cursorBlink, theme, ...props }: Record<string, unknown>) => {
    void autoResize;
    void cursorBlink;
    void theme;
    terminalOnData = typeof onData === "function" ? (onData as (data: string) => void) : null;
    setTimeout(() => {
      if (typeof onReady === "function") {
        onReady({});
      }
    }, 0);
    return <div data-testid="wterm-terminal" {...props} />;
  },
  useTerminal: () => ({
    ref: { current: null },
    write: writeMock,
    focus: focusMock,
  }),
}));

import { TuiView } from "../../src/surfaces/components/TuiView";

describe("TuiView", () => {
  it("renders the shared-runtime tui shell and writes a transcript", async () => {
    render(
      <TuiView
        active
        gui={{
          sessionId: "default",
          projectId: "p1",
          sessionFile: "/tmp/demo/session.jsonl",
          sessionTitle: "Thread one",
          cwd: "/tmp/demo",
          isStreaming: false,
          messages: [{ id: "user-1", role: "user", content: ["hello there"] }],
          resources: {
            extensions: 0,
            skills: 0,
            prompts: 0,
            themes: 0,
            agentsFiles: 0,
            extensionEntries: [],
            extensionNames: [],
            skillEntries: [],
            skillNames: [],
            promptNames: [],
            themeNames: [],
            agentsFilePaths: [],
          },
          statusText: null,
          errorText: null,
          model: null,
          availableModels: [],
          thinkingLevel: "medium",
          availableThinkingLevels: ["off", "medium", "high"],
          streamingBehaviorPreference: "followUp",
          attachments: [],
          slashCommands: [],
        }}
        tui={{
          active: true,
          projectId: "p1",
          cwd: "/tmp/demo",
          status: "idle",
          errorText: null,
          runningInBackground: false,
        }}
        draft="draft"
        onDraftChange={vi.fn()}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Hosted terminal")).toBeInTheDocument();
    expect(screen.getByText("Studio TUI")).toBeInTheDocument();
    expect(screen.getByText("Thread one")).toBeInTheDocument();

    await waitFor(() => {
      expect(writeMock).toHaveBeenCalled();
      expect(String(writeMock.mock.calls.at(-1)?.[0] ?? "")).toContain("Pi Studio TUI");
      expect(String(writeMock.mock.calls.at(-1)?.[0] ?? "")).toContain("user> hello there");
      expect(String(writeMock.mock.calls.at(-1)?.[0] ?? "")).toContain("> draft");
    });
  });

  it("turns terminal input into draft changes and submissions", async () => {
    const onDraftChange = vi.fn();
    const onSendPrompt = vi.fn();
    const onAbort = vi.fn();

    render(
      <TuiView
        active
        gui={{
          sessionId: "default",
          projectId: "p1",
          sessionFile: "/tmp/demo/session.jsonl",
          sessionTitle: "Thread one",
          cwd: "/tmp/demo",
          isStreaming: false,
          messages: [],
          resources: {
            extensions: 0,
            skills: 0,
            prompts: 0,
            themes: 0,
            agentsFiles: 0,
            extensionEntries: [],
            extensionNames: [],
            skillEntries: [],
            skillNames: [],
            promptNames: [],
            themeNames: [],
            agentsFilePaths: [],
          },
          statusText: null,
          errorText: null,
          model: null,
          availableModels: [],
          thinkingLevel: "medium",
          availableThinkingLevels: ["off", "medium", "high"],
          streamingBehaviorPreference: "followUp",
          attachments: [],
          slashCommands: [],
        }}
        tui={{
          active: true,
          projectId: "p1",
          cwd: "/tmp/demo",
          status: "idle",
          errorText: null,
          runningInBackground: false,
        }}
        draft="hi"
        onDraftChange={onDraftChange}
        onSendPrompt={onSendPrompt}
        onAbort={onAbort}
      />,
    );

    await waitFor(() => expect(terminalOnData).not.toBeNull());

    terminalOnData?.("!");
    terminalOnData?.("\u007f");
    terminalOnData?.("\r");
    terminalOnData?.("\u0003");

    expect(onDraftChange).toHaveBeenCalledWith("hi!");
    expect(onDraftChange).toHaveBeenCalledWith("h");
    expect(onDraftChange).toHaveBeenCalledWith("");
    expect(onSendPrompt).toHaveBeenCalledWith("hi", undefined);
    expect(onAbort).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("wterm-terminal"));
  });
});
