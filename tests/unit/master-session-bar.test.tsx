import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MasterState } from "../../src/shared/types";
import { MasterSessionBar } from "../../src/surfaces/components/MasterSessionBar";

const masterState: MasterState = {
  sessionId: "master",
  projectId: null,
  sessionFile: "/tmp/master.jsonl",
  sessionTitle: "Master",
  cwd: "/tmp",
  isStreaming: false,
  messages: [],
  resources: {
    extensions: 1,
    skills: 1,
    prompts: 0,
    themes: 0,
    agentsFiles: 0,
    extensionEntries: [{ name: "pi-control-session", path: null, origin: "bundled" }],
    extensionNames: ["pi-control-session"],
    skillEntries: [{ name: "pi-control-session-master", path: null, origin: "bundled" }],
    skillNames: ["pi-control-session-master"],
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
  targets: [],
  summary: {
    totalTargets: 0,
    activeTargets: 0,
    errorTargets: 0,
    pendingTargets: 0,
  },
  updatedAt: Date.now(),
};

describe("MasterSessionBar", () => {
  it("shows slash command autocomplete and applies the selected command", () => {
    render(
      <MasterSessionBar
        master={masterState}
        onClose={vi.fn()}
        onSendPrompt={vi.fn()}
        onAbort={vi.fn()}
        onPickAttachments={vi.fn()}
        onOpenTarget={vi.fn()}
      />,
    );

    const input = screen.getByPlaceholderText("Ask Master Pi");
    fireEvent.change(input, { target: { value: "/" } });

    expect(screen.getByRole("listbox", { name: "Master slash commands" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\/tree/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /\/model/i })).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Master slash commands" }).className).toContain("bottom-[calc(100%+0.5rem)]");
    expect(screen.getByRole("listbox", { name: "Master slash commands" }).className).toContain("bg-popover");

    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.getByDisplayValue("/tree")).toBeInTheDocument();
  });
});
