export type StudioMode = "gui" | "tui" | "git" | "extensions" | "skills" | "settings";

export type UiMessageRole =
  | "user"
  | "assistant"
  | "toolResult"
  | "bashExecution"
  | "custom"
  | "branchSummary"
  | "compactionSummary"
  | "system";

export type UiToolDetails = {
  diff?: string;
  firstChangedLine?: number | null;
};

export type UiMessage = {
  id: string;
  role: UiMessageRole;
  content: string[];
  timestamp?: string | number;
  toolName?: string;
  isError?: boolean;
  command?: string;
  output?: string[];
  exitCode?: number | null;
  cancelled?: boolean;
  truncated?: boolean;
  customType?: string;
  thinkingContent?: string[];
  thinkingHeaders?: string[];
  thinkingRedacted?: boolean;
  details?: unknown;
  toolDetails?: UiToolDetails;
};

export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  isFavorite?: boolean;
  isGitRepo?: boolean;
  isGitHubRepo?: boolean;
};

export type ThreadSummary = {
  id: string;
  sessionId: string;
  sessionFile: string;
  title: string;
  updatedAt: string;
  updatedAtMs: number;
  ageLabel: string;
  messageCount: number;
  isPinned: boolean;
  isArchived: boolean;
  running: boolean;
};

export type ProjectThreadsMap = Record<string, ThreadSummary[]>;

export type SessionSearchResult = {
  projectId: string;
  projectName: string;
  sessionFile: string;
  threadTitle: string;
  ageLabel: string;
  excerpt: string;
  matchedIn: "title" | "content";
};

export type SessionTreeFilterMode = "default" | "user-only" | "all";

export type SessionTreeEntryKind =
  | "message"
  | "branch_summary"
  | "compaction"
  | "custom"
  | "custom_message"
  | "label"
  | "session_info"
  | "model_change"
  | "thinking_level_change";

export type SessionTreeNode = {
  id: string;
  parentId: string | null;
  timestamp: string;
  label?: string;
  labelTimestamp?: string;
  kind: SessionTreeEntryKind;
  role?: UiMessageRole;
  preview: string;
  children: SessionTreeNode[];
};

export type SessionTreeSnapshot = {
  leafId: string | null;
  nodes: SessionTreeNode[];
};

export type NavigateTreeOptions = {
  summarize?: boolean;
  customInstructions?: string;
  replaceInstructions?: boolean;
  label?: string;
};

export type NavigateTreeResult = {
  cancelled: boolean;
  aborted?: boolean;
  editorText?: string;
};

export type ModelSummary = {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
};

export type StreamingBehaviorPreference = "steer" | "followUp";

export type AttachmentSummary = {
  id: string;
  name: string;
  path: string;
};

export type SlashCommandSummary = {
  command: string;
  description: string;
  source: "builtin" | "resource";
};

export type FileTreeNode = {
  name: string;
  path: string;
  kind: "file" | "directory";
  children?: FileTreeNode[];
};

export type ResourceSummary = {
  extensions: number;
  skills: number;
  prompts: number;
  themes: number;
  agentsFiles: number;
  extensionEntries: ResourceEntrySummary[];
  extensionNames: string[];
  skillEntries: ResourceEntrySummary[];
  skillNames: string[];
  promptNames: string[];
  themeNames: string[];
  agentsFilePaths: string[];
};

export type ResourceOrigin = "bundled" | "userInstalled";

export type ResourceEntrySummary = {
  name: string;
  path: string | null;
  origin: ResourceOrigin;
};

export type GuiSessionState = {
  sessionId: string;
  projectId: string | null;
  sessionFile: string | null;
  sessionTitle: string;
  cwd: string | null;
  isStreaming: boolean;
  messages: UiMessage[];
  resources: ResourceSummary;
  statusText: string | null;
  errorText: string | null;
  model: ModelSummary | null;
  availableModels: ModelSummary[];
  thinkingLevel: string;
  availableThinkingLevels: string[];
  streamingBehaviorPreference: StreamingBehaviorPreference;
  attachments: AttachmentSummary[];
  slashCommands: SlashCommandSummary[];
};

export type GuiState = GuiSessionState & {
  activeSessionId?: string;
  sessions?: Record<string, GuiSessionState>;
};

export type StudioSessionRole = "controller" | "worker";

export type StudioSessionSummary = {
  sessionId: string;
  role: StudioSessionRole;
  projectId: string | null;
  sessionFile: string | null;
  sessionTitle: string;
  cwd: string | null;
  isStreaming: boolean;
  statusText: string | null;
  errorText: string | null;
  lastMessagePreview: string | null;
  lastActivityAt: string | null;
};

export type StudioCanvasState = {
  projectId: string | null;
  controllerSessionId: string | null;
  focusedSessionId: string | null;
  workerSessionIds: string[];
  sessions: Record<string, StudioSessionSummary>;
};

export type TuiState = {
  active: boolean;
  projectId: string | null;
  cwd: string | null;
  status: "idle" | "starting" | "running" | "stopped" | "error";
  errorText: string | null;
  runningInBackground: boolean;
  sessions?: Record<
    string,
    {
      sessionId: string;
      active: boolean;
      projectId: string | null;
      cwd: string | null;
      status: "idle" | "starting" | "running" | "stopped" | "error";
      errorText: string | null;
    }
  >;
};

export type TerminalState = {
  active: boolean;
  projectId: string | null;
  cwd: string | null;
  status: "idle" | "starting" | "running" | "stopped" | "error";
  errorText: string | null;
  sessions?: Record<
    string,
    {
      sessionId: string;
      active: boolean;
      projectId: string | null;
      cwd: string | null;
      status: "idle" | "starting" | "running" | "stopped" | "error";
      errorText: string | null;
    }
  >;
};

export type GitDiffBaseline = "working" | "head" | "head~1";

export type GitChangedFile = {
  path: string;
  status: string;
};

export type GitComment = {
  id: string;
  filePath: string;
  text: string;
  createdAt: string;
};

export type GitState = {
  projectId: string | null;
  isGitRepo: boolean;
  branch: string | null;
  baseline: GitDiffBaseline;
  changedFiles: GitChangedFile[];
  diffText: string;
  comments: GitComment[];
  loading: boolean;
  errorText: string | null;
};

export type SettingsState = {
  agentDir: string | null;
  currentProjectPath: string | null;
  currentSessionFile: string | null;
  currentMode: StudioMode;
};

export type StudioSnapshot = {
  projects: ProjectRecord[];
  threadsByProject: ProjectThreadsMap;
  activeProjectId: string | null;
  activeMode: StudioMode;
  controller: GuiSessionState | null;
  studio: StudioCanvasState;
  gui: GuiState;
  tui: TuiState;
  terminal: TerminalState;
  git: GitState;
  settings: SettingsState;
};

export type TerminalChunk = {
  data: string;
  sessionId?: string;
};

export type TerminalResize = {
  cols: number;
  rows: number;
  sessionId?: string;
};
