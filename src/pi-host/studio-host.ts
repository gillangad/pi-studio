import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { stat } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app, clipboard, dialog } from "electron";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import type {
  AttachmentSummary,
  GitComment,
  GitDiffBaseline,
  GitState,
  FileTreeNode,
  ModelSummary,
  NavigateTreeOptions,
  NavigateTreeResult,
  ProjectRecord,
  ProjectThreadsMap,
  ResourceSummary,
  SessionSearchResult,
  SlashCommandSummary,
  SessionTreeNode,
  SessionTreeSnapshot,
  TerminalState,
  StreamingBehaviorPreference,
  StudioMode,
  StudioSnapshot,
  StudioSessionRole,
  ThreadSummary,
} from "../shared/types";
import type { RunSlashCommandResult } from "../shared/ipc";
import { createNoopExtensionBindings } from "./extension-bindings";
import {
  emptyResourceSummary,
  mapAgentMessages,
  mapResourceSummary,
  normalizeThreadTitle,
} from "./message-mapper";
import { resolveLaunchProjectPathCandidate } from "./launch-path";
import { TuiTerminal } from "./tui-terminal";
import {
  ensureWorkspaceSelection,
  type StudioProjectState,
  type ThreadMetadata,
  type WorkspaceState,
} from "./workspace-bootstrap";
import { WorkspaceStore } from "./workspace-store";
import { getPiStudioBuiltinResources } from "./builtin-resources";
import { getPiStudioInitialActiveToolNames, shouldUsePiStudioBuiltins } from "./builtin-selection";
import {
  registerPiStudioSessionRuntime,
  type SessionToolRequest,
  type SessionToolResponse,
} from "./session-extension-runtime";

type StudioHostOptions = {
  storePath: string;
  launchProjectPath?: string | null;
  onSnapshot: (snapshot: StudioSnapshot) => void;
  onTuiData: (chunk: { sessionId: string; data: string }) => void;
  onTerminalData: (chunk: { sessionId: string; data: string }) => void;
};

type GuiSessionRuntime = {
  id: string;
  role: StudioSessionRole;
  session: any;
  unsubscribe: (() => void) | null;
  projectId: string;
  projectPath: string;
  sessionFile: string | null;
  sessionTitle: string;
  messages: StudioSnapshot["gui"]["messages"];
  isStreaming: boolean;
  statusText: string | null;
  errorText: string | null;
  resourceSummary: ResourceSummary;
  model: ModelSummary | null;
  thinkingLevel: string;
  availableThinkingLevels: string[];
  attachments: AttachmentSummary[];
  slashCommands: SlashCommandSummary[];
  resourceLoader: any;
  usePiStudioBuiltins: boolean;
  lastActivityAt: string | null;
};

type SessionTreeEntryLike = {
  entry: {
  id: string;
  parentId: string | null;
  timestamp: string;
  type: string;
  summary?: string;
  customType?: string;
  thinkingLevel?: string;
  provider?: string;
  modelId?: string;
  message?: {
    role?: string;
    content?: string | Array<{ type?: string; text?: string; thinking?: string }>;
  };
  content?: string | Array<{ type?: string; text?: string }>;
  };
  label?: string;
  labelTimestamp?: string;
  children?: SessionTreeEntryLike[];
};

type TuiSessionRuntime = {
  terminal: TuiTerminal;
  status: StudioSnapshot["tui"]["status"];
  errorText: string | null;
  projectId: string | null;
  cwd: string | null;
  sessionFile: string | null;
};

type TerminalSessionRuntime = {
  terminal: TuiTerminal;
  status: TerminalState["status"];
  errorText: string | null;
  projectId: string | null;
  cwd: string | null;
};

type OpenSessionOptions =
  | { kind: "continue" }
  | { kind: "new" }
  | { kind: "open"; sessionFile: string };

type SessionOpenConfig = {
  sessionId: string;
  role: StudioSessionRole;
  options: OpenSessionOptions;
  sessionDir?: string;
  runtimeProjectId?: string;
};

type SessionInfoLike = {
  id: string;
  path: string;
  name?: string;
  firstMessage?: string;
  modified?: Date | string;
  messageCount?: number;
};

type ProjectGitInfo = {
  isGitRepo: boolean;
  isGitHubRepo: boolean;
  branch: string | null;
};

const execFileAsync = promisify(execFile);
const OLD_THREAD_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const RESOURCE_LOADER_RELOAD_INTERVAL_MS = 15_000;
const FILE_TREE_DEPTH_LIMIT = 4;
const FILE_TREE_IGNORES = new Set([".git", "node_modules", "out", "dist", ".next"]);
const SEARCH_RESULT_LIMIT = 50;
const CONTROLLER_SESSION_ID = "controller";
const CONTROLLER_WORKSPACE_ID = "__master__";
const CONTROLLER_SESSION_DIR = path.join(getAgentDir(), "pi-studio", "master");
const BUILTIN_SLASH_COMMANDS = [
  { name: "settings", description: "Open settings menu" },
  { name: "model", description: "Select model (opens selector UI)" },
  { name: "scoped-models", description: "Enable/disable models for Ctrl+P cycling" },
  { name: "export", description: "Export session (HTML default, or specify path: .html/.jsonl)" },
  { name: "import", description: "Import and resume a session from a JSONL file" },
  { name: "share", description: "Share session as a secret GitHub gist" },
  { name: "copy", description: "Copy last agent message to clipboard" },
  { name: "name", description: "Set session display name" },
  { name: "session", description: "Show session info and stats" },
  { name: "changelog", description: "Show changelog entries" },
  { name: "hotkeys", description: "Show all keyboard shortcuts" },
  { name: "fork", description: "Create a new fork from a previous message" },
  { name: "tree", description: "Navigate session tree (switch branches)" },
  { name: "login", description: "Login with OAuth provider" },
  { name: "logout", description: "Logout from OAuth provider" },
  { name: "new", description: "Start a new session" },
  { name: "compact", description: "Manually compact the session context" },
  { name: "resume", description: "Resume a different session" },
  { name: "reload", description: "Reload keybindings, extensions, skills, prompts, and themes" },
  { name: "quit", description: "Quit pi" },
] as const;
const BUILTIN_SLASH_COMMAND_SUMMARIES: SlashCommandSummary[] = BUILTIN_SLASH_COMMANDS.map((entry) => ({
  command: `/${entry.name}`,
  description: entry.description,
  source: "builtin",
}));

type ResourceLoaderProfile = "default" | "studioBuiltins";

function isPrimaryWorkspaceMode(mode: StudioMode) {
  return mode === "gui";
}

export class StudioHost {
  private readonly store: WorkspaceStore;
  private readonly authStorage = AuthStorage.create();
  private readonly modelRegistry = ModelRegistry.create(this.authStorage);

  private workspaceState: WorkspaceState = {
    projects: [],
    activeProjectId: null,
    activeMode: "gui",
    masterSessionPath: null,
    projectFavorites: {},
    threadMetadataByProject: {},
    gitCommentsByProject: {},
    gitBaselineByProject: {},
    studioSessionsByProject: {},
  };

