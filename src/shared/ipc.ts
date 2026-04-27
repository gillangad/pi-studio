import type {
  FileTreeNode,
  GitComment,
  GitDiffBaseline,
  NavigateTreeOptions,
  NavigateTreeResult,
  SessionSearchResult,
  SessionTreeSnapshot,
  SlashCommandSummary,
  StudioMode,
  StudioSnapshot,
  StreamingBehaviorPreference,
  TerminalChunk,
  TerminalResize,
} from "./types";

export const IPC_CHANNELS = {
  invoke: {
    bootstrap: "pi-studio:bootstrap",
    addProject: "pi-studio:add-project",
    selectProject: "pi-studio:select-project",
    reorderProjects: "pi-studio:reorder-projects",
    renameProject: "pi-studio:rename-project",
    removeProject: "pi-studio:remove-project",
    toggleProjectFavorite: "pi-studio:toggle-project-favorite",
    createThread: "pi-studio:create-thread",
    openThread: "pi-studio:open-thread",
    deleteThread: "pi-studio:delete-thread",
    toggleThreadPinned: "pi-studio:toggle-thread-pinned",
    toggleThreadArchived: "pi-studio:toggle-thread-archived",
    sendPrompt: "pi-studio:send-prompt",
    abortPrompt: "pi-studio:abort-prompt",
    pickAttachments: "pi-studio:pick-attachments",
    removeAttachment: "pi-studio:remove-attachment",
    clearAttachments: "pi-studio:clear-attachments",
    setModel: "pi-studio:set-model",
    setThinkingLevel: "pi-studio:set-thinking-level",
    setStreamingBehavior: "pi-studio:set-streaming-behavior",
    setMode: "pi-studio:set-mode",
    startTui: "pi-studio:start-tui",
    stopTui: "pi-studio:stop-tui",
    resizeTui: "pi-studio:resize-tui",
    tuiInput: "pi-studio:tui-input",
    startTerminal: "pi-studio:start-terminal",
    stopTerminal: "pi-studio:stop-terminal",
    resizeTerminal: "pi-studio:resize-terminal",
    terminalInput: "pi-studio:terminal-input",
    refreshGitState: "pi-studio:refresh-git-state",
    setGitBaseline: "pi-studio:set-git-baseline",
    addGitComment: "pi-studio:add-git-comment",
    removeGitComment: "pi-studio:remove-git-comment",
    getProjectFileTree: "pi-studio:get-project-file-tree",
    searchSessions: "pi-studio:search-sessions",
    getSessionTree: "pi-studio:get-session-tree",
    navigateTree: "pi-studio:navigate-tree",
    runSlashCommand: "pi-studio:run-slash-command",
    getBrowserCdpTarget: "pi-studio:get-browser-cdp-target",
  },
  push: {
    snapshot: "pi-studio:snapshot",
    tuiData: "pi-studio:tui-data",
    terminalData: "pi-studio:terminal-data",
  },
} as const;

export type BootstrapResponse = StudioSnapshot;

export type GuiSessionPayload = {
  sessionId?: string;
};

export type SendPromptPayload = GuiSessionPayload & {
  text: string;
};

export type SetModelPayload = GuiSessionPayload & {
  provider: string;
  modelId: string;
};

export type ToggleThreadPayload = {
  projectId: string;
  sessionFile: string;
};

export type OpenThreadPayload = ToggleThreadPayload & GuiSessionPayload;

export type CreateThreadPayload = GuiSessionPayload & {
  projectId: string;
};

export type GitCommentPayload = {
  filePath: string;
  text: string;
};

export type TuiSessionPayload = {
  sessionId?: string;
};

export type BrowserCdpTargetPayload = {
  url?: string;
  title?: string;
};

export type ProjectFileTreePayload = {
  projectId?: string;
};

export type SearchSessionsPayload = {
  query: string;
};

export type NavigateTreePayload = GuiSessionPayload & {
  targetId: string;
  options?: NavigateTreeOptions;
};

export type RunSlashCommandPayload = GuiSessionPayload & {
  text: string;
};

