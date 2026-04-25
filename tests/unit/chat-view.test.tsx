import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GuiState } from "../../src/shared/types";
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
      />,
    );

    expect(screen.getByText("Looking around")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Read\s+src\/file\.ts/ })).toBeInTheDocument();
    expect(screen.queryByText(/Worked/)).not.toBeInTheDocument();
  });
});