  private threadCache: ProjectThreadsMap = {};
  private projectGitInfo: Record<string, ProjectGitInfo> = {};
  private guiSessions: Record<string, GuiSessionRuntime> = {};
  private activeGuiSessionId: string | null = null;
  private currentSession: any = null;
  private currentResourceLoader: any = null;
  private resourceLoadersByProject: Record<string, Partial<Record<ResourceLoaderProfile, any>>> = {};
  private resourceLoaderLastReloadMsByProject: Record<string, Partial<Record<ResourceLoaderProfile, number>>> = {};
  private currentProjectPath: string | null = null;
  private currentSessionFile: string | null = null;
  private currentSessionTitle = "Canvas";
  private guiMessages = [] as StudioSnapshot["gui"]["messages"];
  private guiStreaming = false;
  private guiStatusText: string | null = null;
  private guiErrorText: string | null = null;
  private resourceSummary: ResourceSummary = emptyResourceSummary();
  private editorDraft = "";
  private tuiSessions: Record<string, TuiSessionRuntime> = {};
  private terminalSessions: Record<string, TerminalSessionRuntime> = {};
  private streamingBehaviorPreference: StreamingBehaviorPreference = "followUp";
  private pendingAttachments: AttachmentSummary[] = [];
  private availableModels: ModelSummary[] = [];
  private currentModel: ModelSummary | null = null;
  private thinkingLevel = "medium";
  private availableThinkingLevels: string[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  private gitState: GitState = {
    projectId: null,
    isGitRepo: false,
    branch: null,
    baseline: "working",
    changedFiles: [],
    diffText: "",
    comments: [],
    loading: false,
    errorText: null,
  };

  constructor(private readonly options: StudioHostOptions) {
    this.store = new WorkspaceStore(options.storePath);
    registerPiStudioSessionRuntime({
      isControllerSession: (sessionFile?: string) => this.isControllerSessionFile(sessionFile),
      performAction: (request) => this.performSessionToolAction(request),
    });
  }

  private ensureTuiSession(sessionId: string): TuiSessionRuntime {
    const existing = this.tuiSessions[sessionId];
    if (existing) return existing;

    const runtime: TuiSessionRuntime = {
      terminal: new TuiTerminal({
        onData: (data) => this.options.onTuiData({ sessionId, data }),
        onExit: () => {
          const current = this.tuiSessions[sessionId];
          if (!current) return;
          current.status = "stopped";
          current.projectId = null;
          current.cwd = null;
          this.emitSnapshot();
        },
        onError: (error) => {
          const current = this.tuiSessions[sessionId];
          if (!current) return;
          current.status = "error";
          current.errorText = error.message;
          this.emitSnapshot();
        },
      }),
      status: "idle",
      errorText: null,
      projectId: null,
      cwd: null,
      sessionFile: null,
    };

    this.tuiSessions[sessionId] = runtime;
    return runtime;
  }

  private ensureTerminalSession(sessionId: string): TerminalSessionRuntime {
    const existing = this.terminalSessions[sessionId];
    if (existing) return existing;

    const runtime: TerminalSessionRuntime = {
      terminal: new TuiTerminal({
        onData: (data) => this.options.onTerminalData({ sessionId, data }),
        onExit: () => {
          const current = this.terminalSessions[sessionId];
          if (!current) return;
          current.status = "stopped";
          current.projectId = null;
          current.cwd = null;
          this.emitSnapshot();
        },
        onError: (error) => {
          const current = this.terminalSessions[sessionId];
          if (!current) return;
          current.status = "error";
          current.errorText = error.message;
          this.emitSnapshot();
        },
      }),
      status: "idle",
      errorText: null,
      projectId: null,
      cwd: null,
    };

    this.terminalSessions[sessionId] = runtime;
    return runtime;
  }

  private isProjectRunningInTui(projectId: string) {
    void projectId;
    return false;
  }

  private getGuiRuntime(sessionId: string | null = this.activeGuiSessionId) {
    if (!sessionId) return null;
    return this.guiSessions[sessionId] ?? null;
  }

  private getControllerRuntime() {
    return this.guiSessions[CONTROLLER_SESSION_ID] ?? null;
  }

  private getWorkerRuntimes(projectId?: string) {
    return Object.values(this.guiSessions)
      .filter((runtime) => runtime.role === "worker")
      .filter((runtime) => (projectId ? runtime.projectId === projectId : true));
  }

  private createDefaultStudioProjectState(): StudioProjectState {
    return {
      workerSessionOrder: [],
      sessionFilesBySessionId: {},
      nextWorkerNumber: 1,
    };
  }

  private getStudioProjectState(projectId: string) {
    if (!this.workspaceState.studioSessionsByProject[projectId]) {
      this.workspaceState.studioSessionsByProject[projectId] = this.createDefaultStudioProjectState();
    }

    return this.workspaceState.studioSessionsByProject[projectId]!;
  }

  private getHomeDirectoryPath() {
    try {
      return path.resolve(app.getPath("home"));
    } catch {
      return path.resolve(process.cwd());
    }
  }

  private getMasterSessionPath() {
    return path.resolve(this.workspaceState.masterSessionPath ?? this.getHomeDirectoryPath());
  }

  private getControllerWorkspaceProject(): ProjectRecord {
    const masterPath = this.getMasterSessionPath();
    return {
      id: CONTROLLER_WORKSPACE_ID,
      name: path.basename(masterPath) || masterPath,
      path: masterPath,
    };
  }

  private controllerSessionDir() {
    return CONTROLLER_SESSION_DIR;
  }

  private updateControllerProjectBinding() {
    const runtime = this.getControllerRuntime();
    if (!runtime) return;
    runtime.projectId = this.workspaceState.activeProjectId ?? CONTROLLER_WORKSPACE_ID;
  }

  private isControllerSessionFile(sessionFile?: string) {
    if (!sessionFile) return false;

    const normalized = path.resolve(sessionFile);
    const controllerRoot = path.resolve(this.controllerSessionDir());
    return normalized.startsWith(controllerRoot);
  }

  private async sessionFileExists(sessionFile: string | null | undefined) {
    if (!sessionFile) return false;

    try {
      await stat(sessionFile);
      return true;
    } catch {
      return false;
    }
  }

  private workerSessionIdPrefix(projectId: string) {
    return `worker-${projectId.slice(0, 4)}-`;
  }

  private formatWorkerSessionId(projectId: string, number: number) {
    return `${this.workerSessionIdPrefix(projectId)}${number}`;
  }

  private nextWorkerSessionId(projectId: string) {
    const studioState = this.getStudioProjectState(projectId);
    const nextNumber = Math.max(1, studioState.nextWorkerNumber);
    studioState.nextWorkerNumber = nextNumber + 1;
    return this.formatWorkerSessionId(projectId, nextNumber);
  }

  private normalizeStudioSessionIds() {
    const usedIds = new Set<string>();

    for (const project of this.workspaceState.projects) {
      const studioState = this.getStudioProjectState(project.id);
      const nextOrder: string[] = [];
      const nextFilesBySessionId: Record<string, string> = {};
      let maxNumber = 0;

      for (const previousSessionId of studioState.workerSessionOrder) {
        const sessionFile = studioState.sessionFilesBySessionId[previousSessionId];
        const parsedNumber = Number(previousSessionId.match(/(\d+)$/)?.[1] ?? "0");
        const preferredNumber = parsedNumber > 0 ? parsedNumber : maxNumber + 1;
        let candidate = this.formatWorkerSessionId(project.id, preferredNumber);
        let nextNumber = preferredNumber;

        while (usedIds.has(candidate)) {
          nextNumber += 1;
          candidate = this.formatWorkerSessionId(project.id, nextNumber);
        }

        usedIds.add(candidate);
        nextOrder.push(candidate);
        if (sessionFile) {
          nextFilesBySessionId[candidate] = sessionFile;
        }
        maxNumber = Math.max(maxNumber, nextNumber);
      }

      studioState.workerSessionOrder = nextOrder;
      studioState.sessionFilesBySessionId = nextFilesBySessionId;
      studioState.nextWorkerNumber = Math.max(maxNumber + 1, studioState.nextWorkerNumber, 1);
    }
  }

  private recordWorkerSession(projectId: string, sessionId: string, sessionFile: string | null) {
    const studioState = this.getStudioProjectState(projectId);

    if (!studioState.workerSessionOrder.includes(sessionId)) {
      studioState.workerSessionOrder.push(sessionId);
    }

    if (sessionFile) {
      studioState.sessionFilesBySessionId[sessionId] = sessionFile;
    }

  }

  private forgetWorkerSession(projectId: string, sessionId: string) {
    const studioState = this.getStudioProjectState(projectId);
    studioState.workerSessionOrder = studioState.workerSessionOrder.filter((entry) => entry !== sessionId);
    delete studioState.sessionFilesBySessionId[sessionId];
  }

  private clearLegacyGuiState(projectPath: string | null = null) {
    this.currentSession = null;
    this.currentResourceLoader = null;
    this.currentProjectPath = projectPath;
    this.currentSessionFile = null;
    this.currentSessionTitle = "Canvas";
    this.guiMessages = [];
    this.guiStreaming = false;
    this.guiStatusText = null;
    this.guiErrorText = null;
    this.resourceSummary = emptyResourceSummary();
    this.currentModel = null;
    this.pendingAttachments = [];
  }

  private disposeGuiRuntime(sessionId: string) {
    const runtime = this.guiSessions[sessionId];
    if (!runtime) return;

    runtime.unsubscribe?.();
    runtime.unsubscribe = null;
    runtime.session?.dispose?.();
    delete this.guiSessions[sessionId];
  }

  private async disposeAllGuiRuntimes() {
    for (const sessionId of Object.keys(this.guiSessions)) {
      this.disposeGuiRuntime(sessionId);
    }
  }

  private async disposeGuiRuntimesForThread(projectId: string, sessionFile: string) {
    for (const [sessionId, runtime] of Object.entries(this.guiSessions)) {
      if (runtime.projectId !== projectId || runtime.sessionFile !== sessionFile) continue;
      if (runtime.role === "worker") {
        this.forgetWorkerSession(projectId, sessionId);
      }
      this.disposeGuiRuntime(sessionId);
    }

    if (!this.activeGuiSessionId || !this.guiSessions[this.activeGuiSessionId]) {
      this.activeGuiSessionId = null;
      this.clearLegacyGuiState(this.getMasterSessionPath());
    }
  }

  private isThreadRunningInGui(projectId: string, sessionFile: string) {
    return Object.values(this.guiSessions).some(
      (runtime) =>
        runtime.projectId === projectId &&
        runtime.sessionFile === sessionFile &&
        (runtime.isStreaming || runtime.session?.isStreaming),
    );
  }

  private syncLegacyGuiStateFromRuntime(sessionId: string | null = this.activeGuiSessionId) {
    if (!sessionId) return;
    const runtime = this.guiSessions[sessionId];
    if (!runtime) return;

    this.currentSession = runtime.session;
    this.currentResourceLoader = runtime.resourceLoader;
    this.currentProjectPath = runtime.projectPath;
    this.currentSessionFile = runtime.sessionFile;
    this.currentSessionTitle = runtime.sessionTitle;
    this.guiMessages = runtime.messages;
    this.guiStreaming = runtime.isStreaming;
    this.guiStatusText = runtime.statusText;
    this.guiErrorText = runtime.errorText;
    this.resourceSummary = runtime.resourceSummary;
    this.currentModel = runtime.model;
    this.thinkingLevel = runtime.thinkingLevel;
    this.availableThinkingLevels = runtime.availableThinkingLevels;
    this.pendingAttachments = runtime.attachments;
  }

  private runtimeLastMessagePreview(runtime: GuiSessionRuntime | null) {
    const lastMessage = [...(runtime?.messages ?? [])]
      .reverse()
      .find((message) => message.role === "user" || message.role === "assistant");

    const preview = lastMessage?.content?.find((entry) => entry.trim().length > 0) ?? null;
    return preview ? preview.slice(0, 160) : null;
  }

  private async openControllerSession(options: OpenSessionOptions = { kind: "continue" }) {
    const controllerProject = this.getControllerWorkspaceProject();
    const existing = this.getControllerRuntime();
    if (existing?.projectPath === controllerProject.path && existing.sessionFile && options.kind === "continue") {
      this.updateControllerProjectBinding();
      return;
    }

    await this.openSessionForProject(controllerProject, {
      sessionId: CONTROLLER_SESSION_ID,
      role: "controller",
      options,
      sessionDir: this.controllerSessionDir(),
      runtimeProjectId: this.workspaceState.activeProjectId ?? CONTROLLER_WORKSPACE_ID,
    });
    this.updateControllerProjectBinding();
  }

  private async restoreWorkerSessionsForProject(project: ProjectRecord) {
    const studioState = this.getStudioProjectState(project.id);
    const restoredWorkerIds: string[] = [];

    for (const sessionId of studioState.workerSessionOrder) {
      const sessionFile = studioState.sessionFilesBySessionId[sessionId];
      if (!(await this.sessionFileExists(sessionFile))) {
        continue;
      }

      await this.openSessionForProject(project, {
        sessionId,
        role: "worker",
        options: { kind: "open", sessionFile },
      });
      restoredWorkerIds.push(sessionId);
    }

    studioState.workerSessionOrder = restoredWorkerIds;
    studioState.sessionFilesBySessionId = Object.fromEntries(
      restoredWorkerIds
        .map((sessionId) => [sessionId, this.guiSessions[sessionId]?.sessionFile ?? studioState.sessionFilesBySessionId[sessionId]])
        .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0),
    );
  }

  private async restoreVisibleStudioSessions() {
    await this.disposeAllGuiRuntimes();
    await this.openControllerSession({ kind: "continue" });

    for (const project of this.workspaceState.projects) {
      await this.restoreWorkerSessionsForProject(project);
    }

    this.activeGuiSessionId = null;
    this.clearLegacyGuiState(this.getMasterSessionPath());

    await this.persistWorkspace();
  }

