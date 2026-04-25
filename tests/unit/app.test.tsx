import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@xterm/xterm", () => ({
  Terminal: class {
    cols = 120;
    rows = 32;
    loadAddon() {}
    open() {}
    onData() {
      return { dispose() {} };
    }
    write() {}
    dispose() {}
    scrollToBottom() {}
    focus() {}
  },
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class {
    fit() {}
  },
}));

if (!("ResizeObserver" in globalThis)) {
  Object.assign(globalThis, {
    ResizeObserver: class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  });
}

import { App } from "../../src/surfaces/app/App";
import type { DesktopBridge } from "../../src/shared/ipc";
import type { FileTreeNode, StudioSnapshot } from "../../src/shared/types";

const snapshot: StudioSnapshot = {
  projects: [{ id: "p1", name: "demo", path: "/tmp/demo", isFavorite: false, isGitRepo: false, isGitHubRepo: false }],
  threadsByProject: {
    p1: [
      {
        id: "t1",
        sessionId: "s1",
        sessionFile: "/tmp/demo/session.jsonl",
        title: "Thread one",
        updatedAt: new Date().toISOString(),
        updatedAtMs: Date.now(),
        ageLabel: "now",
        messageCount: 4,
        isPinned: false,
        isArchived: false,
        running: false,
      },
      {
        id: "t2",
        sessionId: "s2",
        sessionFile: "/tmp/demo/session-2.jsonl",
        title: "Thread two",
        updatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAtMs: Date.now() - 8 * 24 * 60 * 60 * 1000,
        ageLabel: "8d",
        messageCount: 2,
        isPinned: true,
        isArchived: false,
        running: false,
      },
    ],
  },
  activeProjectId: "p1",
  activeMode: "gui",
  gui: {
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
  },
  tui: {
    active: false,
    projectId: "p1",
    cwd: "/tmp/demo",
    status: "idle",
    errorText: null,
    runningInBackground: false,
  },
  terminal: {
    active: false,
    projectId: "p1",
    cwd: "/tmp/demo",
    status: "idle",
    errorText: null,
  },
  git: {
    projectId: "p1",
    isGitRepo: false,
    branch: null,
    baseline: "working",
    changedFiles: [],
    diffText: "",
    comments: [],
    loading: false,
    errorText: null,
  },
  settings: {
    agentDir: "/home/test/.pi/agent",
    currentProjectPath: "/tmp/demo",
    currentSessionFile: "/tmp/demo/session.jsonl",
    currentMode: "gui",
  },
};

const projectTree: FileTreeNode[] = [
  {
    name: "src",
    path: "/tmp/demo/src",
    kind: "directory",
    children: [{ name: "index.ts", path: "/tmp/demo/src/index.ts", kind: "file" }],
  },
];

describe("App", () => {
  beforeEach(() => {
    const bridge: DesktopBridge = {
      bootstrap: vi.fn().mockResolvedValue(snapshot),
      addProject: vi.fn().mockResolvedValue(snapshot),
      selectProject: vi.fn().mockResolvedValue(snapshot),
      reorderProjects: vi.fn().mockResolvedValue(snapshot),
      renameProject: vi.fn().mockResolvedValue(snapshot),
      removeProject: vi.fn().mockResolvedValue(snapshot),
      toggleProjectFavorite: vi.fn().mockResolvedValue(snapshot),
      createThread: vi.fn().mockResolvedValue(snapshot),
      openThread: vi.fn().mockResolvedValue(snapshot),
      toggleThreadPinned: vi.fn().mockResolvedValue(snapshot),
      toggleThreadArchived: vi.fn().mockResolvedValue(snapshot),
      sendPrompt: vi.fn().mockResolvedValue(snapshot),
      abortPrompt: vi.fn().mockResolvedValue(snapshot),
      pickAttachments: vi.fn().mockResolvedValue(snapshot),
      removeAttachment: vi.fn().mockResolvedValue(snapshot),
      clearAttachments: vi.fn().mockResolvedValue(snapshot),
      setModel: vi.fn().mockResolvedValue(snapshot),
      setThinkingLevel: vi.fn().mockResolvedValue(snapshot),
      setStreamingBehavior: vi.fn().mockResolvedValue(snapshot),
      setMode: vi.fn().mockResolvedValue(snapshot),
      startTui: vi.fn().mockResolvedValue(snapshot),
      stopTui: vi.fn().mockResolvedValue(snapshot),
      startTerminal: vi.fn().mockResolvedValue(snapshot),
      stopTerminal: vi.fn().mockResolvedValue(snapshot),
      resizeTui: vi.fn(),
      tuiInput: vi.fn(),
      resizeTerminal: vi.fn(),
      terminalInput: vi.fn(),
      refreshGitState: vi.fn().mockResolvedValue(snapshot),
      setGitBaseline: vi.fn().mockResolvedValue(snapshot),
      addGitComment: vi.fn().mockResolvedValue(snapshot),
      removeGitComment: vi.fn().mockResolvedValue(snapshot),
      getProjectFileTree: vi.fn().mockResolvedValue(projectTree),
      getBrowserCdpTarget: vi.fn().mockResolvedValue(null),
      onSnapshot: vi.fn().mockReturnValue(() => {}),
      onTuiData: vi.fn().mockReturnValue(() => {}),
      onTerminalData: vi.fn().mockReturnValue(() => {}),
    };

    Object.assign(window, { piStudio: bridge });
  });

  afterEach(() => {
    delete (window as { piStudio?: DesktopBridge }).piStudio;
    vi.restoreAllMocks();
  });

  it("renders the main workspace shell after bootstrap", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("demo").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Thread one").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Thread two").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "GUI" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "TUI" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle terminal panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle file tree panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle diff panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Add attachment" })).toBeInTheDocument();
    });
  });

  it("creates a new gui thread from sidebar action", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create thread in demo" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create thread in demo" }));

    expect(bridge.createThread).toHaveBeenCalledWith("p1", undefined);
  });

  it("toggles the browser surface for the active thread", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle browser panel" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Agent browser surface")).toBeInTheDocument();
    });
  });

  it("loads the file tree in the workspace utility pane", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle file tree panel" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle file tree panel" }));

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
    });

    expect(bridge.getProjectFileTree).toHaveBeenCalledWith({ projectId: "p1" });
  });

  it("shows only theme controls in the settings menu", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Settings/i }));

    expect(screen.getByRole("menuitem", { name: /dark mode|light mode/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Extensions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Skills/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /App settings/i })).not.toBeInTheDocument();
  });

  it("opens gui thread when clicking from settings surface", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    vi.mocked(bridge.bootstrap).mockResolvedValueOnce({
      ...snapshot,
      activeMode: "settings",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Thread Thread two in demo" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Thread Thread two in demo" }));

    expect(bridge.openThread).toHaveBeenCalledWith("p1", "/tmp/demo/session-2.jsonl", undefined);
  });

  it("keeps agent controls out of tui mode", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    vi.mocked(bridge.bootstrap).mockResolvedValueOnce({
      ...snapshot,
      activeMode: "tui",
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByLabelText("Hosted terminal")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "Agent" })).not.toBeInTheDocument();
  });

  it("shows a bootstrap error when the desktop bridge is unavailable", async () => {
    delete (window as { piStudio?: DesktopBridge }).piStudio;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Booting Pi Studio…")).toBeInTheDocument();
      expect(screen.getByText(/desktop bridge is unavailable/i)).toBeInTheDocument();
    });
  });
});
