import { FolderTree, GitBranch, Globe, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FileTreeNode, GuiState } from "../../shared/types";
import { Sidebar } from "../components/Sidebar";
import { BrowserPanel } from "../components/BrowserPanel";
import { ChatView } from "../components/ChatView";
import { TerminalPanel } from "../components/TerminalPanel";
import { TuiView } from "../components/TuiView";
import { SettingsView } from "../components/SettingsView";
import { GitView } from "../components/GitView";
import { FileTreePanel } from "../components/FileTreePanel";
import { Button } from "../components/ui/button";
import { cn } from "../lib/utils";
import { useStudioState } from "../hooks/useStudioState";

type StudioTheme = "dark" | "light";

type BrowserUrlByThread = Record<string, string>;
type WorkspaceUtilityPanel = "browser" | "terminal" | "files" | "diff";
type UtilityPanelByThread = Record<string, WorkspaceUtilityPanel | null>;
type FileTreeState = {
  projectId: string | null;
  nodes: FileTreeNode[];
  loading: boolean;
  errorText: string | null;
};

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

  const [guiThreadCache, setGuiThreadCache] = useState<Record<string, GuiState>>({});
  const [pendingGuiThreadKey, setPendingGuiThreadKey] = useState<string | null>(null);

  const [utilityPanelByThread, setUtilityPanelByThread] = useState<UtilityPanelByThread>(() =>
    readJsonRecord<UtilityPanelByThread>("pi-studio-utility-panel-by-thread"),
  );
  const [browserUrlByThread, setBrowserUrlByThread] = useState<BrowserUrlByThread>(() =>
    readJsonRecord<BrowserUrlByThread>("pi-studio-browser-url-by-thread"),
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
    window.localStorage.setItem("pi-studio-utility-panel-by-thread", JSON.stringify(utilityPanelByThread));
  }, [utilityPanelByThread]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-browser-url-by-thread", JSON.stringify(browserUrlByThread));
  }, [browserUrlByThread]);

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
  const showingCachedThread = Boolean(pendingGuiThreadKey && pendingGuiThreadKey !== activeGuiThreadKey);
  const activeProjectId = selectedGuiState?.projectId ?? snapshot?.activeProjectId ?? null;
  const activeProject = useMemo(
    () => snapshot?.projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, snapshot],
  );

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
        browser: "Browser",
        terminal: "Terminal",
        files: "Files",
        diff: "Diff",
      }[selectedUtilityPanel]
    : null;

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
        onRemoveProject={(projectId) => void actions.removeProject(projectId)}
        onCreateThread={(projectId) => {
          setPendingGuiThreadKey(null);
          void actions.createThread(projectId);
        }}
        onOpenThread={(projectId, sessionFile) => {
          openGuiThread(projectId, sessionFile);
        }}
        onToggleThreadPinned={(projectId, sessionFile) =>
          void actions.toggleThreadPinned(projectId, sessionFile)
        }
        onToggleThreadArchived={(projectId, sessionFile) =>
          void actions.toggleThreadArchived(projectId, sessionFile)
        }
      />

      <section className="relative flex min-w-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1">
          {activeMode === "gui" ? (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col px-3 pb-3 pt-2" aria-label="GUI workspace">
              <header className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-foreground">
                      {selectedGuiState?.sessionTitle ?? "No thread selected"}
                    </h2>
                    {activeProject ? (
                      <span className="truncate text-sm text-muted-foreground">{activeProject.name}</span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{selectedGuiState?.cwd ?? activeProject?.path ?? "No project"}</span>
                    {utilityPanelLabel ? <span className="rounded-full bg-muted/70 px-2 py-0.5">{utilityPanelLabel}</span> : null}
                    {showingCachedThread ? <span>Loading thread…</span> : null}
                  </div>
                </div>

                <div className="flex items-center gap-1">
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
                    variant={selectedUtilityPanel === "diff" ? "secondary" : "ghost"}
                    onClick={() => toggleUtilityPanel("diff")}
                    disabled={!selectedThreadKey}
                    aria-label="Toggle diff panel"
                    title="Diff"
                  >
                    <GitBranch size={16} />
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

              <div
                className={cn(
                  "grid min-h-0 flex-1",
                  selectedUtilityPanel ? "grid-cols-[minmax(0,1fr)_420px]" : "grid-cols-1",
                )}
              >
                <div className="min-h-0 min-w-0">
                  {selectedGuiState ? (
                    <ChatView
                      gui={selectedGuiState}
                      onSendPrompt={actions.sendPrompt}
                      onAbort={actions.abortPrompt}
                      onSetModel={actions.setModel}
                      onSetThinkingLevel={actions.setThinkingLevel}
                      onPickAttachments={actions.pickAttachments}
                      onRemoveAttachment={actions.removeAttachment}
                      onClearAttachments={actions.clearAttachments}
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
                    initialUrl={browserUrl}
                    onUrlChange={(url) => {
                      setBrowserUrlByThread((current) => ({
                        ...current,
                        [selectedThreadKey]: url,
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
            </section>
          ) : null}

          {activeMode === "tui" ? (
            <section
              className="relative flex min-h-0 min-w-0 flex-1 p-3"
              aria-label="TUI workspace"
            >
              <TuiView
                sessionId="default"
                stopOnUnmount={false}
                tui={snapshot.tui}
                onStart={actions.startTui}
                onStop={actions.stopTui}
                onResize={actions.resizeTui}
                onData={actions.writeToTui}
                subscribeToData={actions.onTuiData}
              />
            </section>
          ) : null}

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
