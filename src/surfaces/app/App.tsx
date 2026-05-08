import { FolderTree, Globe, TerminalSquare } from "lucide-react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import type { FileTreeNode, GuiState, ProjectRecord, StudioSessionSummary } from "../../shared/types";
import { Sidebar } from "../components/Sidebar";
import { BrowserPanel } from "../components/BrowserPanel";
import { Composer } from "../components/Composer";
import { SessionCard } from "../components/SessionCard";
import { TerminalPanel } from "../components/TerminalPanel";
import { TuiView } from "../components/TuiView";
import { SettingsView } from "../components/SettingsView";
import { GitView } from "../components/GitView";
import { FileTreePanel } from "../components/FileTreePanel";
import { Button } from "../components/ui/button";
import { useStudioState } from "../hooks/useStudioState";

type StudioTheme = "dark" | "light";
type BrowserUrlByProject = Record<string, string>;
type WorkspaceUtilityPanel = "browser" | "terminal" | "files" | "diff";
type UtilityPanelByProject = Record<string, WorkspaceUtilityPanel | null>;
type ProjectColumnUnits = Record<string, number>;
type FileTreeState = {
  projectId: string | null;
  nodes: FileTreeNode[];
  loading: boolean;
  errorText: string | null;
};
type WorkerSessionEntry = { summary: StudioSessionSummary; gui: GuiState };
type ProjectSessionGroup = {
  project: ProjectRecord;
  sessions: WorkerSessionEntry[];
  accent: string;
};

const SIDEBAR_EXPANDED_MIN_WIDTH = 260;
const SIDEBAR_EXPANDED_MAX_WIDTH = 420;
const SIDEBAR_COLLAPSED_WIDTH = 74;
const UTILITY_PANEL_MIN_WIDTH = 340;
const UTILITY_PANEL_MAX_WIDTH = 920;
const BROWSER_PANEL_MIN_WIDTH = 420;
const SESSION_COLUMN_MIN_UNITS = 90;
const SESSION_COLUMN_MAX_UNITS = 320;
const SESSION_COLUMN_UNIT_PIXELS = 4;
const PROJECT_ACCENTS = ["#4f9cf9", "#f28c28", "#2aa876", "#e05d5d", "#b06cf7", "#d4a72c"];

