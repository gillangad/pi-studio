import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GuiState, SessionTreeSnapshot } from "../../src/shared/types";
import { ChatView } from "../../src/surfaces/components/ChatView";

function createGuiState(messages: GuiState["messages"], isStreaming = false): GuiState {
  return {
    sessionId: "default",
    projectId: "p1",
    sessionFile: "/tmp/demo/session.jsonl",
    sessionTitle: "Thread one",
    cwd: "/tmp/demo",
    isStreaming,
    messages,
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
    slashCommands: [
      { command: "/tree", description: "Navigate the session tree", source: "builtin" },
      { command: "/model", description: "Open the model picker", source: "builtin" },
    ],
  };
}

const emptyTree: SessionTreeSnapshot = {
  leafId: "a1",
  nodes: [
    {
      id: "u1",
      parentId: null,
      timestamp: new Date().toISOString(),
      kind: "message",
      role: "user",
      preview: "Original question",
      children: [
        {
          id: "a1",
          parentId: "u1",
          timestamp: new Date().toISOString(),
          kind: "message",
          role: "assistant",
          preview: "Initial answer",
          children: [],
        },
      ],
    },
  ],
};

describe("ChatView", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("collapses work trace items before the final assistant answer", () => {
    render(
      <ChatView
        gui={createGuiState([
          { id: "u1", role: "user", content: ["Fix it"], timestamp: 1000 },
          { id: "a1", role: "assistant", content: ["Looking around"], timestamp: 2000 },
          { id: "t1", role: "toolResult", toolName: "read", content: ["read src/file.ts\n\nconst a = 1;"], timestamp: 3000 },
          { id: "t2", role: "toolResult", toolName: "edit", content: ["edit src/file.ts\n\n-const a = 1;\n+const a = 2;"], timestamp: 5000 },
          { id: "a2", role: "assistant", content: ["Done."], timestamp: 11000 },
        ])}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
        onSetModel={vi.fn()}
        onSetThinkingLevel={vi.fn()}
        onPickAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onClearAttachments={vi.fn()}
        onGetSessionTree={vi.fn().mockResolvedValue(emptyTree)}
        onNavigateTree={vi.fn().mockResolvedValue({ cancelled: false })}
        onRunSlashCommand={vi.fn().mockResolvedValue({ handled: true })}
      />,
    );

    expect(screen.getByText("Fix it")).toBeInTheDocument();
    expect(screen.getByText("Worked for 9s")).toBeInTheDocument();
    expect(screen.getByText("Done.")).toBeInTheDocument();
    expect(screen.queryByText("Looking around")).not.toBeInTheDocument();
    expect(screen.queryByText(/Edited file\.ts/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Worked for 9s/i }));

    expect(screen.getByText("Looking around")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read\s+file\.ts/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edited\s+file\.ts/ })).toBeInTheDocument();
  });

  it("keeps the in-progress turn expanded while streaming", () => {
    render(
      <ChatView
        gui={createGuiState([
          { id: "u1", role: "user", content: ["Fix it"], timestamp: 1000 },
          { id: "a1", role: "assistant", content: ["Looking around"], timestamp: 2000 },
          { id: "t1", role: "toolResult", toolName: "read", content: ["read src/file.ts\n\nconst a = 1;"], timestamp: 3000 },
        ], true)}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
        onSetModel={vi.fn()}
        onSetThinkingLevel={vi.fn()}
        onPickAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onClearAttachments={vi.fn()}
        onGetSessionTree={vi.fn().mockResolvedValue(emptyTree)}
        onNavigateTree={vi.fn().mockResolvedValue({ cancelled: false })}
        onRunSlashCommand={vi.fn().mockResolvedValue({ handled: true })}
      />,
    );

    expect(screen.getByText("Looking around")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read\s+file\.ts/ })).toBeInTheDocument();
    expect(screen.queryByText(/Worked/)).not.toBeInTheDocument();
  });

  it("keeps inline artifact cards visible when the artifact was created inside a collapsed work trace", () => {
    const onOpenArtifact = vi.fn();

    render(
      <ChatView
        gui={createGuiState([
          { id: "u1", role: "user", content: ["Build me an artifact"], timestamp: 1000 },
          {
            id: "a1",
            role: "assistant",
            content: ["Built the first draft."],
            artifactRefs: [{ artifactId: "report", title: "Quarterly Report", kind: "react-tsx" }],
            timestamp: 2000,
          },
          { id: "t1", role: "toolResult", toolName: "read", content: ["read notes.md"], timestamp: 3000 },
          { id: "a2", role: "assistant", content: ["Done."], timestamp: 4000 },
        ])}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
        onSetModel={vi.fn()}
        onSetThinkingLevel={vi.fn()}
        onPickAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onClearAttachments={vi.fn()}
        onGetSessionTree={vi.fn().mockResolvedValue(emptyTree)}
        onNavigateTree={vi.fn().mockResolvedValue({ cancelled: false })}
        onRunSlashCommand={vi.fn().mockResolvedValue({ handled: true })}
        artifactById={{
          report: {
            artifactId: "report",
            title: "Quarterly Report",
            summary: "Latest revision",
            kind: "react-tsx",
            tsx: "export default function ArtifactApp() { return <main>Hello</main>; }",
            html: null,
            css: "",
            js: "",
            data: null,
            createdInMessageId: "a1",
            updatedInMessageId: "a1",
            revisionCount: 1,
            updatedSequence: 1,
          },
        }}
        onOpenArtifact={onOpenArtifact}
      />,
    );

    expect(screen.getByText("Worked for 2s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Worked for 2s/i }));

    const artifactButton = screen.getByRole("button", { name: /Open artifact Quarterly Report/i });
    expect(artifactButton).toBeInTheDocument();

    fireEvent.click(artifactButton);
    expect(onOpenArtifact).toHaveBeenCalledWith("report");
  });

  it("opens the GUI tree flow for /tree instead of sending a prompt", async () => {
    const onSendPrompt = vi.fn();
    const onGetSessionTree = vi.fn().mockResolvedValue(emptyTree);
    const onNavigateTree = vi.fn().mockResolvedValue({
      cancelled: false,
      editorText: "Original question",
    });
    const onRunSlashCommand = vi.fn().mockResolvedValue({ handled: true, openTree: true });

    render(
      <ChatView
        gui={createGuiState([])}
        onSendPrompt={onSendPrompt}
        onAbort={vi.fn()}
        onSetModel={vi.fn()}
        onSetThinkingLevel={vi.fn()}
        onPickAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onClearAttachments={vi.fn()}
        onGetSessionTree={onGetSessionTree}
        onNavigateTree={onNavigateTree}
        onRunSlashCommand={onRunSlashCommand}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Ask for follow-up changes"), {
      target: { value: "/tree" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask for follow-up changes"), { key: "Enter" });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask for follow-up changes"), { key: "Enter" });

    await waitFor(() => {
      expect(onRunSlashCommand).toHaveBeenCalledWith("/tree", undefined);
      expect(screen.getByRole("heading", { name: "/tree" })).toBeInTheDocument();
      expect(onGetSessionTree).toHaveBeenCalledWith(undefined);
    });

    expect(onSendPrompt).not.toHaveBeenCalled();

    const originalQuestionButton = screen.getByRole("button", { name: /Original question/i });
    fireEvent.click(originalQuestionButton);
    fireEvent.doubleClick(originalQuestionButton);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "No summary" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "No summary" }));

    await waitFor(() => {
      expect(onNavigateTree).toHaveBeenCalledWith("u1", { summarize: false }, undefined);
      expect(screen.queryByText("/tree")).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue("Original question")).toBeInTheDocument();
  });

  it("shows only user and assistant entries in /tree by default", async () => {
    const onGetSessionTree = vi.fn().mockResolvedValue({
      leafId: "assistant-node",
      nodes: [
        {
          id: "user-node",
          parentId: null,
          timestamp: new Date().toISOString(),
          kind: "message",
          role: "user",
          preview: "Start here",
          children: [
            {
              id: "thinking-change",
              parentId: "user-node",
              timestamp: new Date().toISOString(),
              kind: "thinking_level_change",
              preview: "[thinking] high",
              children: [
                {
                  id: "assistant-node",
                  parentId: "thinking-change",
                  timestamp: new Date().toISOString(),
                  kind: "message",
                  role: "assistant",
                  preview: "Answer here",
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    });

    render(
      <ChatView
        gui={createGuiState([])}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
        onSetModel={vi.fn()}
        onSetThinkingLevel={vi.fn()}
        onPickAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onClearAttachments={vi.fn()}
        onGetSessionTree={onGetSessionTree}
        onNavigateTree={vi.fn().mockResolvedValue({ cancelled: false })}
        onRunSlashCommand={vi.fn().mockResolvedValue({ handled: true, openTree: true })}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Ask for follow-up changes"), {
      target: { value: "/tree" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask for follow-up changes"), { key: "Enter" });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask for follow-up changes"), { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText("Navigate the session tree in-place and optionally summarize the branch you leave behind.")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Start here/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Answer here active/i })).toBeInTheDocument();
    expect(screen.queryByText(/\[thinking\] high/i)).not.toBeInTheDocument();
  });

  it("does not yank the transcript back to bottom after the user scrolls up", () => {
    const initialMessages = [
      { id: "u1", role: "user" as const, content: ["Start"], timestamp: 1000 },
      { id: "a1", role: "assistant" as const, content: ["First reply"], timestamp: 2000 },
    ];

    const { rerender } = render(
      <ChatView
        gui={createGuiState(initialMessages, true)}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
        onSetModel={vi.fn()}
        onSetThinkingLevel={vi.fn()}
        onPickAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onClearAttachments={vi.fn()}
        onGetSessionTree={vi.fn().mockResolvedValue(emptyTree)}
        onNavigateTree={vi.fn().mockResolvedValue({ cancelled: false })}
        onRunSlashCommand={vi.fn().mockResolvedValue({ handled: true })}
      />,
    );

    const transcript = screen.getByLabelText("Session transcript");
    Object.defineProperty(transcript, "scrollHeight", { configurable: true, value: 1200 });
    Object.defineProperty(transcript, "clientHeight", { configurable: true, value: 400 });
    Object.defineProperty(transcript, "scrollTop", { configurable: true, writable: true, value: 300 });

    fireEvent.scroll(transcript);

    rerender(
      <ChatView
        gui={createGuiState(
          [
            ...initialMessages,
            { id: "a2", role: "assistant" as const, content: ["Second reply"], timestamp: 3000 },
          ],
          true,
        )}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
        onSetModel={vi.fn()}
        onSetThinkingLevel={vi.fn()}
        onPickAttachments={vi.fn()}
        onRemoveAttachment={vi.fn()}
        onClearAttachments={vi.fn()}
        onGetSessionTree={vi.fn().mockResolvedValue(emptyTree)}
        onNavigateTree={vi.fn().mockResolvedValue({ cancelled: false })}
        onRunSlashCommand={vi.fn().mockResolvedValue({ handled: true })}
      />,
    );

    expect(screen.getByRole("button", { name: "Scroll chat to bottom" })).toBeInTheDocument();
    expect((transcript as HTMLDivElement).scrollTop).toBe(300);
  });
});
