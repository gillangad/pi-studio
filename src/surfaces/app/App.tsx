import { Bot, Boxes, FolderTree, Globe, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileTreeNode, GuiState } from "../../shared/types";
import { Sidebar } from "../components/Sidebar";
import { ArtifactPanel } from "../components/ArtifactPanel";
import { BrowserPanel } from "../components/BrowserPanel";
import { ChatView } from "../components/ChatView";
import { MasterSessionBar } from "../components/MasterSessionBar";
import { TerminalPanel } from "../components/TerminalPanel";
import { TuiView } from "../components/TuiView";
import { SettingsView } from "../components/SettingsView";
import { GitView } from "../components/GitView";
import { FileTreePanel } from "../components/FileTreePanel";
import { Button } from "../components/ui/button";
import { deriveArtifactsFromMessages } from "../lib/artifacts";
import { cn } from "../lib/utils";
import { useStudioState } from "../hooks/useStudioState";

type StudioTheme = "dark" | "light";

type BrowserUrlByThread = Record<string, string>;
type ArtifactSelectionByThread = Record<string, string | null>;
type DraftByThread = Record<string, string>;
type WorkspaceUtilityPanel = "browser" | "terminal" | "files" | "diff" | "artifacts";
type UtilityPanelByThread = Record<string, WorkspaceUtilityPanel | null>;
type FileTreeState = {
  projectId: string | null;
  nodes: FileTreeNode[];
  loading: boolean;
  errorText: string | null;
};

const SIDEBAR_EXPANDED_MIN_WIDTH = 260;
const SIDEBAR_EXPANDED_MAX_WIDTH = 420;
const SIDEBAR_COLLAPSED_WIDTH = 74;

function threadKey(projectId: string, sessionFile: string) {
  return `${projectId}::${sessionFile}`;
}

function readInitialTheme(): StudioTheme {
  const storedTheme = window.localStorage.getItem("pi-studio-theme");
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }

  const supportsMatchMedia = typeof window.matchMedia === "function";
  return supportsMatchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

function readInitialSidebarCollapsed() {
  return window.localStorage.getItem("pi-studio-sidebar-collapsed") === "true";
}

function clampSidebarWidth(width: number) {
  return Math.min(SIDEBAR_EXPANDED_MAX_WIDTH, Math.max(SIDEBAR_EXPANDED_MIN_WIDTH, width));
}

function readInitialSidebarWidth() {
  const raw = window.localStorage.getItem("pi-studio-sidebar-width");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 320;
  }

  return clampSidebarWidth(parsed);
}

function readInitialMasterSessionVisible() {
  return window.localStorage.getItem("pi-studio-master-session-open") === "true";
}

function readJsonRecord<T extends Record<string, unknown>>(key: string): T {
  const raw = window.localStorage.getItem(key);
  if (!raw) return {} as T;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return {} as T;
    }

    return parsed as T;
  } catch {
    return {} as T;
  }
}