function projectKey(projectId: string) {
  return `project::${projectId}`;
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

function minimumUtilityPanelWidth(panel: WorkspaceUtilityPanel | null | undefined) {
  if (panel === "browser") {
    return BROWSER_PANEL_MIN_WIDTH;
  }

  return UTILITY_PANEL_MIN_WIDTH;
}

function clampUtilityPanelWidth(width: number, panel: WorkspaceUtilityPanel | null | undefined = null) {
  return Math.min(UTILITY_PANEL_MAX_WIDTH, Math.max(minimumUtilityPanelWidth(panel), width));
}

function readInitialUtilityPanelWidth() {
  const raw = window.localStorage.getItem("pi-studio-utility-panel-width");
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 420;
  }

  return clampUtilityPanelWidth(parsed);
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

function clampProjectColumnUnits(units: number) {
  return Math.min(SESSION_COLUMN_MAX_UNITS, Math.max(SESSION_COLUMN_MIN_UNITS, units));
}

function readInitialProjectColumnUnits() {
  return readJsonRecord<ProjectColumnUnits>("pi-studio-project-column-units");
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function colorForProject(projectId: string) {
  return PROJECT_ACCENTS[hashString(projectId) % PROJECT_ACCENTS.length] ?? PROJECT_ACCENTS[0];
}

export function App() {
  const { snapshot, bootstrapError, actions } = useStudioState();
  const [theme, setTheme] = useState<StudioTheme>(readInitialTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readInitialSidebarCollapsed);
  const [sidebarWidth, setSidebarWidth] = useState(readInitialSidebarWidth);
  const [utilityPanelWidth, setUtilityPanelWidth] = useState(readInitialUtilityPanelWidth);
  const [controllerComposerValue, setControllerComposerValue] = useState("");
  const [controllerAgentMenuOpen, setControllerAgentMenuOpen] = useState(false);
  const [projectColumnUnits, setProjectColumnUnits] = useState<ProjectColumnUnits>(readInitialProjectColumnUnits);
  const [utilityPanelByProject, setUtilityPanelByProject] = useState<UtilityPanelByProject>(() =>
    readJsonRecord<UtilityPanelByProject>("pi-studio-utility-panel-by-project"),
  );
  const [browserUrlByProject, setBrowserUrlByProject] = useState<BrowserUrlByProject>(() =>
    readJsonRecord<BrowserUrlByProject>("pi-studio-browser-url-by-project"),
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
    window.localStorage.setItem("pi-studio-utility-panel-width", String(utilityPanelWidth));
  }, [utilityPanelWidth]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-utility-panel-by-project", JSON.stringify(utilityPanelByProject));
  }, [utilityPanelByProject]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-browser-url-by-project", JSON.stringify(browserUrlByProject));
  }, [browserUrlByProject]);

  useEffect(() => {
    window.localStorage.setItem("pi-studio-project-column-units", JSON.stringify(projectColumnUnits));
  }, [projectColumnUnits]);

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

  const focusedGuiState = snapshot?.gui ?? null;
  const controllerState = snapshot?.controller ?? null;
  const activeProjectId = snapshot?.activeProjectId ?? null;
  const activeProject = useMemo(
    () => snapshot?.projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, snapshot],
  );

  const workerSessions = useMemo(() => {
    if (!snapshot) return [] as WorkerSessionEntry[];

    return snapshot.studio.workerSessionIds
      .map((sessionId) => {
        const summary = snapshot.studio.sessions[sessionId];
        const gui = snapshot.gui.sessions?.[sessionId];
        if (!summary || !gui) {
          return null;
        }

        return { summary, gui };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [snapshot]);

  const projectSessionGroups = useMemo(() => {
    if (!snapshot) return [] as ProjectSessionGroup[];

    return snapshot.projects
      .map((project) => {
        const sessions = workerSessions.filter(({ summary }) => summary.projectId === project.id);
        if (sessions.length === 0) {
          return null;
        }

        return {
          project,
          sessions,
          accent: colorForProject(project.id),
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [snapshot, workerSessions]);

  const selectedProjectKey = activeProjectId ? projectKey(activeProjectId) : null;
  const hasWorkerSessions = workerSessions.length > 0;

  const selectedUtilityPanel = selectedProjectKey ? (utilityPanelByProject[selectedProjectKey] ?? null) : null;
  const browserUrl = selectedProjectKey ? browserUrlByProject[selectedProjectKey] ?? "https://example.com" : "https://example.com";

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
  }, [actions, selectedUtilityPanel]);

  useEffect(() => {
    if (projectSessionGroups.length === 0) return;

    setProjectColumnUnits((current) => {
      let changed = false;
      const next = { ...current };

      for (const group of projectSessionGroups) {
        if (next[group.project.id]) continue;
        next[group.project.id] = clampProjectColumnUnits(group.sessions.length * 110);
        changed = true;
      }

      for (const projectId of Object.keys(next)) {
        if (projectSessionGroups.some((group) => group.project.id === projectId)) continue;
        delete next[projectId];
        changed = true;
      }

      return changed ? next : current;
    });
  }, [projectSessionGroups]);

  const openGuiThread = useCallback(
    (projectId: string, sessionFile: string) => {
      void actions.openThread(projectId, sessionFile);
    },
    [actions],
  );

  const toggleUtilityPanel = (panel: WorkspaceUtilityPanel) => {
    if (!selectedProjectKey) return;

    const nextPanel = selectedUtilityPanel === panel ? null : panel;
    if (nextPanel) {
      setUtilityPanelWidth((current) => clampUtilityPanelWidth(current, nextPanel));
    }

    setUtilityPanelByProject((current) => ({
      ...current,
      [selectedProjectKey]: nextPanel,
    }));

    if (nextPanel === "files") {
      void loadProjectFileTree(activeProject?.id ?? null);
    }

    if (nextPanel === "diff") {
      void actions.refreshGitState();
    }
  };

  const sidebarRenderedWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;
  const hasSideUtilityPanel = Boolean(selectedUtilityPanel && selectedUtilityPanel !== "terminal");
  const totalProjectColumnUnits = useMemo(
    () =>
      projectSessionGroups.reduce(
        (sum, group) => sum + (projectColumnUnits[group.project.id] ?? clampProjectColumnUnits(group.sessions.length * 110)),
        0,
      ),
    [projectColumnUnits, projectSessionGroups],
  );

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

  const startUtilityPanelResize = useCallback(
    (pointerStartX: number) => {
      if (!hasSideUtilityPanel || !selectedUtilityPanel) return;

      const widthAtStart = utilityPanelWidth;

      const handleMove = (event: PointerEvent) => {
        const nextWidth = clampUtilityPanelWidth(widthAtStart + pointerStartX - event.clientX, selectedUtilityPanel);
        setUtilityPanelWidth(nextWidth);
      };

      const handleEnd = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
    },
    [hasSideUtilityPanel, selectedUtilityPanel, utilityPanelWidth],
  );

  const startProjectColumnResize = useCallback(
    (leftProjectId: string, rightProjectId: string, pointerStartX: number) => {
      const leftAtStart = projectColumnUnits[leftProjectId] ?? SESSION_COLUMN_MIN_UNITS;
      const rightAtStart = projectColumnUnits[rightProjectId] ?? SESSION_COLUMN_MIN_UNITS;
      const combined = leftAtStart + rightAtStart;

      const handleMove = (event: PointerEvent) => {
        const deltaUnits = (event.clientX - pointerStartX) / SESSION_COLUMN_UNIT_PIXELS;
        const nextLeft = clampProjectColumnUnits(leftAtStart + deltaUnits);
        const nextRight = clampProjectColumnUnits(combined - nextLeft);
        const stabilizedLeft = clampProjectColumnUnits(combined - nextRight);

        setProjectColumnUnits((current) => ({
          ...current,
          [leftProjectId]: stabilizedLeft,
          [rightProjectId]: nextRight,
        }));
      };

      const handleEnd = () => {
        window.removeEventListener("pointermove", handleMove);
        window.removeEventListener("pointerup", handleEnd);
      };

      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleEnd);
    },
    [projectColumnUnits],
  );

  const sendControllerPrompt = useCallback(() => {
    const trimmed = controllerComposerValue.trim();
    if (!trimmed || !controllerState) return;

    if (/^\//.test(trimmed)) {
      const commandText = trimmed;
      setControllerComposerValue("");
      void actions.runSlashCommand(commandText, controllerState.sessionId).then((result) => {
        if (!result.handled) {
          setControllerComposerValue(commandText);
        }

        if (result.openModelPicker) {
          setControllerAgentMenuOpen(true);
        }
      });
      return;
    }

    void actions.sendPrompt(trimmed, controllerState.sessionId);
    setControllerComposerValue("");
  }, [actions, controllerComposerValue, controllerState]);

  if (bootstrapError) {
    return (
      <main className="flex h-screen items-center justify-center bg-background px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold">Pi Studio failed to start</h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">{bootstrapError}</p>
        </div>
      </main>
    );
  }

  if (!snapshot) {
    return (
      <main className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Launching Pi Studio…</div>
      </main>
    );
  }

  return (
    <main className="flex h-screen overflow-hidden bg-background text-foreground">
      <div
        className="relative shrink-0"
        style={{ width: sidebarRenderedWidth }}
      >
        <Sidebar
          projects={snapshot.projects}
          activeProjectId={snapshot.activeProjectId}
          threadsByProject={snapshot.threadsByProject}
          activeSessionFile={focusedGuiState?.sessionFile ?? null}
          activeMode={snapshot.activeMode}
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
          onSearchSessions={(query) => actions.searchSessions(query)}
          onCreateThread={(projectId) => void actions.createThread(projectId)}
          onOpenThread={(projectId, sessionFile) => openGuiThread(projectId, sessionFile)}
          onDeleteThread={(projectId, sessionFile) => void actions.deleteThread(projectId, sessionFile)}
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
        <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
          {isWorkspaceMode ? (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col pt-2" aria-label="Canvas">
              <header className="flex items-center justify-end gap-3 px-5 py-3">
                <div
                  className="min-w-0 max-w-[52%] truncate rounded-full border border-border/70 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground"
                  title={controllerState?.cwd ?? snapshot.settings.masterSessionPath ?? "No master directory"}
                >
                  {controllerState?.cwd ?? snapshot.settings.masterSessionPath ?? "No master directory"}
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="icon"
                    variant={selectedUtilityPanel === "terminal" ? "secondary" : "ghost"}
                    onClick={() => toggleUtilityPanel("terminal")}
                    disabled={!selectedProjectKey}
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
                    disabled={!selectedProjectKey}
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
                    disabled={!selectedProjectKey}
                    aria-label="Toggle browser panel"
                    title="Browser"
                  >
                    <Globe size={16} />
                  </Button>
                </div>
              </header>

              <div className="relative min-h-0 flex-1 px-3 pb-3">
                <div
                  className="grid h-full min-h-0"
                  style={
                    selectedUtilityPanel === "terminal"
                      ? {
                          gridTemplateColumns: "minmax(0,1fr)",
                          gridTemplateRows: "minmax(0,1fr) 260px",
                        }
                      : hasSideUtilityPanel
                        ? {
                            gridTemplateColumns: `minmax(0,1fr) ${utilityPanelWidth}px`,
                          }
                        : {
                            gridTemplateColumns: "minmax(0,1fr)",
                          }
                  }
                >
                  <div
                    className="grid min-h-0 min-w-0 gap-3"
                    style={{ gridTemplateRows: hasWorkerSessions ? "minmax(0,1fr) auto" : "minmax(0,1fr) auto" }}
                  >
                    {hasWorkerSessions ? (
                      <section className="session-canvas-shell min-h-0 overflow-hidden rounded-[32px] border border-border/60 bg-gradient-to-br from-card/94 via-card/86 to-background/96">
                        <div className="h-full min-h-0 overflow-auto px-4 py-4">
                          <div className="flex min-h-full items-stretch gap-4">
                            {projectSessionGroups.map((group, index) => {
                              const units =
                                projectColumnUnits[group.project.id] ??
                                clampProjectColumnUnits(group.sessions.length * 110);
                              const nextGroup = projectSessionGroups[index + 1] ?? null;

                              return (
                                <Fragment key={group.project.id}>
                                  <section
                                    className="flex min-h-0 shrink-0 flex-col overflow-hidden rounded-[28px] border bg-card/40"
                                    style={{
                                      flexBasis: totalProjectColumnUnits > 0 ? `${(units / totalProjectColumnUnits) * 100}%` : "100%",
                                      minWidth: `${Math.max(440, group.sessions.length * 380 + Math.max(0, group.sessions.length - 1) * 16 + 40)}px`,
                                      borderColor: `${group.accent}44`,
                                      boxShadow: `inset 0 1px 0 ${group.accent}22`,
                                      background: `linear-gradient(180deg, ${group.accent}12 0%, rgba(0,0,0,0) 22%), rgba(255,255,255,0.01)`,
                                    }}
                                  >
                                    <div
                                      className="border-b px-4 py-3"
                                      style={{ borderColor: `${group.accent}2e` }}
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="flex items-center gap-2">
                                            <span
                                              className="h-2.5 w-2.5 rounded-full"
                                              style={{ backgroundColor: group.accent }}
                                            />
                                            <span className="truncate text-sm font-semibold text-foreground">
                                              {group.project.name}
                                            </span>
                                          </div>
                                          <div className="mt-1 truncate text-[11px] text-muted-foreground">
                                            {group.project.path}
                                          </div>
                                        </div>
                                        <span
                                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                                          style={{
                                            backgroundColor: `${group.accent}22`,
                                            color: group.accent,
                                          }}
                                        >
                                          {group.sessions.length}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="min-h-0 overflow-x-auto overflow-y-hidden px-4 py-4">
                                      <div
                                        className="grid min-h-full auto-rows-[minmax(460px,1fr)] gap-4"
                                        style={{
                                          gridTemplateColumns: `repeat(${group.sessions.length}, minmax(360px, 1fr))`,
                                          minWidth: `${Math.max(
                                            group.sessions.length * 360 +
                                              Math.max(0, group.sessions.length - 1) * 16,
                                            360,
                                          )}px`,
                                        }}
                                      >
                                        {group.sessions.map(({ summary, gui }) => (
                                          <SessionCard
                                            key={summary.sessionId}
                                            summary={summary}
                                            gui={gui}
                                            accent={group.accent}
                                            onClose={() => void actions.closeSession(summary.sessionId)}
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
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  </section>

                                  {nextGroup ? (
                                    <button
                                      type="button"
                                      className="my-10 hidden w-3 shrink-0 cursor-col-resize rounded-full border border-border/40 bg-card/50 transition-colors hover:bg-card/80 lg:block"
                                      aria-label={`Resize columns between ${group.project.name} and ${nextGroup.project.name}`}
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        startProjectColumnResize(group.project.id, nextGroup.project.id, event.clientX);
                                      }}
                                    />
                                  ) : null}
                                </Fragment>
                              );
                            })}
                          </div>
                        </div>
                      </section>
                    ) : (
                      <div className="min-h-0" aria-hidden="true" />
                    )}

                    <section className="workspace-panel rounded-[30px] border border-border/70 px-4 py-4 shadow-sm">
                      <div className="mb-3 flex items-center justify-end gap-3">
                        {controllerState?.isStreaming ? (
                          <span className="rounded-full bg-success/12 px-2 py-0.5 text-[11px] font-medium text-success">
                            running
                          </span>
                        ) : null}
                      </div>

                      {controllerState?.errorText ? (
                        <div className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {controllerState.errorText}
                        </div>
                      ) : null}
                      {controllerState?.statusText ? (
                        <div className="mb-3 rounded-md bg-muted/55 px-3 py-2 text-xs text-muted-foreground">
                          {controllerState.statusText}
                        </div>
                      ) : null}

                      {controllerState ? (
                        <Composer
                          busy={controllerState.isStreaming}
                          value={controllerComposerValue}
                          onValueChange={setControllerComposerValue}
                          onSubmit={sendControllerPrompt}
                          onAbort={() => actions.abortPrompt(controllerState.sessionId)}
                          models={controllerState.availableModels}
                          currentModel={controllerState.model}
                          thinkingLevel={controllerState.thinkingLevel}
                          availableThinkingLevels={controllerState.availableThinkingLevels}
                          attachments={controllerState.attachments}
                          slashCommands={controllerState.slashCommands}
                          onSetModel={(provider, modelId) => void actions.setModel(provider, modelId, controllerState.sessionId)}
                          onSetThinkingLevel={(level) => void actions.setThinkingLevel(level, controllerState.sessionId)}
                          onPickAttachments={() => void actions.pickAttachments(controllerState.sessionId)}
                          onRemoveAttachment={(attachmentId) => void actions.removeAttachment(attachmentId, controllerState.sessionId)}
                          onClearAttachments={() => void actions.clearAttachments(controllerState.sessionId)}
                          agentMenuOpen={controllerAgentMenuOpen}
                          onAgentMenuOpenChange={setControllerAgentMenuOpen}
                          placeholder="Ask Pi to create a session, delegate work, or steer the canvas"
                        />
                      ) : (
                        <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                          Master session is loading…
                        </div>
                      )}
                    </section>
                  </div>

                  {hasSideUtilityPanel ? (
                    <div
                      role="separator"
                      aria-orientation="vertical"
                      aria-label="Resize utility panel"
                      tabIndex={0}
                      className="utility-panel-resizer absolute bottom-3 right-0 top-0 z-20 w-3 cursor-col-resize touch-none"
                      style={{ right: `${utilityPanelWidth - 4}px` }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        startUtilityPanelResize(event.clientX);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowLeft") {
                          event.preventDefault();
                          setUtilityPanelWidth((current) => clampUtilityPanelWidth(current + 16, selectedUtilityPanel));
                        }
                        if (event.key === "ArrowRight") {
                          event.preventDefault();
                          setUtilityPanelWidth((current) => clampUtilityPanelWidth(current - 16, selectedUtilityPanel));
                        }
                      }}
                    />
                  ) : null}

                  {selectedUtilityPanel === "browser" && selectedProjectKey ? (
                    <div className="relative min-h-0 min-w-0">
                      <BrowserPanel
                        className="h-full w-full rounded-[28px]"
                        threadKey={selectedProjectKey}
                        sessionFile={null}
                        initialUrl={browserUrl}
                        onUrlChange={(url) => {
                          setBrowserUrlByProject((current) => ({
                            ...current,
                            [selectedProjectKey]: url,
                          }));
                        }}
                      />
                    </div>
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
                      projectPath={activeProject?.path ?? null}
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
          ) : null}

          {activeMode === "tui" ? (
            <section className="relative flex min-h-0 min-w-0 flex-1" aria-label="TUI workspace">
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
                onChooseMasterSessionDirectory={() => void actions.chooseMasterSessionDirectory()}
                onSetMasterSessionDirectoryToHome={() => void actions.setMasterSessionDirectoryToHome()}
              />
            </section>
          ) : null}
        </div>
      </section>
    </main>
  );
}