  async initialize() {
    const launchProjectPath = await this.resolveLaunchProjectPath(this.options.launchProjectPath);
    const { state, changed } = ensureWorkspaceSelection({
      state: await this.store.load(),
      createProject: (projectPath) => this.store.createProject(projectPath),
      defaultProjectPath: process.cwd(),
      launchProjectPath,
    });

    this.workspaceState = state;
    this.normalizeStudioSessionIds();

    if ((this.workspaceState.activeMode as string) === "cockpit") {
      this.workspaceState.activeMode = "gui";
    }

    if (changed) {
      await this.persistWorkspace();
    }

    this.modelRegistry.refresh();
    this.availableModels = this.modelRegistry.getAvailable().map(this.modelToSummary);

    await this.refreshAllThreads();

    if (this.workspaceState.projects.length > 0) {
      await this.restoreVisibleStudioSessions();
      const activeProject = this.getActiveProject();
      if (activeProject) {
        await this.refreshGitState();
      }
    }

    if (this.workspaceState.activeMode === "tui") {
      await this.startTui();
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  getSnapshot(): StudioSnapshot {
    const projects = this.workspaceState.projects.map((project) => {
      const gitInfo = this.projectGitInfo[project.id] ?? {
        isGitRepo: false,
        isGitHubRepo: false,
        branch: null,
      };

      return {
        ...project,
        isFavorite: Boolean(this.workspaceState.projectFavorites[project.id]),
        isGitRepo: gitInfo.isGitRepo,
        isGitHubRepo: gitInfo.isGitHubRepo,
      };
    });

    const runtimeToGuiState = (runtime: GuiSessionRuntime | null) => ({
      sessionId: runtime?.id ?? "",
      projectId: runtime?.projectId || null,
      sessionFile: runtime?.sessionFile ?? null,
      sessionTitle: runtime?.sessionTitle ?? "New thread",
      cwd: runtime?.projectPath ?? null,
      isStreaming: runtime?.isStreaming ?? false,
      messages: runtime?.messages ?? [],
      resources: runtime?.resourceSummary ?? emptyResourceSummary(),
      statusText: runtime?.statusText ?? null,
      errorText: runtime?.errorText ?? null,
      model: runtime?.model ?? null,
      availableModels: this.availableModels,
      thinkingLevel: runtime?.thinkingLevel ?? this.thinkingLevel,
      availableThinkingLevels: runtime?.availableThinkingLevels ?? this.availableThinkingLevels,
      streamingBehaviorPreference: this.streamingBehaviorPreference,
      attachments: runtime?.attachments ?? [],
      slashCommands: runtime?.slashCommands ?? BUILTIN_SLASH_COMMAND_SUMMARIES,
    });

    const activeProjectId = this.workspaceState.activeProjectId;
    const workerSessionEntries = Object.entries(this.guiSessions).filter(([, runtime]) => runtime.role === "worker");
    const controllerRuntime = this.getControllerRuntime();
    const activeRuntime = this.getGuiRuntime(this.activeGuiSessionId) ?? null;
    const orderedWorkerSessionIds = this.workspaceState.projects.flatMap((project) =>
      this.getStudioProjectState(project.id).workerSessionOrder,
    );

    return {
      projects,
      threadsByProject: this.threadCache,
      activeProjectId,
      activeMode: this.workspaceState.activeMode,
      controller: controllerRuntime ? runtimeToGuiState(controllerRuntime) : null,
      studio: {
        projectId: activeProjectId,
        controllerSessionId: controllerRuntime?.id ?? null,
        workerSessionIds:
          orderedWorkerSessionIds.filter((sessionId) =>
            workerSessionEntries.some(([entrySessionId]) => entrySessionId === sessionId),
          ) ?? workerSessionEntries.map(([sessionId]) => sessionId),
        sessions: Object.fromEntries(
          workerSessionEntries.map(([sessionId, runtime]) => [
            sessionId,
            {
              sessionId,
              role: runtime.role,
              projectId: runtime.projectId,
              sessionFile: runtime.sessionFile,
              sessionTitle: runtime.sessionTitle,
              cwd: runtime.projectPath,
              isStreaming: runtime.isStreaming,
              statusText: runtime.statusText,
              errorText: runtime.errorText,
              lastMessagePreview: this.runtimeLastMessagePreview(runtime),
              lastActivityAt: runtime.lastActivityAt,
            },
          ]),
        ),
      },
      gui: (() => {
        const sourceRuntime = activeRuntime
          ? {
              projectId: activeRuntime.projectId,
              sessionFile: activeRuntime.sessionFile,
              sessionTitle: activeRuntime.sessionTitle,
              cwd: activeRuntime.projectPath,
              isStreaming: activeRuntime.isStreaming,
              messages: activeRuntime.messages,
              resources: activeRuntime.resourceSummary,
              statusText: activeRuntime.statusText,
              errorText: activeRuntime.errorText,
              model: activeRuntime.model,
              thinkingLevel: activeRuntime.thinkingLevel,
              availableThinkingLevels: activeRuntime.availableThinkingLevels,
              attachments: activeRuntime.attachments,
              slashCommands: activeRuntime.slashCommands,
            }
          : {
              projectId: this.workspaceState.activeProjectId,
              sessionFile: this.currentSessionFile,
              sessionTitle: this.currentSessionTitle,
              cwd: this.currentProjectPath,
              isStreaming: this.guiStreaming,
              messages: this.guiMessages,
              resources: this.resourceSummary,
              statusText: this.guiStatusText,
              errorText: this.guiErrorText,
              model: this.currentModel,
              thinkingLevel: this.thinkingLevel,
              availableThinkingLevels: this.availableThinkingLevels,
              attachments: this.pendingAttachments,
              slashCommands: BUILTIN_SLASH_COMMAND_SUMMARIES,
            };

        return {
          ...sourceRuntime,
          availableModels: this.availableModels,
          streamingBehaviorPreference: this.streamingBehaviorPreference,
          sessionId: activeRuntime?.id ?? "",
          activeSessionId: activeRuntime?.id ?? undefined,
          sessions: Object.fromEntries(
            workerSessionEntries.map(([sessionId, runtime]) => [
              sessionId,
              {
                sessionId,
                projectId: runtime.projectId,
                sessionFile: runtime.sessionFile,
                sessionTitle: runtime.sessionTitle,
                cwd: runtime.projectPath,
                isStreaming: runtime.isStreaming,
                messages: runtime.messages,
                resources: runtime.resourceSummary,
                statusText: runtime.statusText,
                errorText: runtime.errorText,
                model: runtime.model,
                availableModels: this.availableModels,
                thinkingLevel: runtime.thinkingLevel,
                availableThinkingLevels: runtime.availableThinkingLevels,
                streamingBehaviorPreference: this.streamingBehaviorPreference,
                attachments: runtime.attachments,
                slashCommands: runtime.slashCommands,
              },
            ]),
          ),
        };
      })(),
      tui: (() => {
        const sessionEntries = Object.entries(this.tuiSessions);
        const defaultRuntime = this.tuiSessions.default ?? sessionEntries[0]?.[1] ?? null;
        const active = sessionEntries.some(([, runtime]) => runtime.terminal.active);

        return {
          active,
          projectId: defaultRuntime?.projectId ?? this.workspaceState.activeProjectId,
          cwd: defaultRuntime?.cwd ?? this.currentProjectPath,
          status: defaultRuntime?.status ?? "idle",
          errorText: defaultRuntime?.errorText ?? null,
          runningInBackground: active && this.workspaceState.activeMode !== "tui",
          sessions: Object.fromEntries(
            sessionEntries.map(([sessionId, runtime]) => [
              sessionId,
              {
                sessionId,
                active: runtime.terminal.active,
                projectId: runtime.projectId,
                cwd: runtime.cwd,
                status: runtime.status,
                errorText: runtime.errorText,
              },
            ]),
          ),
        };
      })(),
      terminal: (() => {
        const sessionEntries = Object.entries(this.terminalSessions);
        const defaultRuntime = this.terminalSessions.default ?? sessionEntries[0]?.[1] ?? null;
        const active = sessionEntries.some(([, runtime]) => runtime.terminal.active);

        return {
          active,
          projectId: defaultRuntime?.projectId ?? this.workspaceState.activeProjectId,
          cwd: defaultRuntime?.cwd ?? this.currentProjectPath,
          status: defaultRuntime?.status ?? "idle",
          errorText: defaultRuntime?.errorText ?? null,
          sessions: Object.fromEntries(
            sessionEntries.map(([sessionId, runtime]) => [
              sessionId,
              {
                sessionId,
                active: runtime.terminal.active,
                projectId: runtime.projectId,
                cwd: runtime.cwd,
                status: runtime.status,
                errorText: runtime.errorText,
              },
            ]),
          ),
        };
      })(),
      git: this.gitState,
      settings: {
        agentDir: getAgentDir(),
        currentProjectPath: this.getActiveProject()?.path ?? null,
        currentSessionFile: activeRuntime?.sessionFile ?? this.currentSessionFile,
        currentMode: this.workspaceState.activeMode,
        masterSessionPath: this.getMasterSessionPath(),
        homeDirectoryPath: this.getHomeDirectoryPath(),
      },
    };
  }

  async promptForProject() {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Add project",
    });

    if (result.canceled || result.filePaths.length === 0) {
      return this.getSnapshot();
    }

    return this.addProject(result.filePaths[0]);
  }