export type RunSlashCommandResult = {
  handled: boolean;
  openTree?: boolean;
  openSettings?: boolean;
  openModelPicker?: boolean;
  statusText?: string | null;
  errorText?: string | null;
  slashCommands?: SlashCommandSummary[];
};

export type BrowserCdpTarget = {
  id: string;
  webSocketDebuggerUrl: string;
  url: string;
  title: string;
};

export type DesktopBridge = {
  bootstrap(): Promise<BootstrapResponse>;
  addProject(): Promise<StudioSnapshot>;
  selectProject(projectId: string): Promise<StudioSnapshot>;
  reorderProjects(projectIds: string[]): Promise<StudioSnapshot>;
  renameProject(projectId: string, name: string): Promise<StudioSnapshot>;
  removeProject(projectId: string): Promise<StudioSnapshot>;
  toggleProjectFavorite(projectId: string): Promise<StudioSnapshot>;
  createThread(projectId: string, sessionId?: string): Promise<StudioSnapshot>;
  openThread(projectId: string, sessionFile: string, sessionId?: string): Promise<StudioSnapshot>;
  deleteThread(payload: ToggleThreadPayload): Promise<StudioSnapshot>;
  toggleThreadPinned(payload: ToggleThreadPayload): Promise<StudioSnapshot>;
  toggleThreadArchived(payload: ToggleThreadPayload): Promise<StudioSnapshot>;
  sendPrompt(payload: SendPromptPayload): Promise<StudioSnapshot>;
  abortPrompt(payload?: GuiSessionPayload): Promise<StudioSnapshot>;
  pickAttachments(payload?: GuiSessionPayload): Promise<StudioSnapshot>;
  removeAttachment(attachmentId: string, sessionId?: string): Promise<StudioSnapshot>;
  clearAttachments(payload?: GuiSessionPayload): Promise<StudioSnapshot>;
  setModel(payload: SetModelPayload): Promise<StudioSnapshot>;
  setThinkingLevel(level: string, sessionId?: string): Promise<StudioSnapshot>;
  setStreamingBehavior(mode: StreamingBehaviorPreference): Promise<StudioSnapshot>;
  setMode(mode: StudioMode): Promise<StudioSnapshot>;
  startTui(payload?: TuiSessionPayload): Promise<StudioSnapshot>;
  stopTui(payload?: TuiSessionPayload): Promise<StudioSnapshot>;
  resizeTui(size: TerminalResize): void;
  tuiInput(chunk: TerminalChunk): void;
  startTerminal(payload?: TuiSessionPayload): Promise<StudioSnapshot>;
  stopTerminal(payload?: TuiSessionPayload): Promise<StudioSnapshot>;
  resizeTerminal(size: TerminalResize): void;
  terminalInput(chunk: TerminalChunk): void;
  refreshGitState(): Promise<StudioSnapshot>;
  setGitBaseline(baseline: GitDiffBaseline): Promise<StudioSnapshot>;
  addGitComment(payload: GitCommentPayload): Promise<StudioSnapshot>;
  removeGitComment(commentId: string): Promise<StudioSnapshot>;
  getProjectFileTree(payload?: ProjectFileTreePayload): Promise<FileTreeNode[]>;
  searchSessions(payload: SearchSessionsPayload): Promise<SessionSearchResult[]>;
  getSessionTree(payload?: GuiSessionPayload): Promise<SessionTreeSnapshot>;
  navigateTree(payload: NavigateTreePayload): Promise<NavigateTreeResult>;
  runSlashCommand(payload: RunSlashCommandPayload): Promise<RunSlashCommandResult>;
  getBrowserCdpTarget(payload: BrowserCdpTargetPayload): Promise<BrowserCdpTarget | null>;
  onSnapshot(callback: (snapshot: StudioSnapshot) => void): () => void;
  onTuiData(callback: (chunk: TerminalChunk) => void): () => void;
  onTerminalData(callback: (chunk: TerminalChunk) => void): () => void;
};

export type { GitComment };
