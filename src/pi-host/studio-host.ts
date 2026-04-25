import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { dialog } from "electron";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  SessionManager,
} from "@mariozechner/pi-coding-agent";
import type {
  AttachmentSummary,
  GitComment,
  GitDiffBaseline,
  GitState,
  FileTreeNode,
  ModelSummary,
  ProjectRecord,
  ProjectThreadsMap,
  ResourceSummary,
  TerminalState,
  StreamingBehaviorPreference,
  StudioMode,
  StudioSnapshot,
  ThreadSummary,
} from "../shared/types";
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
  type ThreadMetadata,
  type WorkspaceState,
} from "./workspace-bootstrap";
import { WorkspaceStore } from "./workspace-store";
import { getPiStudioBuiltinResources } from "./builtin-resources";
import { shouldUsePiStudioBuiltins } from "./builtin-selection";

type StudioHostOptions = {
  storePath: string;
  launchProjectPath?: string | null;
  onSnapshot: (snapshot: StudioSnapshot) => void;
  onTuiData: (chunk: { sessionId: string; data: string }) => void;
  onTerminalData: (chunk: { sessionId: string; data: string }) => void;
};

type GuiSessionRuntime = {
  id: string;
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
  resourceLoader: any;
};

type TuiSessionRuntime = {
  terminal: TuiTerminal;
  status: StudioSnapshot["tui"]["status"];
  errorText: string | null;
  projectId: string | null;
  cwd: string | null;
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

type ResourceLoaderProfile = "default" | "studioBuiltins";

export class StudioHost {
  private readonly store: WorkspaceStore;
  private readonly authStorage = AuthStorage.create();
  private readonly modelRegistry = ModelRegistry.create(this.authStorage);

  private workspaceState: WorkspaceState = {
    projects: [],
    activeProjectId: null,
    activeMode: "gui",
    projectFavorites: {},
    threadMetadataByProject: {},
    gitCommentsByProject: {},
    gitBaselineByProject: {},
  };

  private threadCache: ProjectThreadsMap = {};
  private projectGitInfo: Record<string, ProjectGitInfo> = {};
  private guiSessions: Record<string, GuiSessionRuntime> = {};
  private activeGuiSessionId = "default";
  private currentSession: any = null;
  private currentResourceLoader: any = null;
  private resourceLoadersByProject: Record<string, Partial<Record<ResourceLoaderProfile, any>>> = {};
  private resourceLoaderLastReloadMsByProject: Record<string, Partial<Record<ResourceLoaderProfile, number>>> = {};
  private currentProjectPath: string | null = null;
  private currentSessionFile: string | null = null;
  private currentSessionTitle = "New thread";
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
    return Object.values(this.tuiSessions).some(
      (runtime) => runtime.terminal.active && runtime.projectId === projectId,
    );
  }

  private getGuiRuntime(sessionId = this.activeGuiSessionId) {
    return this.guiSessions[sessionId] ?? null;
  }

  private isThreadRunningInGui(projectId: string, sessionFile: string) {
    return Object.values(this.guiSessions).some(
      (runtime) =>
        runtime.projectId === projectId &&
        runtime.sessionFile === sessionFile &&
        (runtime.isStreaming || runtime.session?.isStreaming),
    );
  }

  private syncLegacyGuiStateFromRuntime(sessionId = this.activeGuiSessionId) {
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

  async initialize() {
    const launchProjectPath = await this.resolveLaunchProjectPath(this.options.launchProjectPath);
    const { state, changed } = ensureWorkspaceSelection({
      state: await this.store.load(),
      createProject: (projectPath) => this.store.createProject(projectPath),
      defaultProjectPath: process.cwd(),
      launchProjectPath,
    });

    this.workspaceState = state;

    if (changed) {
      await this.persistWorkspace();
    }

    this.modelRegistry.refresh();
    this.availableModels = this.modelRegistry.getAvailable().map(this.modelToSummary);

    await this.refreshAllThreads();

    const activeProject = this.getActiveProject();
    if (activeProject) {
      await this.openSessionForProject(activeProject, { kind: "continue" });
      await this.refreshGitState();
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

    return {
      projects,
      threadsByProject: this.threadCache,
      activeProjectId: this.workspaceState.activeProjectId,
      activeMode: this.workspaceState.activeMode,
      gui: (() => {
        const activeRuntime = this.getGuiRuntime(this.activeGuiSessionId) ?? this.getGuiRuntime("default");
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
            };

        return {
          ...sourceRuntime,
          availableModels: this.availableModels,
          streamingBehaviorPreference: this.streamingBehaviorPreference,
          sessionId: this.activeGuiSessionId,
          activeSessionId: this.activeGuiSessionId,
          sessions: Object.fromEntries(
            Object.entries(this.guiSessions).map(([sessionId, runtime]) => [
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
        currentProjectPath: this.currentProjectPath,
        currentSessionFile: this.currentSessionFile,
        currentMode: this.workspaceState.activeMode,
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

  async addProject(projectPath: string) {
    await stat(projectPath);
    const project = this.store.createProject(projectPath);

    if (!this.workspaceState.projects.some((entry) => entry.id === project.id)) {
      this.workspaceState.projects = [...this.workspaceState.projects, project];
    }

    this.workspaceState.activeProjectId = project.id;
    await this.persistWorkspace();
    await this.refreshProjectThreads(project);
    await this.openSessionForProject(project, { kind: "continue" });
    await this.refreshGitState();
    return this.getSnapshot();
  }

  async selectProject(projectId: string) {
    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (!project) return this.getSnapshot();

    this.workspaceState.activeProjectId = project.id;
    await this.persistWorkspace();
    await this.refreshProjectThreads(project);
    await this.openSessionForProject(project, { kind: "continue" });
    await this.refreshGitState();

    if (this.workspaceState.activeMode === "tui") {
      const runningSessionIds = Object.entries(this.tuiSessions)
        .filter(([, runtime]) => runtime.terminal.active)
        .map(([sessionId]) => sessionId);

      if (runningSessionIds.length === 0) {
        await this.startTui("default");
      } else {
        for (const sessionId of runningSessionIds) {
          await this.startTui(sessionId);
        }
      }
    }

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
    delete this.threadCache[projectId];
    delete this.projectGitInfo[projectId];
    delete this.resourceLoadersByProject[projectId];
    delete this.resourceLoaderLastReloadMsByProject[projectId];

    for (const [sessionId, runtime] of Object.entries(this.guiSessions)) {
      if (runtime.projectId !== projectId) continue;
      runtime.unsubscribe?.();
      runtime.session?.dispose?.();
      delete this.guiSessions[sessionId];
    }

    for (const runtime of Object.values(this.tuiSessions)) {
      if (runtime.projectId === projectId) {
        runtime.terminal.stop();
        runtime.status = "stopped";
        runtime.projectId = null;
        runtime.cwd = null;
      }
    }

    if (!this.guiSessions[this.activeGuiSessionId]) {
      this.activeGuiSessionId = "default";
      this.syncLegacyGuiStateFromRuntime("default");
    }

    if (removedActive) {
      this.workspaceState.activeProjectId = nextProjects[0]?.id ?? null;
    }

    await this.persistWorkspace();

    if (removedActive) {
      const project = this.getActiveProject();
      if (project) {
        await this.openSessionForProject(project, { kind: "continue" });
        await this.refreshGitState();
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
      this.activeGuiSessionId = "default";

      let changed = false;
      if (this.workspaceState.activeProjectId !== project.id) {
        this.workspaceState.activeProjectId = project.id;
        changed = true;
      }

      if (this.workspaceState.activeMode !== "gui") {
        this.workspaceState.activeMode = "gui";
        changed = true;
      }

      if (changed) {
        await this.persistWorkspace();
      }
    }

    await this.openSessionForProject(project, { kind: "new" }, sessionId);
    return this.getSnapshot();
  }

  async openThread(projectId: string, sessionFile: string, sessionId = "default") {
    const project = this.workspaceState.projects.find((entry) => entry.id === projectId);
    if (!project) return this.getSnapshot();

    const updatesWorkspace = sessionId === "default";

    if (updatesWorkspace) {
      this.activeGuiSessionId = "default";

      let changed = false;
      if (this.workspaceState.activeProjectId !== project.id) {
        this.workspaceState.activeProjectId = project.id;
        changed = true;
      }

      if (this.workspaceState.activeMode !== "gui") {
        this.workspaceState.activeMode = "gui";
        changed = true;
      }

      if (changed) {
        await this.persistWorkspace();
      }
    }

    await this.openSessionForProject(project, { kind: "open", sessionFile }, sessionId);
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

  async sendPrompt(text: string, sessionId = this.activeGuiSessionId) {
    const message = text.trim();
    const runtime = this.getGuiRuntime(sessionId);
    if (!message || !runtime?.session) return this.getSnapshot();

    this.editorDraft = "";

    const isSlashCommand = /^\/\S+/.test(message);
    const attachments = runtime.attachments.map((entry) => entry.path);
    const composedMessage =
      !isSlashCommand && attachments.length > 0
        ? `${message}\n\nAttached files:\n${attachments.map((entry) => `- ${entry}`).join("\n")}`
        : message;

    try {
      await runtime.session.prompt(composedMessage, {
        expandPromptTemplates: true,
        source: "interactive",
        ...(runtime.session.isStreaming ? { streamingBehavior: this.streamingBehaviorPreference } : {}),
      });

      if (!isSlashCommand) {
        runtime.attachments = [];
      }

      if (isSlashCommand && attachments.length > 0) {
        runtime.statusText = "Attachments are ignored for slash commands.";
      }

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

  async abortPrompt(sessionId = this.activeGuiSessionId) {
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

  async pickAttachments(sessionId = this.activeGuiSessionId) {
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

  async removeAttachment(attachmentId: string, sessionId = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime) return this.getSnapshot();

    runtime.attachments = runtime.attachments.filter((attachment) => attachment.id !== attachmentId);

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async clearAttachments(sessionId = this.activeGuiSessionId) {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime) return this.getSnapshot();

    runtime.attachments = [];

    if (sessionId === this.activeGuiSessionId) {
      this.syncLegacyGuiStateFromRuntime(sessionId);
    }

    this.emitSnapshot();
    return this.getSnapshot();
  }

  async setModel(provider: string, modelId: string, sessionId = this.activeGuiSessionId) {
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

  async setThinkingLevel(level: string, sessionId = this.activeGuiSessionId) {
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

    if (runtime.terminal.active && runtime.projectId === activeProject.id) {
      runtime.status = "running";
      runtime.errorText = null;
      runtime.cwd = activeProject.path;
      this.emitSnapshot();
      return this.getSnapshot();
    }

    runtime.errorText = null;
    runtime.status = "starting";
    this.emitSnapshot();

    try {
      if (runtime.terminal.active && runtime.projectId !== activeProject.id) {
        runtime.terminal.stop();
      }

      runtime.terminal.start(activeProject.path);
      runtime.projectId = activeProject.id;
      runtime.cwd = activeProject.path;
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
    this.emitSnapshot();
    return this.getSnapshot();
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
    options: OpenSessionOptions,
    sessionId = "default",
  ) {
    const existing = this.guiSessions[sessionId];
    if (existing) {
      existing.unsubscribe?.();
      existing.unsubscribe = null;
      existing.session?.dispose?.();
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
      sessionManager = SessionManager.open(options.sessionFile);
    } else if (options.kind === "new") {
      sessionManager = SessionManager.create(project.path);
    } else {
      sessionManager = SessionManager.continueRecent(project.path);
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
      session,
      unsubscribe: null,
      projectId: project.id,
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
      resourceLoader,
    };

    this.guiSessions[sessionId] = runtime;

    if (sessionId === "default") {
      this.activeGuiSessionId = "default";
    }

    await this.bindExtensions(session, sessionId);

    runtime.unsubscribe = session.subscribe(() => {
      this.syncSessionState(sessionId);
    });

    this.syncSessionState(sessionId);

    if (options.kind === "new" && runtime.sessionFile) {
      const metadata = this.getThreadMetadata(project.id, runtime.sessionFile);
      this.setThreadMetadata(project.id, runtime.sessionFile, {
        ...metadata,
        piStudioBuiltins: true,
      });
      await this.persistWorkspace();
    }

    if (options.kind === "new") {
      await this.refreshProjectThreads(project);
      return;
    }

    void this.refreshProjectThreads(project).catch(() => {
      // Non-blocking refresh for session switches.
    });
  }

  private async bindExtensions(session: any, sessionId: string) {
    if (typeof session.bindExtensions !== "function") return;

    const bindings = createNoopExtensionBindings({
      getEditorText: () => this.editorDraft,
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
        if (this.workspaceState.activeMode !== "gui") return;

        const project = this.workspaceState.projects.find((entry) => entry.id === this.guiSessions[sessionId]?.projectId);
        if (!project) return;
        await this.openSessionForProject(project, { kind: "new" }, sessionId);
      },
      onSwitchSession: async (sessionPath: string) => {
        if (this.workspaceState.activeMode !== "gui") {
          return false;
        }

        const project = this.workspaceState.projects.find((entry) => entry.id === this.guiSessions[sessionId]?.projectId);
        if (!project) return false;
        await this.openSessionForProject(project, { kind: "open", sessionFile: sessionPath }, sessionId);
        return true;
      },
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

  private syncSessionState(sessionId = "default") {
    const runtime = this.getGuiRuntime(sessionId);
    if (!runtime?.session) return;

    runtime.messages = mapAgentMessages(Array.isArray(runtime.session.messages) ? runtime.session.messages : []);
    runtime.isStreaming = Boolean(runtime.session.isStreaming);
    runtime.sessionFile = runtime.session.sessionFile ?? runtime.sessionFile;
    runtime.sessionTitle = normalizeThreadTitle(
      runtime.session.sessionName ?? this.threadCache[runtime.projectId]?.[0]?.title,
    );

    if (runtime.session.model) {
      runtime.model = this.modelToSummary(runtime.session.model);
    }

    runtime.thinkingLevel = String(runtime.session.thinkingLevel ?? runtime.thinkingLevel);
    runtime.availableThinkingLevels = this.safeThinkingLevels(runtime.session);

    if (sessionId === this.activeGuiSessionId || (sessionId === "default" && this.activeGuiSessionId === "default")) {
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
