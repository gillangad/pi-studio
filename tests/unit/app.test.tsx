import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
import type { FileTreeNode, GuiState, StudioSnapshot } from "../../src/shared/types";

const emptyResources = {
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
};

function makeGuiState(
  sessionId: string,
  title: string,
  sessionFile: string | null,
  projectId = "p1",
  cwd = "/tmp/demo",
): GuiState {
  return {
    sessionId,
    projectId,
    sessionFile,
    sessionTitle: title,
    cwd,
    isStreaming: false,
    messages: [],
    resources: emptyResources,
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

const workerOne = makeGuiState("worker-a1-1", "Thread one", "/tmp/demo/session.jsonl", "p1", "/tmp/demo");
const workerTwo = makeGuiState("worker-b2-1", "Thread two", "/tmp/alpha/session-2.jsonl", "p2", "/tmp/alpha");
const controller = makeGuiState("controller", "Master controller", "/tmp/controller/session.jsonl", "p1", "/tmp/projects");

const snapshot: StudioSnapshot = {
  projects: [
    { id: "p1", name: "demo", path: "/tmp/demo", isFavorite: false, isGitRepo: false, isGitHubRepo: false },
    { id: "p2", name: "alpha", path: "/tmp/alpha", isFavorite: false, isGitRepo: false, isGitHubRepo: false },
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
        updatedAt: new Date(Date.now() - 4_000).toISOString(),
        updatedAtMs: Date.now() - 4_000,
        ageLabel: "now",
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
        sessionFile: "/tmp/alpha/session-2.jsonl",
        title: "Thread two",
        updatedAt: new Date(Date.now() - 8_000).toISOString(),
        updatedAtMs: Date.now() - 8_000,
        ageLabel: "now",
        messageCount: 3,
        isPinned: false,
        isArchived: false,
        running: false,
      },
    ],
  },
  activeProjectId: "p1",
  activeMode: "gui",
  controller,
  studio: {
    projectId: "p1",
    controllerSessionId: "controller",
    workerSessionIds: ["worker-a1-1", "worker-b2-1"],
    sessions: {
      "worker-a1-1": {
        sessionId: "worker-a1-1",
        role: "worker",
        projectId: "p1",
        sessionFile: "/tmp/demo/session.jsonl",
        sessionTitle: "Thread one",
        cwd: "/tmp/demo",
        isStreaming: false,
        statusText: null,
        errorText: null,
        lastMessagePreview: "Fix the sidebar bug",
        lastActivityAt: new Date().toISOString(),
      },
      "worker-b2-1": {
        sessionId: "worker-b2-1",
        role: "worker",
        projectId: "p2",
        sessionFile: "/tmp/alpha/session-2.jsonl",
        sessionTitle: "Thread two",
        cwd: "/tmp/alpha",
        isStreaming: false,
        statusText: null,
        errorText: null,
        lastMessagePreview: "Investigate session routing",
        lastActivityAt: new Date().toISOString(),
      },
    },
  },
  gui: {
    ...workerOne,
    activeSessionId: "worker-a1-1",
    sessions: {
      "worker-a1-1": workerOne,
      "worker-b2-1": workerTwo,
    },
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
    masterSessionPath: "/tmp/projects",
    homeDirectoryPath: "/home/test",
  },
};

const blankSnapshot: StudioSnapshot = {
  ...snapshot,
  studio: {
    projectId: "p1",
    controllerSessionId: "controller",
    workerSessionIds: [],
    sessions: {},
  },
  gui: {
    ...makeGuiState("", "Canvas", null, "p1", "/tmp/projects"),
    projectId: "p1",
    sessionFile: null,
    cwd: "/tmp/projects",
    activeSessionId: undefined,
    sessions: {},
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
      closeSession: vi.fn().mockResolvedValue(snapshot),
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
      chooseMasterSessionDirectory: vi.fn().mockResolvedValue(snapshot),
      setMasterSessionDirectoryToHome: vi.fn().mockResolvedValue(snapshot),
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
      searchSessions: vi.fn().mockResolvedValue([]),
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

  it("renders the multi-session workspace after bootstrap", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("/tmp/projects")).toBeInTheDocument();
      expect(screen.getAllByText("demo").length).toBeGreaterThan(0);
      expect(screen.getAllByText("alpha").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Thread one").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Thread two").length).toBeGreaterThan(0);
      expect(screen.queryByText("Worker sessions")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeInTheDocument();
    });
  });

  it("starts with only the master session when no workers are open", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio!;
    bridge.bootstrap = vi.fn().mockResolvedValue(blankSnapshot);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("/tmp/projects")).toBeInTheDocument();
      expect(screen.queryByText("Worker sessions")).not.toBeInTheDocument();
      expect(screen.queryByText(/Focused:/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Toggle browser panel" })).toBeEnabled();
    });
  });

  it("sends prompts through the master composer to the controller session", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio!;
    render(<App />);

    const composer = await screen.findByPlaceholderText(
      "Ask Pi to create a session, delegate work, or steer the canvas",
    );
    fireEvent.change(composer, { target: { value: "Tell worker-2 to inspect auth flow" } });
    fireEvent.keyDown(composer, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(bridge.sendPrompt).toHaveBeenCalledWith({
        text: "Tell worker-2 to inspect auth flow",
        sessionId: "controller",
      });
    });
  });

  it("sends prompts directly to a worker card", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio!;
    render(<App />);

    const workerCard = await screen.findByLabelText("Thread one");
    const workerComposer = within(workerCard).getByPlaceholderText("Message Thread one");
    fireEvent.change(workerComposer, { target: { value: "Fix the failing tests" } });
    fireEvent.keyDown(workerComposer, { key: "Enter", ctrlKey: true });

    await waitFor(() => {
      expect(bridge.sendPrompt).toHaveBeenCalledWith({
        text: "Fix the failing tests",
        sessionId: "worker-a1-1",
      });
    });
  });

  it("closes worker sessions directly from the card chrome", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio!;
    render(<App />);

    fireEvent.click(await screen.findByRole("button", { name: "Close Thread two" }));

    await waitFor(() => {
      expect(bridge.closeSession).toHaveBeenCalledWith("worker-b2-1");
    });
  });

  it("opens the file tree in the right utility panel", async () => {
    const bridge = (window as { piStudio?: DesktopBridge }).piStudio!;
    render(<App />);

    await screen.findByRole("button", { name: "Toggle file tree panel" });
    fireEvent.click(screen.getByRole("button", { name: "Toggle file tree panel" }));

    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeInTheDocument();
      expect(bridge.getProjectFileTree).toHaveBeenCalledWith({ projectId: "p1" });
    });
  });

  it("shows a bootstrap error when the desktop bridge is unavailable", async () => {
    delete (window as { piStudio?: DesktopBridge }).piStudio;

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Pi Studio failed to start")).toBeInTheDocument();
      expect(screen.getByText(/desktop bridge is unavailable/i)).toBeInTheDocument();
    });
  });
});
