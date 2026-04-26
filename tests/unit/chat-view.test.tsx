import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
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
      extensionNames: [],
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
      />,
    );

    expect(screen.getByText("Fix it")).toBeInTheDocument();
    expect(screen.getByText("Worked for 9s")).toBeInTheDocument();
    expect(screen.getByText("Done.")).toBeInTheDocument();
    expect(screen.queryByText("Looking around")).not.toBeInTheDocument();
    expect(screen.queryByText(/Edited src\/file\.ts/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Worked for 9s/i }));

    expect(screen.getByText("Looking around")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read\s+src\/file\.ts/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Edited\s+src\/file\.ts/ })).toBeInTheDocument();
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
      />,
    );

    expect(screen.getByText("Looking around")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read\s+src\/file\.ts/ })).toBeInTheDocument();
    expect(screen.queryByText(/Worked/)).not.toBeInTheDocument();
  });

  it("opens the GUI tree flow for /tree instead of sending a prompt", async () => {
    const onSendPrompt = vi.fn();
    const onGetSessionTree = vi.fn().mockResolvedValue(emptyTree);
    const onNavigateTree = vi.fn().mockResolvedValue({
      cancelled: false,
      editorText: "Original question",
    });

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
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Ask for follow-up changes"), {
      target: { value: "/tree" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask for follow-up changes"), { key: "Enter" });
    fireEvent.keyDown(screen.getByPlaceholderText("Ask for follow-up changes"), { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "/tree" })).toBeInTheDocument();
      expect(onGetSessionTree).toHaveBeenCalledWith(undefined);
    });

    expect(onSendPrompt).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByText("/tree").closest("[tabindex='-1']") ?? screen.getByText("/tree"), {
      key: "ArrowUp",
    });
    fireEvent.keyDown(screen.getByText("/tree").closest("[tabindex='-1']") ?? screen.getByText("/tree"), {
      key: "Enter",
    });

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
});