export function App() {
  const { snapshot, bootstrapError, actions } = useStudioState();
  const [theme, setTheme] = useState<StudioTheme>(readInitialTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readInitialSidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth);
  const [masterSessionVisible, setMasterSessionVisible] = useState(readInitialMasterSessionVisible);

  const [guiThreadCache, setGuiThreadCache] = useState<Record<string, GuiState>>({});
  const [pendingGuiThreadKey, setPendingGuiThreadKey] = useState<string | null>(null);

  const [utilityPanelByThread, setUtilityPanelByThread] = useState<UtilityPanelByThread>(() =>
    readJsonRecord<UtilityPanelByThread>("pi-studio-utility-panel-by-thread"),
  );
  const [browserUrlByThread, setBrowserUrlByThread] = useState<BrowserUrlByThread>(() =>
    readJsonRecord<BrowserUrlByThread>("pi-studio-browser-url-by-thread"),
  );
  const [draftByThread, setDraftByThread] = useState<DraftByThread>(() =>
    readJsonRecord<DraftByThread>("pi-studio-draft-by-thread"),
  );
  const [artifactSelectionByThread, setArtifactSelectionByThread] = useState<ArtifactSelectionByThread>(() =>
    readJsonRecord<ArtifactSelectionByThread>("pi-studio-artifact-selection-by-thread"),
  );
  const [fileTree, setFileTree] = useState<FileTreeState>({
    projectId: null,
    nodes: [],
    loading: false,
    errorText: null,
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    window.localStorage.setItem("pi-studio-theme", theme);
  }, [theme]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-sidebar-collapsed", String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-master-session-open", String(masterSessionVisible));
  }, [masterSessionVisible]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-utility-panel-by-thread", JSON.stringify(utilityPanelByThread));
  }, [utilityPanelByThread]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-browser-url-by-thread", JSON.stringify(browserUrlByThread));
  }, [browserUrlByThread]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-draft-by-thread", JSON.stringify(draftByThread));
  }, [draftByThread]);

  useEffect(() => {
    window.localStorage.setItem(
      "pi-studio-artifact-selection-by-thread",
      JSON.stringify(artifactSelectionByThread),
    );
  }, [artifactSelectionByThread]);

  useEffect(() => {
    if (!snapshot) return;

    if (snapshot.activeMode === "extensions" || snapshot.activeMode === "skills") {
      void actions.setMode("gui");
    }
  }, [actions, snapshot]);

  const activeMode =
    snapshot?.activeMode === "extensions" || snapshot?.activeMode === "skills"
      ? "gui"
      : (snapshot?.activeMode ?? "gui");
  const isWorkspaceMode = activeMode === "gui";

  const activeGuiThreadKey = useMemo(() => {
    if (!snapshot?.gui.projectId || !snapshot.gui.sessionFile) return null;
    return threadKey(snapshot.gui.projectId, snapshot.gui.sessionFile);
  }, [snapshot?.gui.projectId, snapshot?.gui.sessionFile]);

  useEffect(() => {
    if (!snapshot?.gui.projectId || !snapshot.gui.sessionFile) return;

    const key = threadKey(snapshot.gui.projectId, snapshot.gui.sessionFile);
    setGuiThreadCache((current) => ({
      ...current,
      [key]: snapshot.gui,
    }));

    if (pendingGuiThreadKey === key) {
      setPendingGuiThreadKey(null);
    }
  }, [pendingGuiThreadKey, snapshot?.gui]);

  const selectedGuiState = useMemo(() => {
    if (!snapshot) return null;

    if (pendingGuiThreadKey && pendingGuiThreadKey !== activeGuiThreadKey) {
      const cached = guiThreadCache[pendingGuiThreadKey];
      if (cached) {
        return cached;
      }
    }

    return snapshot.gui;
  }, [activeGuiThreadKey, guiThreadCache, pendingGuiThreadKey, snapshot]);

  const selectedThreadKey = activeGuiThreadKey ?? pendingGuiThreadKey;
  const selectedUtilityPanel = selectedThreadKey ? utilityPanelByThread[selectedThreadKey] ?? null : null;
  const browserUrl = selectedThreadKey ? browserUrlByThread[selectedThreadKey] ?? "https://example.com" : "https://example.com";
  const sharedDraft = selectedThreadKey ? draftByThread[selectedThreadKey] ?? "" : "";
  const selectedArtifactId = selectedThreadKey ? artifactSelectionByThread[selectedThreadKey] ?? null : null;
  const showingCachedThread = Boolean(pendingGuiThreadKey && pendingGuiThreadKey !== activeGuiThreadKey);
  const activeProjectId = selectedGuiState?.projectId ?? snapshot?.activeProjectId ?? null;
  const activeProject = useMemo(
    () => snapshot?.projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, snapshot],
  );
  const derivedArtifacts = useMemo(
    () => deriveArtifactsFromMessages(selectedGuiState?.messages ?? []),
    [selectedGuiState?.messages],
  );
  const selectedArtifact =
    (selectedArtifactId ? derivedArtifacts.artifactById[selectedArtifactId] : null) ??
    derivedArtifacts.artifacts[0] ??
    null;
  const renderedGuiState = useMemo(
    () =>
      selectedGuiState
        ? {
            ...selectedGuiState,
            messages: derivedArtifacts.messages,
          }
        : null,
    [derivedArtifacts.messages, selectedGuiState],
  );

  const setSharedDraft = useCallback(
    (value: string) => {
      if (!selectedThreadKey) return;
      setDraftByThread((current) => ({
        ...current,
        [selectedThreadKey]: value,
      }));
    },
    [selectedThreadKey],
  );

  useEffect(() => {
    if (!selectedThreadKey) return;

    const currentSelection = artifactSelectionByThread[selectedThreadKey] ?? null;
    const availableIds = new Set(derivedArtifacts.artifacts.map((artifact) => artifact.artifactId));

    if (currentSelection && availableIds.has(currentSelection)) {
      return;
    }

    const fallbackArtifactId = derivedArtifacts.artifacts[0]?.artifactId ?? null;
    if (currentSelection === fallbackArtifactId) {
      return;
    }

    setArtifactSelectionByThread((current) => ({
      ...current,
      [selectedThreadKey]: fallbackArtifactId,
    }));
  }, [artifactSelectionByThread, derivedArtifacts.artifacts, selectedThreadKey]);

  const loadProjectFileTree = useCallback(
    async (projectId?: string | null) => {
      const nextProjectId = projectId ?? activeProject?.id ?? null;
      if (!nextProjectId) return;

      setFileTree((current) => ({
        projectId: nextProjectId,
        nodes: current.projectId === nextProjectId ? current.nodes : [],
        loading: true,
        errorText: null,
      }));

      try {
        const nodes = await actions.getProjectFileTree(nextProjectId);
        setFileTree({
          projectId: nextProjectId,
          nodes,
          loading: false,
          errorText: null,
        });
      } catch (error) {
        setFileTree({
          projectId: nextProjectId,
          nodes: [],
          loading: false,
          errorText: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [actions, activeProject?.id],
  );

  useEffect(() => {
    if (selectedUtilityPanel === "files" && activeProject?.id && fileTree.projectId !== activeProject.id && !fileTree.loading) {
      void loadProjectFileTree(activeProject.id);
    }
  }, [activeProject?.id, fileTree.loading, fileTree.projectId, loadProjectFileTree, selectedUtilityPanel]);

  useEffect(() => {
    if (selectedUtilityPanel === "diff") {
      void actions.refreshGitState();
    }
  }, [actions, activeProject?.id, selectedUtilityPanel]);

  const openGuiThread = useCallback(
    (projectId: string, sessionFile: string) => {
      const nextKey = threadKey(projectId, sessionFile);
      if (nextKey !== activeGuiThreadKey) {
        setPendingGuiThreadKey(nextKey);
      }

      void actions.openThread(projectId, sessionFile);
    },
    [actions, activeGuiThreadKey],
  );

  const toggleUtilityPanel = (panel: WorkspaceUtilityPanel) => {
    if (!selectedThreadKey) return;

    const nextPanel = selectedUtilityPanel === panel ? null : panel;
    setUtilityPanelByThread((current) => ({
      ...current,
      [selectedThreadKey]: nextPanel,
    }));

    if (nextPanel === "files") {
      void loadProjectFileTree(activeProject?.id ?? null);
    }

    if (nextPanel === "diff") {
      void actions.refreshGitState();
    }
  };

  const utilityPanelLabel = selectedUtilityPanel
    ? {
        artifacts: "Artifacts",
        browser: "Browser",
        terminal: "Terminal",
        files: "Files",
        diff: "Diff",
      }[selectedUtilityPanel]
    : null;

  const openArtifactPanel = useCallback(
    (artifactId?: string | null) => {
      if (!selectedThreadKey) return;

      const nextArtifactId = artifactId ?? derivedArtifacts.artifacts[0]?.artifactId ?? null;
      setArtifactSelectionByThread((current) => ({
        ...current,
        [selectedThreadKey]: nextArtifactId,
      }));
      setUtilityPanelByThread((current) => ({
        ...current,
        [selectedThreadKey]: "artifacts",
      }));
    },
    [derivedArtifacts.artifacts, selectedThreadKey],
  );

  const sidebarRenderedWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  const startSidebarResize = useCallback(
    (pointerStartX: number) => {
      if (sidebarCollapsed) return;

      const widthAtStart = sidebarWidth;

      const handleMove = (event: PointerEvent) => {
        const nextWidth = clampSidebarWidth(widthAtStart + event.clientX - pointerStartX);
        setSidebarWidth(nextWidth);
      };

      const handleEnd = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
    },
    [sidebarCollapsed, sidebarWidth],
  );

  if (!snapshot) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-background p-8">
        <div className="w-full max-w-md rounded-[28px] border border-border/60 bg-card/90 p-6 shadow-glass">
          <h1 className="text-lg font-semibold">Booting Pi Studio…</h1>
          <div className="mt-3">
            {bootstrapError ? (
              <p className="text-sm text-destructive">{bootstrapError}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Preparing workspace and runtime bridge.</p>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="relative shrink-0" style={{ width: `${sidebarRenderedWidth}px` }}>
        <Sidebar
          projects={snapshot.projects}
          activeProjectId={snapshot.activeProjectId}
          threadsByProject={snapshot.threadsByProject}
          activeSessionFile={snapshot.gui.sessionFile}
          activeMode={activeMode}
          theme={theme}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
          onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          onSetMode={(mode) => void actions.setMode(mode)}
          onAddProject={() => void actions.addProject()}
          onSelectProject={(projectId) => void actions.selectProject(projectId)}
          onReorderProjects={(projectIds) => void actions.reorderProjects(projectIds)}
          onRenameProject={(projectId, name) => void actions.renameProject(projectId, name)}
          onRemoveProject={(projectId) => {
            const project = snapshot.projects.find((entry) => entry.id === projectId);
            const projectName = project?.name ?? "this project";
            const confirmed = window.confirm(
              `Remove "${projectName}" from Pi Studio? This only removes it from the sidebar.`,
            );
            if (!confirmed) return;

            setPendingGuiThreadKey(null);
            void actions.removeProject(projectId);
          }}
          onSearchSessions={actions.searchSessions}
          onCreateThread={(projectId) => {
            setPendingGuiThreadKey(null);
            void actions.createThread(projectId);
          }}
          onOpenThread={(projectId, sessionFile) => {
            openGuiThread(projectId, sessionFile);
          }}
          onDeleteThread={(projectId, sessionFile, threadTitle) => {
            const confirmed = window.confirm(`Delete "${threadTitle}"? This removes the saved session.`);
            if (!confirmed) return;

            setPendingGuiThreadKey(null);
            void actions.deleteThread(projectId, sessionFile);
          }}
          onToggleThreadPinned={(projectId, sessionFile) =>
            void actions.toggleThreadPinned(projectId, sessionFile)
          }
          onToggleThreadArchived={(projectId, sessionFile) =>
            void actions.toggleThreadArchived(projectId, sessionFile)
          }
        />

        {!sidebarCollapsed ? (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            tabIndex={0}
            className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize touch-none"
            onPointerDown={(event) => {
              event.preventDefault();
              startSidebarResize(event.clientX);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                setSidebarWidth((current) => clampSidebarWidth(current - 16));
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                setSidebarWidth((current) => clampSidebarWidth(current + 16));
              }
            }}
          />
        ) : null}
      </div>

      <section className="relative flex min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1">
          <section
            hidden={!isWorkspaceMode}
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col pt-2",
              !isWorkspaceMode && "workspace-surface-hidden",
            )}
            aria-label="GUI workspace"
          >
            <header className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[15px] font-semibold text-foreground">
                    {selectedGuiState?.sessionTitle ?? "No thread selected"}
                  </h2>
                  {activeProject ? (
                    <span className="truncate text-[14px] text-muted-foreground">{activeProject.name}</span>
                  ) : null}
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate">{selectedGuiState?.cwd ?? activeProject?.path ?? "No project"}</span>
                  {utilityPanelLabel ? <span className="rounded-full bg-muted/70 px-2 py-0.5 text-[11px]">{utilityPanelLabel}</span> : null}
                  {showingCachedThread ? <span>Loading thread…</span> : null}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant={selectedUtilityPanel === "artifacts" ? "secondary" : "ghost"}
                  onClick={() => {
                    if (!selectedThreadKey) return;
                    if (selectedUtilityPanel === "artifacts") {
                      setUtilityPanelByThread((current) => ({
                        ...current,
                        [selectedThreadKey]: null,
                      }));
                      return;
                    }

                    openArtifactPanel(selectedArtifact?.artifactId ?? null);
                  }}
                  disabled={!selectedThreadKey || derivedArtifacts.artifacts.length === 0}
                  aria-label="Toggle artifacts panel"
                  title={
                    derivedArtifacts.artifacts.length > 0
                      ? `Artifacts (${derivedArtifacts.artifacts.length})`
                      : "Artifacts"
                  }
                  className="relative"
                >
                  <Boxes size={16} />
                  {derivedArtifacts.artifacts.length > 0 ? (
                    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                      {derivedArtifacts.artifacts.length}
                    </span>
                  ) : null}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={masterSessionVisible ? "secondary" : "ghost"}
                  onClick={() => setMasterSessionVisible((current) => !current)}
                  aria-label="Toggle master session"
                  title="Master session"
                >
                  <Bot size={16} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={selectedUtilityPanel === "terminal" ? "secondary" : "ghost"}
                  onClick={() => toggleUtilityPanel("terminal")}
                  disabled={!selectedThreadKey}
                  aria-label="Toggle terminal panel"
                  title="Terminal"
                >
                  <TerminalSquare size={16} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={selectedUtilityPanel === "files" ? "secondary" : "ghost"}
                  onClick={() => toggleUtilityPanel("files")}
                  disabled={!selectedThreadKey}
                  aria-label="Toggle file tree panel"
                  title="Files"
                >
                  <FolderTree size={16} />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant={selectedUtilityPanel === "browser" ? "secondary" : "ghost"}
                  onClick={() => toggleUtilityPanel("browser")}
                  disabled={!selectedThreadKey}
                  aria-label="Toggle browser panel"
                  title="Browser"
                >
                  <Globe size={16} />
                </Button>
              </div>
            </header>

            <div className="relative min-h-0 flex-1">
              {masterSessionVisible ? (
                <MasterSessionBar
                  master={snapshot.master}
                  onClose={() => setMasterSessionVisible(false)}
                  onSendPrompt={actions.sendPrompt}
                  onAbort={actions.abortPrompt}
                  onPickAttachments={actions.pickAttachments}
                  onOpenTarget={(projectId, sessionPath) => {
                    openGuiThread(projectId, sessionPath);
                  }}
                />
              ) : null}

              <div
                className={cn(
                  "grid h-full min-h-0 px-3 pb-3",
                  selectedUtilityPanel === "terminal"
                    ? "grid-cols-1 grid-rows-[minmax(0,1fr)_260px]"
                    : selectedUtilityPanel === "artifacts"
                      ? "grid-cols-[minmax(0,1fr)_minmax(380px,520px)]"
                    : selectedUtilityPanel
                      ? "grid-cols-[minmax(0,1fr)_420px]"
                      : "grid-cols-1",
                )}
              >
              <div className="min-h-0 min-w-0">
                {renderedGuiState ? (
                  <ChatView
                    gui={renderedGuiState}
                    composerValue={sharedDraft}
                    onComposerValueChange={setSharedDraft}
                    onSendPrompt={actions.sendPrompt}
                    onAbort={actions.abortPrompt}
                    onSetModel={actions.setModel}
                    onSetThinkingLevel={actions.setThinkingLevel}
                    onPickAttachments={actions.pickAttachments}
                    onRemoveAttachment={actions.removeAttachment}
                    onClearAttachments={actions.clearAttachments}
                    onGetSessionTree={actions.getSessionTree}
                    onNavigateTree={actions.navigateTree}
                    onRunSlashCommand={actions.runSlashCommand}
                    artifactById={derivedArtifacts.artifactById}
                    onOpenArtifact={(artifactId) => openArtifactPanel(artifactId)}
                  />
                ) : (
                  <div className="flex h-full min-h-0 items-center justify-center text-center">
                    <div className="px-6 py-10">
                      <h3 className="text-base font-semibold">No thread selected</h3>
                      <p className="mt-1 text-sm text-muted-foreground">Select or create a thread.</p>
                    </div>
                  </div>
                )}
              </div>

              {selectedUtilityPanel === "browser" && selectedThreadKey ? (
                <BrowserPanel
                  threadKey={selectedThreadKey}
                  sessionFile={selectedGuiState?.sessionFile ?? null}
                  initialUrl={browserUrl}
                  onUrlChange={(url) => {
                    setBrowserUrlByThread((current) => ({
                      ...current,
                      [selectedThreadKey]: url,
                    }));
                  }}
                />
              ) : null}

              {selectedUtilityPanel === "artifacts" ? (
                <ArtifactPanel
                  artifacts={derivedArtifacts.artifacts}
                  selectedArtifactId={selectedArtifact?.artifactId ?? null}
                  onSelectArtifact={(artifactId) => {
                    if (!selectedThreadKey) return;
                    setArtifactSelectionByThread((current) => ({
                      ...current,
                      [selectedThreadKey]: artifactId,
                    }));
                  }}
                />
              ) : null}

              {selectedUtilityPanel === "terminal" ? (
                <TerminalPanel
                  sessionId="utility"
                  terminal={snapshot.terminal}
                  onStart={actions.startTerminal}
                  onStop={actions.stopTerminal}
                  onResize={actions.resizeTerminal}
                  onData={actions.writeToTerminal}
                  subscribeToData={actions.onTerminalData}
                />
              ) : null}

              {selectedUtilityPanel === "files" ? (
                <FileTreePanel
                  projectName={activeProject?.name ?? "Project files"}
                  projectPath={activeProject?.path ?? selectedGuiState?.cwd ?? null}
                  nodes={fileTree.projectId === activeProject?.id ? fileTree.nodes : []}
                  loading={fileTree.loading && fileTree.projectId === activeProject?.id}
                  errorText={fileTree.projectId === activeProject?.id ? fileTree.errorText : null}
                  onRefresh={() => {
                    void loadProjectFileTree(activeProject?.id ?? null);
                  }}
                />
              ) : null}

              {selectedUtilityPanel === "diff" ? (
                <GitView
                  compact
                  git={snapshot.git}
                  onRefresh={actions.refreshGitState}
                  onSetBaseline={actions.setGitBaseline}
                  onAddComment={actions.addGitComment}
                  onRemoveComment={actions.removeGitComment}
                />
              ) : null}
              </div>
            </div>
          </section>
          <section
            hidden={activeMode !== "tui"}
            className={cn(
              "relative flex min-h-0 min-w-0 flex-1",
              activeMode !== "tui" && "workspace-surface-hidden",
            )}
            aria-label="TUI workspace"
          >
            <TuiView
              active={activeMode === "tui"}
              sessionId={selectedGuiState?.sessionId}
              gui={renderedGuiState ?? snapshot.gui}
              tui={snapshot.tui}
              draft={sharedDraft}
              onDraftChange={setSharedDraft}
              onSendPrompt={actions.sendPrompt}
              onAbort={actions.abortPrompt}
            />
          </section>

          {activeMode === "git" ? (
            <section className="flex min-h-0 min-w-0 flex-1 p-3">
              <GitView
                git={snapshot.git}
                onRefresh={actions.refreshGitState}
                onSetBaseline={actions.setGitBaseline}
                onAddComment={actions.addGitComment}
                onRemoveComment={actions.removeGitComment}
              />
            </section>
          ) : null}

          {activeMode === "settings" ? (
            <section className="flex min-h-0 min-w-0 flex-1 p-3">
              <SettingsView
                settings={snapshot.settings}
                snapshot={snapshot}
                onOpenMode={(mode) => void actions.setMode(mode)}
              />
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