  async promptForMasterSessionDirectory() {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
      title: "Set master session directory",
      defaultPath: this.getMasterSessionPath(),
    });

    if (result.canceled || result.filePaths.length === 0) {
      return this.getSnapshot();
    }

    return this.setMasterSessionDirectory(result.filePaths[0]);
  }

  async setMasterSessionDirectoryToHome() {
    return this.setMasterSessionDirectory(this.getHomeDirectoryPath());
  }

  async setMasterSessionDirectory(directoryPath: string) {
    const resolvedPath = path.resolve(directoryPath);
    const details = await stat(resolvedPath);
    if (!details.isDirectory()) {
      throw new Error(`${resolvedPath} is not a directory.`);
    }

    this.workspaceState.masterSessionPath = resolvedPath;
    delete this.resourceLoadersByProject[CONTROLLER_WORKSPACE_ID];
    delete this.resourceLoaderLastReloadMsByProject[CONTROLLER_WORKSPACE_ID];

    await this.persistWorkspace();
    await this.openControllerSession({ kind: "continue" });
    this.clearLegacyGuiState(this.getMasterSessionPath());
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async addProject(projectPath: string) {
    await stat(projectPath);
    const project = this.store.createProject(projectPath);

    if (!this.workspaceState.projects.some((entry) => entry.id === project.id)) {
      this.workspaceState.projects = [...this.workspaceState.projects, project];
    }

    this.workspaceState.activeProjectId = project.id;
    await this.persistWorkspace();
    await this.refreshProjectThreads(project);
    this.updateControllerProjectBinding();
    this.clearLegacyGuiState(this.getMasterSessionPath());
    void this.refreshGitState().catch(() => {
      // Keep project add responsive even if git probing fails.
    });
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async selectProject(projectId: string) {
    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (!project) return this.getSnapshot();

    this.workspaceState.activeProjectId = project.id;
    await this.persistWorkspace();
    await this.refreshProjectThreads(project);
    this.updateControllerProjectBinding();
    this.clearLegacyGuiState(this.getMasterSessionPath());
    void this.refreshGitState().catch(() => {
      // Keep project switching responsive even if git probing fails.
    });
    if (this.workspaceState.activeMode === "tui") {
      const runningSessionIds = Object.entries(this.tuiSessions)
        .filter(([, runtime]) => runtime.terminal.active)
        .map(([sessionId]) => sessionId);

      if (runningSessionIds.length === 0) {
        void this.startTui("default");
      } else {
        for (const sessionId of runningSessionIds) {
          void this.startTui(sessionId);
        }
      }
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async reorderProjects(projectIds: string[]) {
    const byId = new Map(this.workspaceState.projects.map((project) => [project.id, project]));
    const reordered: ProjectRecord[] = [];

    for (const projectId of projectIds) {
      const project = byId.get(projectId);
      if (project) {
        reordered.push(project);
        byId.delete(projectId);
      }
    }

    for (const project of byId.values()) {
      reordered.push(project);
    }

    this.workspaceState.projects = reordered;
    await this.persistWorkspace();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async renameProject(projectId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return this.getSnapshot();

    this.workspaceState.projects = this.workspaceState.projects.map((project) =>
      project.id === projectId ? { ...project, name: trimmed } : project,
    );
    await this.persistWorkspace();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async removeProject(projectId: string) {
    if (this.workspaceState.projects.length <= 1) {
      this.guiErrorText = "Cannot delete the last project.";
      this.emitSnapshot();
      return this.getSnapshot();
    }

    const nextProjects = this.workspaceState.projects.filter((project) => project.id !== projectId);
    const removedActive = this.workspaceState.activeProjectId === projectId;

    this.workspaceState.projects = nextProjects;
    delete this.workspaceState.projectFavorites[projectId];
    delete this.workspaceState.threadMetadataByProject[projectId];
    delete this.workspaceState.gitCommentsByProject[projectId];
    delete this.workspaceState.gitBaselineByProject[projectId];
    delete this.workspaceState.studioSessionsByProject[projectId];
    delete this.threadCache[projectId];
    delete this.projectGitInfo[projectId];
    delete this.resourceLoadersByProject[projectId];
    delete this.resourceLoaderLastReloadMsByProject[projectId];

    for (const [sessionId, runtime] of Object.entries(this.guiSessions)) {
      if (runtime.projectId !== projectId) continue;
      this.disposeGuiRuntime(sessionId);
    }

    for (const runtime of Object.values(this.tuiSessions)) {
      if (runtime.projectId === projectId) {
        runtime.terminal.stop();
        runtime.status = "stopped";
        runtime.projectId = null;
        runtime.cwd = null;
      }
    }

    if (!this.activeGuiSessionId || !this.guiSessions[this.activeGuiSessionId]) {
      this.activeGuiSessionId = null;
    }

    if (removedActive) {
      this.workspaceState.activeProjectId = nextProjects[0]?.id ?? null;
    }

    await this.persistWorkspace();
    this.updateControllerProjectBinding();

    if (removedActive) {
      const project = this.getActiveProject();
      if (project) {
        await this.refreshGitState();
      } else {
        this.clearLegacyGuiState(this.getMasterSessionPath());
      }
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async toggleProjectFavorite(projectId: string) {
    this.workspaceState.projectFavorites[projectId] = !this.workspaceState.projectFavorites[projectId];
    await this.persistWorkspace();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async createThread(projectId: string, sessionId = "default") {
    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (!project) return this.getSnapshot();

    const updatesWorkspace = sessionId === "default";

    if (updatesWorkspace) {
      let changed = false;
      if (this.workspaceState.activeProjectId !== project.id) {
        this.workspaceState.activeProjectId = project.id;
        changed = true;
      }

      if (!isPrimaryWorkspaceMode(this.workspaceState.activeMode)) {
        this.workspaceState.activeMode = "gui";
        changed = true;
      }

      if (changed) {
        await this.persistWorkspace();
        this.updateControllerProjectBinding();
      }

      const workerSessionId = this.nextWorkerSessionId(project.id);
      await this.openSessionForProject(project, {
        sessionId: workerSessionId,
        role: "worker",
        options: { kind: "new" },
      });
      await this.persistWorkspace();
      this.emitSnapshot();
      return this.getSnapshot();
    }

    await this.openSessionForProject(project, {
      sessionId,
      role: sessionId === CONTROLLER_SESSION_ID ? "controller" : "worker",
      options: { kind: "new" },
      sessionDir: sessionId === CONTROLLER_SESSION_ID ? this.controllerSessionDir() : undefined,
    });
    return this.getSnapshot();
  }

  async openThread(projectId: string, sessionFile: string, sessionId = "default") {
    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (!project) return this.getSnapshot();

    const updatesWorkspace = sessionId === "default";

    if (updatesWorkspace) {
      let changed = false;
      if (this.workspaceState.activeProjectId !== project.id) {
        this.workspaceState.activeProjectId = project.id;
        changed = true;
      }

      if (!isPrimaryWorkspaceMode(this.workspaceState.activeMode)) {
        this.workspaceState.activeMode = "gui";
        changed = true;
      }

      if (changed) {
        await this.persistWorkspace();
        this.updateControllerProjectBinding();
      }

      const existingRuntime = this.getWorkerRuntimes(project.id).find((runtime) => runtime.sessionFile === sessionFile);
      if (existingRuntime) {
        await this.persistWorkspace();
        this.updateControllerProjectBinding();
        this.emitSnapshot();
        return this.getSnapshot();
      }

      const workerSessionId = this.nextWorkerSessionId(project.id);
      await this.openSessionForProject(project, {
        sessionId: workerSessionId,
        role: "worker",
        options: { kind: "open", sessionFile },
      });
      await this.persistWorkspace();
      this.emitSnapshot();
      return this.getSnapshot();
    }

    await this.openSessionForProject(project, {
      sessionId,
      role: sessionId === CONTROLLER_SESSION_ID ? "controller" : "worker",
      options: { kind: "open", sessionFile },
      sessionDir: sessionId === CONTROLLER_SESSION_ID ? this.controllerSessionDir() : undefined,
    });
    return this.getSnapshot();
  }

  async closeSession(sessionId: string) {
    const runtime = this.guiSessions[sessionId];
    if (!runtime || runtime.role !== "worker") {
      return this.getSnapshot();
    }

    const project = this.workspaceState.projects.find((entry) => entry.id === runtime.projectId);
    const wasActive = this.activeGuiSessionId === sessionId;
    this.forgetWorkerSession(runtime.projectId, sessionId);
    this.disposeGuiRuntime(sessionId);

    if (wasActive) {
      this.activeGuiSessionId = null;
      this.clearLegacyGuiState(project?.path ?? null);
    }

    await this.persistWorkspace();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private sessionStatusFromRuntime(runtime: GuiSessionRuntime) {
    if (runtime.errorText) return "error" as const;
    if (runtime.isStreaming || runtime.session?.isStreaming) return "running" as const;
    return "idle" as const;
  }

  private listStudioWorkerSessions() {
    const runtimesById = new Map(this.getWorkerRuntimes().map((runtime) => [runtime.id, runtime] as const));
    const orderedIds = this.workspaceState.projects.flatMap((project) =>
      this.getStudioProjectState(project.id).workerSessionOrder,
    );
    const missingIds = Array.from(runtimesById.keys()).filter((sessionId) => !orderedIds.includes(sessionId));

    return [...orderedIds, ...missingIds]
      .map((sessionId) => runtimesById.get(sessionId))
      .filter((runtime): runtime is GuiSessionRuntime => Boolean(runtime))
      .map((runtime) => ({
        sessionId: runtime.id,
        title: runtime.sessionTitle,
        status: this.sessionStatusFromRuntime(runtime),
        sessionFile: runtime.sessionFile,
      }));
  }

  private async performSessionToolAction(request: SessionToolRequest): Promise<SessionToolResponse> {
    const activeProject = this.getActiveProject();
    if (!activeProject) {
      throw new Error("No active project is available for session control.");
    }

    switch (request.action) {
      case "list":
        return {
          ok: true,
          action: "list",
          message: "Visible worker sessions:",
          sessions: this.listStudioWorkerSessions(),
        };
      case "status": {
        const sessions = this.listStudioWorkerSessions();
        if (!request.targetSessionId) {
          return {
            ok: true,
            action: "status",
            message: "Current worker session status:",
            sessions,
          };
        }

        const selected = sessions.find((session) => session.sessionId === request.targetSessionId);
        if (!selected) {
          throw new Error(`Session ${request.targetSessionId} is not open.`);
        }

        return {
          ok: true,
          action: "status",
          message: `${selected.sessionId} is ${selected.status}.`,
          session: {
            sessionId: selected.sessionId,
            title: selected.title,
            status: selected.status,
            sessionFile: selected.sessionFile,
          },
          sessions,
        };
      }
      case "create": {
        const sessionId = this.nextWorkerSessionId(activeProject.id);
        await this.openSessionForProject(activeProject, {
          sessionId,
          role: "worker",
          options: { kind: "new" },
        });
        const runtime = this.guiSessions[sessionId];
        if (runtime && request.title) {
          runtime.session.setSessionName?.(request.title);
          runtime.sessionTitle = normalizeThreadTitle(request.title);
        }
        await this.persistWorkspace();
        return {
          ok: true,
          action: "create",
          message: `Created worker session ${sessionId}${request.title ? ` (${request.title})` : ""}.`,
          session: {
            sessionId,
            title: this.guiSessions[sessionId]?.sessionTitle ?? request.title ?? sessionId,
            status: this.sessionStatusFromRuntime(this.guiSessions[sessionId]!),
            sessionFile: this.guiSessions[sessionId]?.sessionFile ?? null,
          },
          sessions: this.listStudioWorkerSessions(),
        };
      }
      case "send": {
        if (!request.targetSessionId) {
          throw new Error("A target session id is required to send a prompt.");
        }
        if (!request.prompt) {
          throw new Error("A prompt is required to send work to another session.");
        }

        await this.sendPrompt(request.prompt, request.targetSessionId);
        const runtime = this.guiSessions[request.targetSessionId];
        return {
          ok: true,
          action: "send",
          message: `Sent a prompt to ${request.targetSessionId}.`,
          session: runtime
            ? {
                sessionId: runtime.id,
                title: runtime.sessionTitle,
                status: this.sessionStatusFromRuntime(runtime),
                sessionFile: runtime.sessionFile,
              }
            : null,
          sessions: this.listStudioWorkerSessions(),
        };
      }
      case "close": {
        if (!request.targetSessionId) {
          throw new Error("A target session id is required to close a session.");
        }

        await this.closeSession(request.targetSessionId);
        return {
          ok: true,
          action: "close",
          message: `Closed ${request.targetSessionId}.`,
          sessions: this.listStudioWorkerSessions(),
        };
      }
      default:
        throw new Error(`Unsupported session action: ${(request as { action: string }).action}`);
    }
  }

  async deleteThread(projectId: string, sessionFile: string) {
    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (!project) return this.getSnapshot();

    const activeRuntime = this.getGuiRuntime(this.activeGuiSessionId);
    const deletingActiveThread =
      activeRuntime?.projectId === projectId &&
      activeRuntime?.sessionFile === sessionFile;

    await this.disposeGuiRuntimesForThread(projectId, sessionFile);
    this.stopTuiSessionsForThread(projectId, sessionFile);

    try {
      await rm(sessionFile, { force: true });
    } catch (error) {
      this.guiErrorText = error instanceof Error ? error.message : String(error);
      this.emitSnapshot();
      return this.getSnapshot();
    }

    const metadataBySessionFile = this.workspaceState.threadMetadataByProject[projectId];
    if (metadataBySessionFile?.[sessionFile]) {
      delete metadataBySessionFile[sessionFile];
      if (Object.keys(metadataBySessionFile).length === 0) {
        delete this.workspaceState.threadMetadataByProject[projectId];
      }
    }

    await this.refreshProjectThreads(project);

    if (deletingActiveThread) {
      this.activeGuiSessionId = null;
      this.clearLegacyGuiState(project.path);
    }

    await this.persistWorkspace();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async toggleThreadPinned(projectId: string, sessionFile: string) {
    const metadata = this.getThreadMetadata(projectId, sessionFile);
    this.setThreadMetadata(projectId, sessionFile, {
      ...metadata,
      pinned: !metadata.pinned,
    });

    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (project) {
      await this.refreshProjectThreads(project);
    }

    await this.persistWorkspace();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async toggleThreadArchived(projectId: string, sessionFile: string) {
    const metadata = this.getThreadMetadata(projectId, sessionFile);
    this.setThreadMetadata(projectId, sessionFile, {
      ...metadata,
      archived: !metadata.archived,
    });

    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (project) {
      await this.refreshProjectThreads(project);
    }

    await this.persistWorkspace();
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private async refreshSlashCommands(sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime?.session) return;

    const dynamicCommands = await Promise.resolve(runtime.session.getCommands?.()).catch(() => []);
    const mappedDynamic = Array.isArray(dynamicCommands)
      ? dynamicCommands
          .map((entry) => {
            const rawName =
              typeof entry?.command === "string"
                ? entry.command
                : typeof entry?.name === "string"
                  ? entry.name
                  : "";
            if (!rawName) return null;
            const command = rawName.startsWith("/") ? rawName : `/${rawName}`;
            return {
              command,
              description: typeof entry?.description === "string" ? entry.description : "Run command",
              source: "resource" as const,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      : [];

    const commandMap = new Map<string, SlashCommandSummary>();
    for (const entry of BUILTIN_SLASH_COMMAND_SUMMARIES) {
      commandMap.set(entry.command, entry);
    }
    for (const entry of mappedDynamic) {
      commandMap.set(entry.command, entry);
    }

    runtime.slashCommands = [...commandMap.values()].sort((left, right) => left.command.localeCompare(right.command));
    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }
  }

  private setRuntimeStatus(
    runtime: GuiSessionRuntime,
    result: { statusText?: string | null; errorText?: string | null },
    sessionId: string,
  ) {
    if (result.statusText !== undefined) {
      runtime.statusText = result.statusText;
    }
    if (result.errorText !== undefined) {
      runtime.errorText = result.errorText;
    }
    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }
    this.emitSnapshot();
  }

  async runSlashCommand(text: string, sessionId: string | null = this.activeGuiSessionId): Promise<RunSlashCommandResult> {
    const runtime = this.getGuiRuntime(sessionId);
    const commandText = text.trim();
    if (!runtime?.session || !commandText.startsWith("/")) {
      return { handled: false };
    }
    const runtimeSessionId = runtime.id;

    const [, rawCommand = "", rawArgs = ""] = commandText.match(/^\/(\S+)(?:\s+(.*))?$/) ?? [];
    const command = rawCommand.toLowerCase();
    const args = rawArgs.trim();

    try {
      switch (command) {
        case "tree":
          return { handled: true, openTree: true };
        case "settings":
          await this.setMode("settings");
          return { handled: true, openSettings: true };
        case "model":
        case "scoped-models":
          return { handled: true, openModelPicker: true };
        case "new": {
          const projectId = runtime.projectId || this.workspaceState.activeProjectId;
          if (!projectId) {
            this.setRuntimeStatus(runtime, { errorText: "No active project for /new." }, runtimeSessionId);
            return { handled: true, errorText: "No active project for /new." };
          }
          await this.createThread(projectId, runtimeSessionId);
          return { handled: true, statusText: "Started a new session." };
        }
        case "name": {
          if (!args) {
            this.setRuntimeStatus(runtime, { errorText: "Usage: /name <new name>" }, runtimeSessionId);
            return { handled: true, errorText: "Usage: /name <new name>" };
          }
          runtime.session.setSessionName?.(args);
          runtime.sessionTitle = normalizeThreadTitle(args);
          if (runtime.projectId) {
            const project = this.workspaceState.projects.find((entry) => entry.id === runtime.projectId);
            if (project) {
              await this.refreshProjectThreads(project);
            }
          }
          this.setRuntimeStatus(runtime, { statusText: `Renamed session to ${args}.`, errorText: null }, runtimeSessionId);
          return { handled: true, statusText: `Renamed session to ${args}.` };
        }
        case "session": {
          const stats = runtime.session.getSessionStats?.();
          const summary = stats
            ? `Session: ${runtime.sessionTitle} | ${stats.totalMessages ?? 0} messages | ${stats.userMessages ?? 0} user | ${stats.assistantMessages ?? 0} assistant`
            : `Session: ${runtime.sessionTitle}`;
          this.setRuntimeStatus(runtime, { statusText: summary, errorText: null }, runtimeSessionId);
          return { handled: true, statusText: summary };
        }
        case "compact": {
          await runtime.session.compact?.(args || undefined);
          await this.refreshSlashCommands(runtimeSessionId);
          this.setRuntimeStatus(runtime, { statusText: "Session compacted.", errorText: null }, runtimeSessionId);
          return { handled: true, statusText: "Session compacted." };
        }
        case "copy": {
          clipboard.writeText(runtime.session.getLastAssistantText?.() ?? "");
          this.setRuntimeStatus(runtime, { statusText: "Copied last assistant message.", errorText: null }, runtimeSessionId);
          return { handled: true, statusText: "Copied last assistant message." };
        }
        case "export": {
          const defaultPath = path.join(
            runtime.projectPath,
            `${path.basename(runtime.sessionFile ?? "session", path.extname(runtime.sessionFile ?? "session"))}.html`,
          );
          const outputPath = args || defaultPath;
          if (outputPath.toLowerCase().endsWith(".jsonl")) {
            runtime.session.exportToJsonl?.(outputPath);
          } else {
            await runtime.session.exportToHtml?.(outputPath);
          }
          this.setRuntimeStatus(runtime, { statusText: `Exported session to ${outputPath}.`, errorText: null }, runtimeSessionId);
          return { handled: true, statusText: `Exported session to ${outputPath}.` };
        }
        case "reload": {
          await runtime.session.reload?.();
          await this.refreshSlashCommands(runtimeSessionId);
          runtime.resourceSummary = this.readResourceSummary(runtime.resourceLoader);
          this.setRuntimeStatus(runtime, { statusText: "Reloaded session resources.", errorText: null }, runtimeSessionId);
          return { handled: true, statusText: "Reloaded session resources.", slashCommands: runtime.slashCommands };
        }
        case "fork": {
          if (!runtime.projectId || !runtime.sessionFile) {
            this.setRuntimeStatus(runtime, { errorText: "No active session to fork." }, runtimeSessionId);
            return { handled: true, errorText: "No active session to fork." };
          }
          const project = this.workspaceState.projects.find((entry) => entry.id === runtime.projectId);
          if (!project) {
            this.setRuntimeStatus(runtime, { errorText: "Project missing for /fork." }, runtimeSessionId);
            return { handled: true, errorText: "Project missing for /fork." };
          }
          const forkedManager = SessionManager.forkFrom(runtime.sessionFile, project.path);
          const forkedSessionFile = forkedManager.getSessionFile();
          if (!forkedSessionFile) {
            this.setRuntimeStatus(runtime, { errorText: "Forked session file was not created." }, runtimeSessionId);
            return { handled: true, errorText: "Forked session file was not created." };
          }
          await this.openSessionForProject(project, {
            sessionId: runtimeSessionId,
            role: runtime.role,
            options: { kind: "open", sessionFile: forkedSessionFile },
            sessionDir: runtime.role === "controller" ? this.controllerSessionDir() : undefined,
          });
          this.setRuntimeStatus(this.getGuiRuntime(runtimeSessionId) ?? runtime, { statusText: "Forked current session.", errorText: null }, runtimeSessionId);
          return { handled: true, statusText: "Forked current session." };
        }
        case "resume": {
          if (!args) {
            this.setRuntimeStatus(runtime, { errorText: "Usage: /resume <session file>" }, runtimeSessionId);
            return { handled: true, errorText: "Usage: /resume <session file>" };
          }
          const targetPath = path.resolve(runtime.projectPath, args);
          const project = this.workspaceState.projects.find((entry) => entry.id === runtime.projectId);
          if (!project) {
            this.setRuntimeStatus(runtime, { errorText: "Project missing for /resume." }, runtimeSessionId);
            return { handled: true, errorText: "Project missing for /resume." };
          }
          await this.openSessionForProject(project, {
            sessionId: runtimeSessionId,
            role: runtime.role,
            options: { kind: "open", sessionFile: targetPath },
            sessionDir: runtime.role === "controller" ? this.controllerSessionDir() : undefined,
          });
          return { handled: true, statusText: "Resumed requested session." };
        }
        case "import": {
          if (!args) {
            this.setRuntimeStatus(runtime, { errorText: "Usage: /import <jsonl file>" }, runtimeSessionId);
            return { handled: true, errorText: "Usage: /import <jsonl file>" };
          }
          await runtime.session._runtime?.importFromJsonl?.(args);
          await this.refreshSlashCommands(runtimeSessionId);
          this.setRuntimeStatus(runtime, { statusText: "Imported session file.", errorText: null }, runtimeSessionId);
          return { handled: true, statusText: "Imported session file." };
        }
        case "hotkeys":
          this.setRuntimeStatus(runtime, { statusText: "Hotkeys: Ctrl+L mode, Ctrl+T tools, Ctrl+G external editor, /tree for branches.", errorText: null }, runtimeSessionId);
          return { handled: true, statusText: "Hotkeys: Ctrl+L mode, Ctrl+T tools, Ctrl+G external editor, /tree for branches." };
        case "changelog":
          this.setRuntimeStatus(runtime, { statusText: "See the local Pi CHANGELOG.md for release notes.", errorText: null }, runtimeSessionId);
          return { handled: true, statusText: "See the local Pi CHANGELOG.md for release notes." };
        case "share":
        case "login":
        case "logout":
          this.setRuntimeStatus(runtime, { statusText: `/${command} is not wired into the GUI yet. Use TUI for the full interactive flow.`, errorText: null }, runtimeSessionId);
          return { handled: true, statusText: `/${command} is not wired into the GUI yet.` };
        case "quit":
          app.quit();
          return { handled: true, statusText: "Quitting Pi Studio." };
        default:
          await runtime.session.prompt(commandText, {
            expandPromptTemplates: true,
            source: "interactive",
            ...(runtime.session.isStreaming ? { streamingBehavior: this.streamingBehaviorPreference } : {}),
          });
          await this.refreshSlashCommands(runtimeSessionId);
          this.emitSnapshot();
          return { handled: true, slashCommands: runtime.slashCommands };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setRuntimeStatus(runtime, { errorText: message }, runtimeSessionId);
      return { handled: true, errorText: message };
    }
  }

  async sendPrompt(text: string, sessionId: string | null = this.activeGuiSessionId) {
    const message = text.trim();
    const runtime = this.getGuiRuntime(sessionId);
    if (!message || !runtime?.session) return this.getSnapshot();

    this.editorDraft = "";

    const isSlashCommand = /^\/\S+/.test(message);
    if (isSlashCommand) {
      return this.runSlashCommand(message, runtime.id).then(() => this.getSnapshot());
    }

    const attachments = runtime.attachments.map((entry) => entry.path);
    const composedMessage =
      attachments.length > 0
        ? `${message}\n\nAttached files:\n${attachments.map((entry) => `- ${entry}`).join("\n")}`
        : message;

    try {
      await runtime.session.prompt(composedMessage, {
        expandPromptTemplates: true,
        source: "interactive",
        ...(runtime.session.isStreaming ? { streamingBehavior: this.streamingBehaviorPreference } : {}),
      });

      runtime.attachments = [];

      runtime.errorText = null;
    } catch (error) {
      runtime.errorText = error instanceof Error ? error.message : String(error);
    }

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async abortPrompt(sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime?.session) {
      return this.getSnapshot();
    }

    runtime.isStreaming = false;
    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }
    this.emitSnapshot();

    try {
      await runtime.session.abort();
      runtime.errorText = null;
    } catch (error) {
      runtime.errorText = error instanceof Error ? error.message : String(error);
    }

    runtime.isStreaming = Boolean(runtime.session.isStreaming);
    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }
    this.emitSnapshot();

    return this.getSnapshot();
  }

  async pickAttachments(sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime) return this.getSnapshot();

    const project = this.workspaceState.projects.find((entry) => entry.id === runtime.projectId) ?? this.getActiveProject();
    if (!project) return this.getSnapshot();

    const result = await dialog.showOpenDialog({
      title: "Attach files",
      defaultPath: project.path,
      properties: ["openFile", "multiSelections"],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return this.getSnapshot();
    }

    const next = [...runtime.attachments];
    for (const filePath of result.filePaths) {
      if (next.some((entry) => entry.path === filePath)) continue;
      next.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: path.basename(filePath),
        path: filePath,
      });
    }

    runtime.attachments = next;

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async removeAttachment(attachmentId: string, sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime) return this.getSnapshot();

    runtime.attachments = runtime.attachments.filter((attachment) => attachment.id !== attachmentId);

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async clearAttachments(sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime) return this.getSnapshot();

    runtime.attachments = [];

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setModel(provider: string, modelId: string, sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime?.session) return this.getSnapshot();

    const model = this.modelRegistry.find(provider, modelId);
    if (!model) {
      runtime.errorText = `Model ${provider}/${modelId} not found.`;
      this.emitSnapshot();
      return this.getSnapshot();
    }

    try {
      await runtime.session.setModel(model);
      runtime.model = this.modelToSummary(model);
      runtime.availableThinkingLevels = this.safeThinkingLevels(runtime.session);
      runtime.thinkingLevel = runtime.session.thinkingLevel ?? runtime.thinkingLevel;
      runtime.errorText = null;
    } catch (error) {
      runtime.errorText = error instanceof Error ? error.message : String(error);
    }

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setThinkingLevel(level: string, sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime?.session) return this.getSnapshot();

    try {
      runtime.session.setThinkingLevel(level);
      runtime.thinkingLevel = runtime.session.thinkingLevel ?? level;
      runtime.errorText = null;
    } catch (error) {
      runtime.errorText = error instanceof Error ? error.message : String(error);
    }

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setStreamingBehavior(mode: StreamingBehaviorPreference) {
    this.streamingBehaviorPreference = mode;
    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setMode(mode: StudioMode) {
    this.workspaceState.activeMode = mode;
    await this.persistWorkspace();

    if (mode === "tui") {
      await this.startTui("default");
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async startTui(sessionId = "default") {
    const activeProject = this.getActiveProject();
    if (!activeProject) return this.getSnapshot();

    const runtime = this.ensureTuiSession(sessionId);
    const activeRuntime = this.getGuiRuntime(this.activeGuiSessionId) ?? this.getWorkerRuntimes(activeProject.id)[0] ?? null;

    if (runtime.terminal.active && runtime.projectId === activeProject.id) {
      runtime.status = "running";
      runtime.errorText = null;
      runtime.cwd = activeProject.path;
      this.emitSnapshot();
      return this.getSnapshot();
    }

    runtime.status = "starting";
    runtime.errorText = null;
    runtime.projectId = activeProject.id;
    runtime.cwd = activeProject.path;
    this.emitSnapshot();

    try {
      let extensionPaths: string[] | undefined;
      let skillPaths: string[] | undefined;

      if (activeRuntime?.usePiStudioBuiltins) {
        const builtins = await getPiStudioBuiltinResources();
        extensionPaths = builtins.additionalExtensionPaths;
        skillPaths = builtins.additionalSkillPaths;
      }

      runtime.terminal.startPiSession(activeProject.path, 120, 32, {
        sessionFile: activeRuntime?.sessionFile ?? null,
        extensionPaths,
        skillPaths,
      });
      runtime.sessionFile = activeRuntime?.sessionFile ?? null;
      runtime.status = "running";
    } catch (error) {
      runtime.status = "error";
      runtime.errorText = error instanceof Error ? error.message : String(error);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  stopTui(sessionId = "default") {
    const runtime = this.tuiSessions[sessionId];
    if (!runtime) return this.getSnapshot();

    runtime.terminal.stop();
    runtime.status = "stopped";
    runtime.projectId = null;
    runtime.cwd = null;
    runtime.sessionFile = null;
    this.emitSnapshot();
    return this.getSnapshot();
  }

  private stopTuiSessionsForThread(projectId: string, sessionFile: string) {
    for (const runtime of Object.values(this.tuiSessions)) {
      if (runtime.projectId !== projectId || runtime.sessionFile !== sessionFile) continue;
      runtime.terminal.stop();
      runtime.status = "stopped";
      runtime.projectId = null;
      runtime.cwd = null;
      runtime.sessionFile = null;
    }
  }

  async startTerminal(sessionId = "default") {
    const activeProject = this.getActiveProject();
    if (!activeProject) return this.getSnapshot();

    const runtime = this.ensureTerminalSession(sessionId);

    if (runtime.terminal.active && runtime.projectId === activeProject.id) {
      runtime.status = "running";
      runtime.errorText = null;
      runtime.cwd = activeProject.path;
      this.emitSnapshot();
      return this.getSnapshot();
    }

    runtime.status = "starting";
    runtime.errorText = null;
    runtime.projectId = activeProject.id;
    runtime.cwd = activeProject.path;
    this.emitSnapshot();

    try {
      runtime.terminal.startShell(activeProject.path);
      runtime.status = "running";
    } catch (error) {
      runtime.status = "error";
      runtime.errorText = error instanceof Error ? error.message : String(error);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  stopTerminal(sessionId = "default") {
    const runtime = this.terminalSessions[sessionId];
    if (!runtime) return this.getSnapshot();

    runtime.terminal.stop();
    runtime.status = "stopped";
    runtime.projectId = null;
    runtime.cwd = null;
    this.emitSnapshot();
    return this.getSnapshot();
  }

  resizeTui(cols: number, rows: number, sessionId = "default") {
    const runtime = this.tuiSessions[sessionId];
    runtime?.terminal.resize(cols, rows);
  }

  writeToTui(data: string, sessionId = "default") {
    const runtime = this.tuiSessions[sessionId];
    runtime?.terminal.write(data);
  }

  resizeTerminal(cols: number, rows: number, sessionId = "default") {
    const runtime = this.terminalSessions[sessionId];
    runtime?.terminal.resize(cols, rows);
  }

  writeToTerminal(data: string, sessionId = "default") {
    const runtime = this.terminalSessions[sessionId];
    runtime?.terminal.write(data);
  }

  async refreshGitState() {
    const project = this.getActiveProject();
    if (!project) {
      this.gitState = {
        ...this.gitState,
        projectId: null,
        isGitRepo: false,
        branch: null,
        changedFiles: [],
        diffText: "",
        comments: [],
        loading: false,
        errorText: null,
      };
      this.emitSnapshot();
      return this.getSnapshot();
    }

    const baseline = this.workspaceState.gitBaselineByProject[project.id] ?? "working";
    this.gitState = {
      ...this.gitState,
      projectId: project.id,
      baseline,
      loading: true,
      errorText: null,
      comments: this.workspaceState.gitCommentsByProject[project.id] ?? [],
    };
    this.emitSnapshot();

    const gitInfo = await this.inspectProjectGitInfo(project.path);
    this.projectGitInfo[project.id] = gitInfo;

    if (!gitInfo.isGitRepo) {
      this.gitState = {
        ...this.gitState,
        projectId: project.id,
        isGitRepo: false,
        branch: null,
        changedFiles: [],
        diffText: "",
        comments: this.workspaceState.gitCommentsByProject[project.id] ?? [],
        loading: false,
        errorText: null,
      };
      this.emitSnapshot();
      return this.getSnapshot();
    }

    try {
      const [statusResult, diffResult] = await Promise.all([
        this.safeExecGit(project.path, ["status", "--porcelain"]),
        this.execDiff(project.path, baseline),
      ]);

      this.gitState = {
        ...this.gitState,
        projectId: project.id,
        isGitRepo: true,
        branch: gitInfo.branch,
        changedFiles: this.parseGitStatus(statusResult.stdout),
        diffText: diffResult.stdout.trim(),
        comments: this.workspaceState.gitCommentsByProject[project.id] ?? [],
        loading: false,
        errorText: null,
      };
    } catch (error) {
      this.gitState = {
        ...this.gitState,
        loading: false,
        errorText: error instanceof Error ? error.message : String(error),
      };
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setGitBaseline(baseline: GitDiffBaseline) {
    const project = this.getActiveProject();
    if (!project) return this.getSnapshot();

    this.workspaceState.gitBaselineByProject[project.id] = baseline;
    await this.persistWorkspace();
    await this.refreshGitState();
    return this.getSnapshot();
  }

  async addGitComment(filePath: string, text: string) {
    const project = this.getActiveProject();
    const trimmed = text.trim();
    if (!project || !trimmed) return this.getSnapshot();

    const comments = this.workspaceState.gitCommentsByProject[project.id] ?? [];
    const nextComment: GitComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      filePath,
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    this.workspaceState.gitCommentsByProject[project.id] = [...comments, nextComment];
    await this.persistWorkspace();
    await this.refreshGitState();
    return this.getSnapshot();
  }

  async removeGitComment(commentId: string) {
    const project = this.getActiveProject();
    if (!project) return this.getSnapshot();

    const comments = this.workspaceState.gitCommentsByProject[project.id] ?? [];
    this.workspaceState.gitCommentsByProject[project.id] = comments.filter((comment) => comment.id !== commentId);
    await this.persistWorkspace();
    await this.refreshGitState();
    return this.getSnapshot();
  }

  async getProjectFileTree(projectId?: string): Promise<FileTreeNode[]> {
    const project =
      (projectId
        ? this.workspaceState.projects.find((entry) => entry.id === projectId)
        : this.getActiveProject()) ?? null;

    if (!project) {
      return [];
    }

    return this.readDirectoryTree(project.path, 0);
  }

  async searchSessions(query: string): Promise<SessionSearchResult[]> {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    const results: SessionSearchResult[] = [];

    for (const project of this.workspaceState.projects) {
      const threads = this.threadCache[project.id] ?? [];

      for (const thread of threads) {
        if (results.length >= SEARCH_RESULT_LIMIT) {
          return results;
        }

        if (thread.title.toLowerCase().includes(normalizedQuery)) {
          results.push({
            projectId: project.id,
            projectName: project.name,
            sessionFile: thread.sessionFile,
            threadTitle: thread.title,
            ageLabel: thread.ageLabel,
            excerpt: thread.title,
            matchedIn: "title",
          });
          continue;
        }

        const excerpt = await this.searchSessionFile(thread.sessionFile, normalizedQuery);
        if (!excerpt) continue;

        results.push({
          projectId: project.id,
          projectName: project.name,
          sessionFile: thread.sessionFile,
          threadTitle: thread.title,
          ageLabel: thread.ageLabel,
          excerpt,
          matchedIn: "content",
        });
      }
    }

    return results;
  }

  async getSessionTree(sessionId: string | null = this.activeGuiSessionId): Promise<SessionTreeSnapshot> {
    const runtime = this.getGuiRuntime(sessionId);
    const sessionManager = runtime?.session?.sessionManager;
    if (!sessionManager || typeof sessionManager.getTree !== "function") {
      return { leafId: null, nodes: [] };
    }

    const rawTree = sessionManager.getTree() as SessionTreeEntryLike[];
    const leafId =
      typeof sessionManager.getLeafId === "function"
        ? (sessionManager.getLeafId() as string | null)
        : null;

    return {
      leafId,
      nodes: rawTree.map((node) => this.mapSessionTreeNode(node)),
    };
  }

  async navigateTree(
    targetId: string,
    options?: NavigateTreeOptions,
    sessionId: string | null = this.activeGuiSessionId,
  ): Promise<NavigateTreeResult> {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime?.session || !targetId) {
      return { cancelled: true };
    }

    try {
      const result = (await runtime.session.navigateTree(targetId, options ?? {})) as NavigateTreeResult;

      if (result.aborted) {
        runtime.statusText = "Branch summarization cancelled";
      } else if (result.cancelled) {
        runtime.statusText = "Navigation cancelled";
      } else {
        runtime.statusText = "Navigated to selected point";
        runtime.errorText = null;
      }

      this.syncSessionState(sessionId);
      const project = this.workspaceState.projects.find((entry) => entry.id === runtime.projectId);
      if (project) {
        void this.refreshProjectThreads(project).catch(() => {
          // Non-blocking refresh after tree navigation.
        });
      }

      return result;
    } catch (error) {
      runtime.errorText = error instanceof Error ? error.message : String(error);
      if (sessionId === this.activeGuiSessionId) {
        this.syncLegacyGuiStateFromRuntime(sessionId);
      }
      this.emitSnapshot();
      return { cancelled: true };
    }
  }

  dispose() {
    for (const runtime of Object.values(this.guiSessions)) {
      runtime.unsubscribe?.();
      runtime.session?.dispose?.();
    }

    this.guiSessions = {};

    for (const runtime of Object.values(this.tuiSessions)) {
      runtime.terminal.stop();
    }

    this.tuiSessions = {};

    for (const runtime of Object.values(this.terminalSessions)) {
      runtime.terminal.stop();
    }

    this.terminalSessions = {};
    registerPiStudioSessionRuntime(null);
  }

  private async resolveLaunchProjectPath(projectPath: string | null | undefined) {
    return resolveLaunchProjectPathCandidate(projectPath, {
      platform: process.platform,
      isDirectory: async (targetPath) => {
        const details = await stat(targetPath);
        return details.isDirectory();
      },
      toWslPath: async (windowsPath) => {
        const { stdout } = await execFileAsync("wslpath", ["-a", windowsPath]);
        const normalizedPath = stdout.trim();
        return normalizedPath.length > 0 ? normalizedPath : null;
      },
    });
  }

  private getActiveProject() {
    return this.workspaceState.projects.find((entry) => entry.id === this.workspaceState.activeProjectId) ?? null;
  }

  private getThreadMetadataByProject(projectId: string) {
    return this.workspaceState.threadMetadataByProject[projectId] ?? {};
  }

  private getThreadMetadata(projectId: string, sessionFile: string) {
    return this.workspaceState.threadMetadataByProject[projectId]?.[sessionFile] ?? {};
  }

  private setThreadMetadata(projectId: string, sessionFile: string, metadata: ThreadMetadata) {
    if (!this.workspaceState.threadMetadataByProject[projectId]) {
      this.workspaceState.threadMetadataByProject[projectId] = {};
    }

    this.workspaceState.threadMetadataByProject[projectId][sessionFile] = metadata;
  }

  private async ensureBuiltinThreadMetadata(projectId: string, sessionFile: string | null, usePiStudioBuiltins: boolean) {
    if (!usePiStudioBuiltins || !sessionFile) return;

    const metadata = this.getThreadMetadata(projectId, sessionFile);
    if (metadata.piStudioBuiltins) return;

    this.setThreadMetadata(projectId, sessionFile, {
      ...metadata,
      piStudioBuiltins: true,
    });

    await this.persistWorkspace();
  }

  private getResourceLoaderProfile(usePiStudioBuiltins: boolean): ResourceLoaderProfile {
    return usePiStudioBuiltins ? "studioBuiltins" : "default";
  }

  private async getProjectResourceLoader(project: ProjectRecord, usePiStudioBuiltins: boolean) {
    const profile = this.getResourceLoaderProfile(usePiStudioBuiltins);

    if (!this.resourceLoadersByProject[project.id]) {
      this.resourceLoadersByProject[project.id] = {};
    }

    let resourceLoader = this.resourceLoadersByProject[project.id][profile];
    if (!resourceLoader) {
      if (usePiStudioBuiltins) {
        const builtins = await getPiStudioBuiltinResources();
        resourceLoader = new DefaultResourceLoader({
          cwd: project.path,
          extensionFactories: builtins.extensionFactories,
          additionalExtensionPaths: builtins.additionalExtensionPaths,
          additionalSkillPaths: builtins.additionalSkillPaths,
        });
      } else {
        resourceLoader = new DefaultResourceLoader({
          cwd: project.path,
        });
      }

      this.resourceLoadersByProject[project.id][profile] = resourceLoader;
    }

    return { profile, resourceLoader };
  }

  private modelToSummary = (model: any): ModelSummary => ({
    provider: String(model?.provider ?? "unknown"),
    id: String(model?.id ?? "unknown"),
    name: String(model?.name ?? model?.id ?? "unknown"),
    reasoning: Boolean(model?.reasoning),
  });

  private safeThinkingLevels(session: any) {
    try {
      const levels = session.getAvailableThinkingLevels?.();
      if (Array.isArray(levels) && levels.length > 0) {
        return levels.map((entry) => String(entry));
      }
    } catch {
      // ignore
    }

    return ["off", "minimal", "low", "medium", "high", "xhigh"];
  }

  private async openSessionForProject(
    project: ProjectRecord,
    config: SessionOpenConfig,
  ) {
    const { sessionId, role, options, sessionDir, runtimeProjectId } = config;
    const existing = this.guiSessions[sessionId];
    if (existing) {
      this.disposeGuiRuntime(sessionId);
    }

    const usePiStudioBuiltins = shouldUsePiStudioBuiltins({
      options,
      threadsForProject: this.threadCache[project.id] ?? [],
      metadataBySessionFile: this.getThreadMetadataByProject(project.id),
    });

    const { profile, resourceLoader } = await this.getProjectResourceLoader(project, usePiStudioBuiltins);

    const lastReloadAt = this.resourceLoaderLastReloadMsByProject[project.id]?.[profile] ?? 0;
    const shouldReloadResources =
      Date.now() - lastReloadAt >= RESOURCE_LOADER_RELOAD_INTERVAL_MS || options.kind === "new";

    if (shouldReloadResources) {
      await resourceLoader.reload();
      if (!this.resourceLoaderLastReloadMsByProject[project.id]) {
        this.resourceLoaderLastReloadMsByProject[project.id] = {};
      }
      this.resourceLoaderLastReloadMsByProject[project.id][profile] = Date.now();
    }

    let sessionManager;
    if (options.kind === "open") {
      sessionManager = SessionManager.open(options.sessionFile, sessionDir, project.path);
    } else if (options.kind === "new") {
      sessionManager = SessionManager.create(project.path, sessionDir);
    } else {
      sessionManager = SessionManager.continueRecent(project.path, sessionDir);
    }

    const { session } = await createAgentSession({
      cwd: project.path,
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      resourceLoader,
      sessionManager,
    });

    const runtime: GuiSessionRuntime = {
      id: sessionId,
      role,
      session,
      unsubscribe: null,
      projectId: runtimeProjectId ?? project.id,
      projectPath: project.path,
      sessionFile: session.sessionFile ?? null,
      sessionTitle: normalizeThreadTitle(session.sessionName),
      messages: [],
      isStreaming: false,
      statusText: null,
      errorText: null,
      resourceSummary: this.readResourceSummary(resourceLoader),
      model: session.model ? this.modelToSummary(session.model) : null,
      thinkingLevel: String(session.thinkingLevel ?? this.thinkingLevel),
      availableThinkingLevels: this.safeThinkingLevels(session),
      attachments: [],
      slashCommands: BUILTIN_SLASH_COMMAND_SUMMARIES,
      resourceLoader,
      usePiStudioBuiltins,
      lastActivityAt: null,
    };

    this.guiSessions[sessionId] = runtime;

    if (role === "worker") {
      this.recordWorkerSession(runtime.projectId, sessionId, runtime.sessionFile);
      await this.ensureBuiltinThreadMetadata(runtime.projectId, runtime.sessionFile, usePiStudioBuiltins);
    }

    await this.bindExtensions(session, sessionId);
    this.ensurePiStudioActiveTools(session, usePiStudioBuiltins, role);

    runtime.unsubscribe = session.subscribe(() => {
      this.syncSessionState(sessionId);
    });

    this.syncSessionState(sessionId);
    await this.refreshSlashCommands(sessionId);

    if (role !== "worker") {
      return;
    }

    if (options.kind === "new") {
      await this.refreshProjectThreads(project);
      return;
    }

    void this.refreshProjectThreads(project).catch(() => {
      // Non-blocking refresh for session switches.
    });
  }

  private ensurePiStudioActiveTools(session: any, usePiStudioBuiltins: boolean, role: StudioSessionRole) {
    const preferredToolNames = getPiStudioInitialActiveToolNames(usePiStudioBuiltins);
    if (!preferredToolNames?.length || typeof session?.setActiveToolsByName !== "function") {
      return;
    }

    const existingToolNames =
      typeof session.getActiveToolNames === "function" ? session.getActiveToolNames() : [];
    const roleToolNames = role === "controller" ? ["session"] : [];

    session.setActiveToolsByName([...new Set([...existingToolNames, ...preferredToolNames, ...roleToolNames])]);
  }

  private async bindExtensions(session: any, sessionId: string) {
    if (typeof session.bindExtensions !== "function") return;

    const bindings = createNoopExtensionBindings({
      getEditorText: () => this.editorDraft,
      setEditorText: (text) => {
        this.editorDraft = text;
      },
      onStatus: (message) => {
        const runtime = this.getGuiRuntime(sessionId);
        if (!runtime) return;
        runtime.statusText = message;
        if (sessionId === this.activeGuiSessionId) {
          this.syncLegacyGuiStateFromRuntime(sessionId);
        }
        this.emitSnapshot();
      },
      onCreateSession: async () => {
        if (!isPrimaryWorkspaceMode(this.workspaceState.activeMode)) return;

        const project = this.workspaceState.projects.find((entry) => entry.id === this.guiSessions[sessionId]?.projectId);
        if (!project) return;
        await this.openSessionForProject(project, {
          sessionId,
          role: this.guiSessions[sessionId]?.role ?? "worker",
          options: { kind: "new" },
          sessionDir: this.guiSessions[sessionId]?.role === "controller" ? this.controllerSessionDir() : undefined,
        });
      },
      onSwitchSession: async (sessionPath: string) => {
        if (!isPrimaryWorkspaceMode(this.workspaceState.activeMode)) {
          return false;
        }

        const project = this.workspaceState.projects.find((entry) => entry.id === this.guiSessions[sessionId]?.projectId);
        if (!project) return false;
        await this.openSessionForProject(project, {
          sessionId,
          role: this.guiSessions[sessionId]?.role ?? "worker",
          options: { kind: "open", sessionFile: sessionPath },
          sessionDir: this.guiSessions[sessionId]?.role === "controller" ? this.controllerSessionDir() : undefined,
        });
        return true;
      },
      onNavigateTree: (targetId, options) => this.navigateTree(targetId, options, sessionId),
    });

    try {
      await session.bindExtensions(bindings);
    } catch (error) {
      const runtime = this.getGuiRuntime(sessionId);
      if (runtime) {
        runtime.statusText = `Extension bindings unavailable: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  private syncSessionState(sessionId: string | null = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime?.session) return;

    runtime.messages = mapAgentMessages(Array.isArray(runtime.session.messages) ? runtime.session.messages : []);
    runtime.isStreaming = Boolean(runtime.session.isStreaming);
    runtime.sessionFile = runtime.session.sessionFile ?? runtime.sessionFile;
    runtime.lastActivityAt = new Date().toISOString();
    runtime.sessionTitle = normalizeThreadTitle(
      runtime.session.sessionName ??
        (runtime.role === "worker" && runtime.projectId ? this.threadCache[runtime.projectId]?.[0]?.title : runtime.sessionTitle),
    );

    if (runtime.role === "worker" && runtime.sessionFile) {
      this.recordWorkerSession(runtime.projectId, runtime.id, runtime.sessionFile);
    }

    if (runtime.role === "worker" && runtime.usePiStudioBuiltins && runtime.sessionFile) {
      void this.ensureBuiltinThreadMetadata(runtime.projectId, runtime.sessionFile, true).catch(() => {
        // Metadata persistence should not block session updates.
      });
    }

    if (runtime.session.model) {
      runtime.model = this.modelToSummary(runtime.session.model);
    }

    runtime.thinkingLevel = String(runtime.session.thinkingLevel ?? runtime.thinkingLevel);
    runtime.availableThinkingLevels = this.safeThinkingLevels(runtime.session);

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.refreshActiveThreadFlags();
    this.emitSnapshot();
  }

  private async refreshAllThreads() {
    for (const project of this.workspaceState.projects) {
      await this.refreshProjectThreads(project);
    }
  }

  private async searchSessionFile(sessionFile: string, query: string) {
    try {
      const raw = await readFile(sessionFile, "utf8");
      const searchText = this.extractSearchText(raw);
      if (!searchText) return null;

      const normalized = searchText.toLowerCase();
      const matchIndex = normalized.indexOf(query);
      if (matchIndex < 0) return null;

      return this.buildSearchExcerpt(searchText, matchIndex, query.length);
    } catch {
      return null;
    }
  }

  private mapSessionTreeNode(node: SessionTreeEntryLike): SessionTreeNode {
    return {
      id: node.entry.id,
      parentId: node.entry.parentId,
      timestamp: node.entry.timestamp,
      label: node.label,
      labelTimestamp: node.labelTimestamp,
      kind: this.sessionTreeKind(node.entry),
      role: this.sessionTreeRole(node.entry),
      preview: this.sessionTreePreview(node.entry),
      children: (node.children ?? []).map((child) => this.mapSessionTreeNode(child)),
    };
  }

  private sessionTreeKind(entry: SessionTreeEntryLike["entry"]): SessionTreeNode["kind"] {
    switch (entry.type) {
      case "branch_summary":
      case "compaction":
      case "custom":
      case "custom_message":
      case "label":
      case "session_info":
      case "model_change":
      case "thinking_level_change":
      case "message":
        return entry.type;
      default:
        return "custom";
    }
  }

  private sessionTreeRole(entry: SessionTreeEntryLike["entry"]): SessionTreeNode["role"] | undefined {
    if (entry.type !== "message") return undefined;

    switch (entry.message?.role) {
      case "user":
      case "assistant":
      case "toolResult":
      case "bashExecution":
      case "custom":
      case "branchSummary":
      case "compactionSummary":
      case "system":
        return entry.message.role;
      default:
        return undefined;
    }
  }

  private sessionTreePreview(entry: SessionTreeEntryLike["entry"]) {
    switch (entry.type) {
      case "message":
        return this.sessionTreeMessagePreview(entry.message);
      case "branch_summary":
        return `[branch summary] ${entry.summary ?? ""}`.trim();
      case "compaction":
        return `[compaction] ${entry.summary ?? ""}`.trim();
      case "custom_message":
        return this.sessionTreeTextPreview(entry.content, `[${entry.customType ?? "custom"}]`);
      case "custom":
        return `[${entry.customType ?? "custom"}]`;
      case "label":
        return "[label]";
      case "session_info":
        return "[session info]";
      case "model_change":
        return `[model] ${entry.provider ?? ""} ${entry.modelId ?? ""}`.trim();
      case "thinking_level_change":
        return `[thinking] ${entry.thinkingLevel ?? ""}`.trim();
      default:
        return `[${entry.type}]`;
    }
  }

  private sessionTreeMessagePreview(message: SessionTreeEntryLike["entry"]["message"]) {
    if (!message) return "[message]";

    if (message.role === "user") {
      return this.sessionTreeTextPreview(message.content, "user");
    }

    if (message.role === "assistant") {
      return this.sessionTreeTextPreview(message.content, "assistant");
    }

    return `[${message.role ?? "message"}]`;
  }

  private sessionTreeTextPreview(
    content: string | Array<{ type?: string; text?: string; thinking?: string }> | undefined,
    fallback: string,
  ) {
    const parts: string[] = [];

    if (typeof content === "string") {
      parts.push(content);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (block?.type === "text" && typeof block.text === "string" && block.text.trim()) {
          parts.push(block.text);
        } else if (block?.type === "thinking" && typeof block.thinking === "string" && block.thinking.trim()) {
          parts.push(block.thinking);
        }
      }
    }

    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    if (!joined) return fallback;
    return joined.length > 120 ? `${joined.slice(0, 117)}...` : joined;
  }

  private extractSearchText(raw: string) {
    const snippets: string[] = [];

    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as unknown;
        this.collectSearchableStrings(parsed, snippets);
      } catch {
        snippets.push(trimmed);
      }
    }

    return snippets.join(" ").replace(/\s+/g, " ").trim();
  }

  private collectSearchableStrings(value: unknown, output: string[]) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        output.push(trimmed);
      }
      return;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        this.collectSearchableStrings(entry, output);
      }
      return;
    }

    if (value && typeof value === "object") {
      for (const entry of Object.values(value)) {
        this.collectSearchableStrings(entry, output);
      }
    }
  }

  private buildSearchExcerpt(searchText: string, matchIndex: number, queryLength: number) {
    const start = Math.max(0, matchIndex - 44);
    const end = Math.min(searchText.length, matchIndex + queryLength + 84);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < searchText.length ? "..." : "";
    return `${prefix}${searchText.slice(start, end).trim()}${suffix}`;
  }

  private refreshActiveThreadFlags() {
    const projectId = this.workspaceState.activeProjectId;
    if (!projectId) return;

    const threads = this.threadCache[projectId] ?? [];
    this.threadCache[projectId] = threads.map((thread) => {
      const running =
        this.isThreadRunningInGui(projectId, thread.sessionFile) || this.isProjectRunningInTui(projectId);
      return {
        ...thread,
        running,
      };
    });
  }

  private async refreshProjectThreads(project: ProjectRecord) {
    const sessions = (await SessionManager.list(project.path)) as SessionInfoLike[];
    const sorted = [...sessions].sort((a, b) => this.sessionModifiedMs(b) - this.sessionModifiedMs(a));

    let mapped = sorted.map((session) => this.mapSessionToThread(session, project));
    mapped = this.sortThreadsWithMetadata(mapped);

    this.threadCache[project.id] = mapped;
    this.projectGitInfo[project.id] = await this.inspectProjectGitInfo(project.path);
    this.refreshActiveThreadFlags();
    this.emitSnapshot();
  }

  private sortThreadsWithMetadata(threads: ThreadSummary[]) {
    return [...threads].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if (a.isArchived !== b.isArchived) return a.isArchived ? 1 : -1;
      return b.updatedAtMs - a.updatedAtMs;
    });
  }

  private mapSessionToThread(session: SessionInfoLike, project: ProjectRecord): ThreadSummary {
    const title = normalizeThreadTitle(session.name ?? session.firstMessage ?? path.basename(project.path));
    const updatedAtMs = this.sessionModifiedMs(session);
    const metadata = this.getThreadMetadata(project.id, session.path);

    return {
      id: `${session.id}-${session.path}`,
      sessionId: session.id,
      sessionFile: session.path,
      title,
      updatedAt: new Date(updatedAtMs).toISOString(),
      updatedAtMs,
      ageLabel: this.relativeTimeLabel(updatedAtMs),
      messageCount: Number.isFinite(session.messageCount) ? Math.max(0, Number(session.messageCount)) : 0,
      isPinned: Boolean(metadata.pinned),
      isArchived: Boolean(metadata.archived),
      running: this.isThreadRunningInGui(project.id, session.path) || this.isProjectRunningInTui(project.id),
    };
  }

  private sessionModifiedMs(session: SessionInfoLike) {
    const modifiedValue = session.modified;
    if (modifiedValue instanceof Date) {
      return modifiedValue.getTime();
    }

    if (typeof modifiedValue === "string") {
      const parsed = Date.parse(modifiedValue);
      if (!Number.isNaN(parsed)) return parsed;
    }

    return Date.now();
  }

  private relativeTimeLabel(updatedAtMs: number) {
    const deltaMs = Math.max(0, Date.now() - updatedAtMs);
    const minutes = Math.floor(deltaMs / (60 * 1000));
    const hours = Math.floor(deltaMs / (60 * 60 * 1000));
    const days = Math.floor(deltaMs / (24 * 60 * 60 * 1000));

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  }

  private readResourceSummary(resourceLoader: any) {
    return mapResourceSummary({
      extensions: resourceLoader.getExtensions?.()?.extensions ?? [],
      skills: resourceLoader.getSkills?.()?.skills ?? [],
      prompts: resourceLoader.getPrompts?.()?.prompts ?? [],
      themes: resourceLoader.getThemes?.()?.themes ?? [],
      agentsFiles: resourceLoader.getAgentsFiles?.()?.agentsFiles ?? [],
    });
  }

  private async inspectProjectGitInfo(projectPath: string): Promise<ProjectGitInfo> {
    try {
      const [insideResult, branchResult, remoteResult] = await Promise.all([
        this.safeExecGit(projectPath, ["rev-parse", "--is-inside-work-tree"]),
        this.safeExecGit(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]),
        this.safeExecGit(projectPath, ["remote", "get-url", "origin"]),
      ]);

      const isGitRepo = insideResult.stdout.trim() === "true";
      if (!isGitRepo) {
        return {
          isGitRepo: false,
          isGitHubRepo: false,
          branch: null,
        };
      }

      return {
        isGitRepo: true,
        isGitHubRepo: /github\.com/i.test(remoteResult.stdout.trim()),
        branch: branchResult.stdout.trim() || null,
      };
    } catch {
      return {
        isGitRepo: false,
        isGitHubRepo: false,
        branch: null,
      };
    }
  }

  private parseGitStatus(stdout: string) {
    return stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean)
      .map((line) => {
        const status = line.slice(0, 2).trim() || "??";
        const filePath = line.slice(3).trim();

        return {
          status,
          path: filePath,
        };
      });
  }

  private async execDiff(projectPath: string, baseline: GitDiffBaseline) {
    if (baseline === "head") {
      return this.safeExecGit(projectPath, ["diff", "--no-color", "HEAD"]);
    }

    if (baseline === "head~1") {
      return this.safeExecGit(projectPath, ["diff", "--no-color", "HEAD~1..HEAD"]);
    }

    return this.safeExecGit(projectPath, ["diff", "--no-color"]);
  }

  private async safeExecGit(projectPath: string, args: string[]) {
    return execFileAsync("git", ["-C", projectPath, ...args], {
      maxBuffer: 1024 * 1024 * 10,
    });
  }

  private async persistWorkspace() {
    await this.store.save(this.workspaceState);
  }

  private async readDirectoryTree(directoryPath: string, depth: number): Promise<FileTreeNode[]> {
    if (depth >= FILE_TREE_DEPTH_LIMIT) {
      return [];
    }

    try {
      const entries = await readdir(directoryPath, { withFileTypes: true });

      const visibleEntries = entries
        .filter((entry) => !FILE_TREE_IGNORES.has(entry.name))
        .filter((entry) => !entry.name.startsWith("."))
        .sort((left, right) => {
          if (left.isDirectory() !== right.isDirectory()) {
            return left.isDirectory() ? -1 : 1;
          }

          return left.name.localeCompare(right.name);
        });

      return Promise.all(
        visibleEntries.map(async (entry) => {
          const entryPath = path.join(directoryPath, entry.name);
          if (entry.isDirectory()) {
            return {
              name: entry.name,
              path: entryPath,
              kind: "directory" as const,
              children: await this.readDirectoryTree(entryPath, depth + 1),
            };
          }

          return {
            name: entry.name,
            path: entryPath,
            kind: "file" as const,
          };
        }),
      );
    } catch {
      return [];
    }
  }

  private emitSnapshot() {
    this.options.onSnapshot(this.getSnapshot());
  }

  isOldThread(thread: ThreadSummary) {
    return Date.now() - thread.updatedAtMs >= OLD_THREAD_THRESHOLD_MS;
  }
}
