import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  projects: [
    { id: "p1", name: "demo", path: "/tmp/demo", isFavorite: false, isGitRepo: false, isGitHubRepo: false },
    { id: "p2", name: "alpha", path: "/tmp/alpha", isFavorite: false, isGitRepo: false, isGitHubRepo: false },
    { id: "p3", name: "empty", path: "/tmp/empty", isFavorite: false, isGitRepo: false, isGitHubRepo: false },
  ],
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
    p2: [
      {
        id: "t3",
        sessionId: "s3",
        sessionFile: "/tmp/alpha/session.jsonl",
        title: "Alpha latest",
        updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        updatedAtMs: Date.now() - 2 * 60 * 60 * 1000,
        ageLabel: "2h",
        messageCount: 3,
        isPinned: false,
        isArchived: false,
        running: false,
      },
    ],
    p3: [],
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
  },
  master: {
    sessionId: "master",
    projectId: null,
    sessionFile: "/home/test/.pi-studio/master-session/session.jsonl",
    sessionTitle: "Master",
    cwd: "/home/test/.pi-studio/master-session",
    isStreaming: false,
    messages: [
      {
        id: "assistant-1",
        role: "assistant",
        content: ["I can steer the other sessions from here."],
      },
    ],
    resources: {
      extensions: 1,
      skills: 1,
      prompts: 0,
      themes: 0,
      agentsFiles: 0,
      extensionEntries: [{ name: "pi-control-session", path: null, origin: "bundled" }],
      extensionNames: ["pi-control-session"],
      skillEntries: [{ name: "pi-control-session", path: null, origin: "bundled" }],
      skillNames: ["pi-control-session"],
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
    targets: [
      {
        targetId: "studio-demo",
        name: "Thread one",
        projectId: "p1",
        projectName: "demo",
        projectPath: "/tmp/demo",
        sessionPath: "/tmp/demo/session.jsonl",
        sessionTitle: "Thread one",
        status: "idle",
        statusLabel: "ready",
        lastRunId: null,
        lastError: null,
        latestPrompt: "Review the last change",
        latestResponse: "The last change looks fine.",
        latestTimestampMs: Date.now(),
        latestTimestamp: new Date().toISOString(),
        lastActivityLabel: "now",
      },
    ],
    summary: {
      totalTargets: 1,
      activeTargets: 0,
      errorTargets: 0,
      pendingTargets: 0,
    },
    updatedAt: Date.now(),
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
  let snapshotListener: ((snapshot: StudioSnapshot) => void) | null = null;

  beforeEach(() => {
    window.localStorage.clear();
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
      deleteThread: vi.fn().mockResolvedValue(snapshot),
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
      searchSessions: vi.fn().mockResolvedValue([
        {
          projectId: "p2",
          projectName: "alpha",
          sessionFile: "/tmp/alpha/session.jsonl",
          threadTitle: "Alpha latest",
          ageLabel: "2h",
          excerpt: "match inside session",
          matchedIn: "content",
        },
      ]),
      getSessionTree: vi.fn().mockResolvedValue({ leafId: null, nodes: [] }),
      navigateTree: vi.fn().mockResolvedValue({ cancelled: false }),
      runSlashCommand: vi.fn().mockResolvedValue({ handled: true }),
      getBrowserCdpTarget: vi.fn().mockResolvedValue(null),
      bindBrowserSurface: vi.fn().mockResolvedValue(undefined),
      clearBrowserSurfaceBinding: vi.fn().mockResolvedValue(undefined),
      onSnapshot: vi.fn().mockImplementation((callback) => {
        snapshotListener = callback;
        return () => {
          snapshotListener = null;
        };
      }),
      onTuiData: vi.fn().mockReturnValue(() => {}),
      onTerminalData: vi.fn().mockReturnValue(() => {}),
    };

    Object.assign(window, { piStudio: bridge });
  });

  afterEach(() => {
    delete (window as { piStudio?: DesktopBridge }).piStudio;
    snapshotListener = null;
    vi.restoreAllMocks();
  });

  it("renders the main workspace shell after bootstrap", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("demo").length).toBeGreaterThan(0);
      expect(screen.getAllByText("alpha").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Thread one").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Thread two").length).toBeGreaterThan(0);
      expect(screen.queryByText("Master")).not.toBeInTheDocument();
      expect(screen.queryByText("I can steer the other sessions from here.")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Toggle master session" })).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "GUI" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "TUI" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle terminal panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle file tree panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle artifacts panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle artifacts panel" })).toBeDisabled();
      expect(screen.queryByRole("button", { name: "Toggle diff panel" })).not.toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Add attachment" }).length).toBeGreaterThan(0);
      expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeInTheDocument();
    });
  });

  it("keeps the master bar hidden in the main workspace header", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText("Master")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Toggle master session" })).not.toBeInTheDocument();
    });
  });

  it("resizes the sidebar with the separator controls", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("separator", { name: "Resize sidebar" })).toBeInTheDocument();
    });

    const handle = screen.getByRole("separator", { name: "Resize sidebar" });
    const sidebarShell = handle.parentElement;
    if (!sidebarShell) {
      throw new Error("sidebar shell missing");
    }

    const startingWidth = Number.parseInt(sidebarShell.style.width, 10);
    expect(startingWidth).toBeGreaterThanOrEqual(260);

    fireEvent.keyDown(handle, { key: "ArrowRight" });

    expect(sidebarShell).toHaveStyle({ width: `${startingWidth + 16}px` });
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

  it("creates a new gui thread for an inactive project from its row action", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create thread in alpha" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Create thread in alpha" }));

    expect(bridge.createThread).toHaveBeenCalledWith("p2", undefined);
  });

  it("deletes a project from the project row action", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "empty" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete project empty" }));

    expect(confirmSpy).toHaveBeenCalledWith('Remove "empty" from Pi Studio? This only removes it from the sidebar.');
    expect(bridge.removeProject).toHaveBeenCalledWith("p3");
  });

  it("deletes a thread from the sidebar hover action", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Delete thread Thread one in demo" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Delete thread Thread one in demo" }));

    expect(confirmSpy).toHaveBeenCalledWith('Delete "Thread one"? This removes the saved session.');
    expect(bridge.deleteThread).toHaveBeenCalledWith({ projectId: "p1", sessionFile: "/tmp/demo/session.jsonl" });
  });

  it("opens the latest thread when clicking a project name", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "alpha" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "alpha" }));

    expect(bridge.openThread).toHaveBeenCalledWith("p2", "/tmp/alpha/session.jsonl", undefined);
  });

  it("uses brighter hover treatments for project and thread rows in the sidebar", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "alpha" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Thread Thread two in demo" })).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "alpha" }).className).toContain("group-hover:text-foreground");
    expect(screen.getByRole("button", { name: "Thread Thread two in demo" }).className).toContain("group-hover:text-foreground");
  });

  it("searches session content and opens a matching result", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Search sessions" }), {
      target: { value: "match" },
    });

    await waitFor(() => {
      expect(bridge.searchSessions).toHaveBeenCalledWith({ query: "match" });
      expect(screen.getByRole("button", { name: /Alpha latest/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Alpha latest/i }));

    expect(bridge.openThread).toHaveBeenCalledWith("p2", "/tmp/alpha/session.jsonl", undefined);
  });

  it("toggles the browser surface for the active thread", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Agent browser surface", { selector: "aside" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Toggle browser panel" }));

    await waitFor(() => {
      const visibleBrowserSurface = screen.getByLabelText("Agent browser surface", { selector: "aside" });
      expect(visibleBrowserSurface.closest("[aria-hidden='true']")).toBeNull();
      expect(screen.getByRole("separator", { name: "Resize utility panel" })).toBeInTheDocument();
    });
  });

  it("resizes the right-side utility panel when the browser is open", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle browser panel" }));

    await waitFor(() => {
      expect(screen.getByRole("separator", { name: "Resize utility panel" })).toBeInTheDocument();
    });

    const handle = screen.getByRole("separator", { name: "Resize utility panel" });
    const startingWidth = Number.parseInt(handle.style.right, 10);
    expect(startingWidth).toBeGreaterThanOrEqual(416);

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(handle).toHaveStyle({ right: `${startingWidth + 16}px` });
  });

  it("keeps the browser utility panel at a readable minimum width", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle browser panel" }));

    await waitFor(() => {
      expect(screen.getByRole("separator", { name: "Resize utility panel" })).toBeInTheDocument();
    });

    const handle = screen.getByRole("separator", { name: "Resize utility panel" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "ArrowRight" });

    expect(Number.parseInt(handle.style.right, 10)).toBeGreaterThanOrEqual(416);
  });

  it("opens the artifacts side panel and shows the latest artifact revision for the active chat", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    vi.mocked(bridge.bootstrap).mockResolvedValueOnce({
      ...snapshot,
      gui: {
        ...snapshot.gui,
        messages: [
          {
            id: "tool-1",
            role: "toolResult",
            toolName: "artifact",
            content: ['Saved artifact "Quarterly Report" (report) for this chat.'],
            details: {
              artifact: {
                id: "report",
                title: "Quarterly Report",
                summary: "Latest revision",
                kind: "react-tsx",
                tsx: "export default function ArtifactApp() { return <main>Hello</main>; }",
              },
            },
          },
        ],
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle artifacts panel" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle artifacts panel" })).not.toBeDisabled();
      expect(screen.queryByRole("button", { name: "Open artifact Quarterly Report" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle artifacts panel" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Session artifacts surface")).toBeInTheDocument();
      expect(screen.getByText("Artifacts in this chat")).toBeInTheDocument();
      expect(screen.getAllByText("Latest revision").length).toBeGreaterThan(0);
    });
  });

  it("does not keep showing a previous thread artifact after switching to a thread with none", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    vi.mocked(bridge.bootstrap).mockResolvedValueOnce({
      ...snapshot,
      gui: {
        ...snapshot.gui,
        messages: [
          {
            id: "tool-1",
            role: "toolResult",
            toolName: "artifact",
            content: ['Saved artifact "Quarterly Report" (report) for this chat.'],
            details: {
              artifact: {
                id: "report",
                title: "Quarterly Report",
                summary: "Latest revision",
                kind: "react-tsx",
                tsx: "export default function ArtifactApp() { return <main>Hello</main>; }",
              },
            },
          },
        ],
      },
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Toggle artifacts panel" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Toggle artifacts panel" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Session artifacts surface")).toBeInTheDocument();
      expect(screen.getAllByText("Quarterly Report").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Expand alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Thread Alpha latest in alpha" }));

    expect(screen.queryByText("Quarterly Report")).not.toBeInTheDocument();

    await act(async () => {
      snapshotListener?.({
        ...snapshot,
        activeProjectId: "p2",
        gui: {
          ...snapshot.gui,
          projectId: "p2",
          sessionFile: "/tmp/alpha/session.jsonl",
          sessionTitle: "Alpha latest",
          cwd: "/tmp/alpha",
          messages: [],
        },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText("Quarterly Report")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle artifacts panel" })).toBeDisabled();
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

  it("shows theme and master-session controls in the settings menu", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Settings/i }));

    expect(screen.getByRole("menuitem", { name: /Open settings/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /dark mode|light mode/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Extensions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Skills/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /App settings/i })).not.toBeInTheDocument();
  });

  it("opens the full settings surface from the sidebar settings menu", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio;
    if (!bridge) {
      throw new Error("desktop bridge missing");
    }

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Settings/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Open settings/i }));

    expect(bridge.setMode).toHaveBeenCalledWith("settings");
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
