import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  FolderOpen,
  Moon,
  NotebookPen,
  Search,
  Settings,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProjectRecord, ProjectThreadsMap, SessionSearchResult, StudioMode } from "../../shared/types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

type SidebarProps = {
  projects: ProjectRecord[];
  activeProjectId: string | null;
  threadsByProject: ProjectThreadsMap;
  activeSessionFile: string | null;
  activeMode: StudioMode;
  theme: "dark" | "light";
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onToggleTheme: () => void;
  onSetMode: (mode: StudioMode) => void;
  onAddProject: () => void;
  onSelectProject: (projectId: string) => void;
  onReorderProjects: (projectIds: string[]) => void;
  onRenameProject: (projectId: string, name: string) => void;
  onRemoveProject: (projectId: string) => void;
  onSearchSessions: (query: string) => Promise<SessionSearchResult[]> | SessionSearchResult[];
  onCreateThread: (projectId: string) => void;
  onOpenThread: (projectId: string, sessionFile: string) => void;
  onToggleThreadPinned: (projectId: string, sessionFile: string) => void;
  onToggleThreadArchived: (projectId: string, sessionFile: string) => void;
};

export function Sidebar({
  projects,
  activeProjectId,
  threadsByProject,
  activeSessionFile,
  activeMode,
  theme,
  collapsed,
  onToggleCollapsed,
  onToggleTheme,
  onSetMode,
  onAddProject,
  onSelectProject,
  onReorderProjects,
  onRenameProject,
  onRemoveProject,
  onSearchSessions,
  onCreateThread,
  onOpenThread,
  onToggleThreadPinned,
  onToggleThreadArchived,
}: SidebarProps) {
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Record<string, boolean>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SessionSearchResult[]>([]);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!activeProjectId) return;

    setCollapsedProjectIds((current) => {
      if (current[activeProjectId] === false) {
        return current;
      }

      return {
        ...current,
        [activeProjectId]: false,
      };
    });
  }, [activeProjectId]);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const normalizedQuery = searchQuery.trim();
    if (!normalizedQuery) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    const timeout = window.setTimeout(() => {
      Promise.resolve(onSearchSessions(normalizedQuery))
        .then((results) => {
          if (!cancelled) {
            setSearchResults(results);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearching(false);
          }
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [onSearchSessions, searchQuery]);

  const visibleProjects = projects;

  const reorder = (targetProjectId: string) => {
    if (!draggingProjectId || draggingProjectId === targetProjectId) return;

    const currentOrder = projects.map((project) => project.id);
    const sourceIndex = currentOrder.indexOf(draggingProjectId);
    const targetIndex = currentOrder.indexOf(targetProjectId);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, moved);
    onReorderProjects(nextOrder);
    setDraggingProjectId(null);
  };

  const modeSelection = activeMode === "tui" ? "tui" : "gui";
  const pinnedThreads = useMemo(
    () =>
      projects.flatMap((project) =>
        (threadsByProject[project.id] ?? [])
          .filter((thread) => thread.isPinned)
          .slice(0, 1)
          .map((thread) => ({ project, thread })),
      ),
    [projects, threadsByProject],
  );

  const openProjectLatestThread = (project: ProjectRecord) => {
    const threads = threadsByProject[project.id] ?? [];
    const latestThread = threads[0] ?? null;

    setSettingsMenuOpen(false);
    setCollapsedProjectIds((current) => ({
      ...current,
      [project.id]: false,
    }));

    if (latestThread) {
      onOpenThread(project.id, latestThread.sessionFile);
      return;
    }

    onCreateThread(project.id);
  };

  const handleNewChat = () => {
    const project =
      projects.find((entry) => entry.id === activeProjectId) ??
      projects[0] ??
      null;

    if (!project) return;
    onCreateThread(project.id);
  };

  return (
    <aside
      className={cn(
        "shell-sidebar-dark relative flex h-full w-full shrink-0 flex-col border-r border-border/70 transition-all duration-200",
      )}
      aria-label="Workspace sidebar"
    >
      <header className="flex items-center px-3 py-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => {
            setSettingsMenuOpen(false);
            onToggleCollapsed();
          }}
          className="h-7 w-7 text-muted-foreground"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </Button>
      </header>

      {collapsed ? (
        <section className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-2 pb-2">
          <div className="grid w-full gap-2" aria-label="Projects">
            {projects.map((project) => {
              const isActive = project.id === activeProjectId;
              const initial = project.name.trim().charAt(0).toUpperCase() || "P";

              return (
                <Button
                  key={project.id}
                  type="button"
                  variant={isActive ? "secondary" : "ghost"}
                  className={cn("h-10 w-full rounded-md text-sm font-semibold", isActive && "ring-1 ring-primary/50")}
                  onClick={() => openProjectLatestThread(project)}
                  title={project.name}
                  aria-label={project.name}
                >
                  {initial}
                </Button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="flex min-h-0 flex-1 flex-col px-3 pb-3">
          <div className="space-y-0 pb-2">
            <Button
              variant="ghost"
              className="h-9 w-full justify-start gap-3 rounded-lg px-3 text-[14px] font-medium text-foreground"
              onClick={handleNewChat}
            >
              <NotebookPen size={16} />
              <span>New chat</span>
            </Button>
            <button
              type="button"
              className="flex h-9 w-full items-center gap-3 rounded-lg px-3 text-left text-[14px] font-medium text-foreground transition-colors hover:bg-accent/20"
              onClick={() => setSearchOpen((current) => !current || !searchQuery)}
              aria-expanded={searchOpen || searchQuery.length > 0}
            >
              <Search size={16} className="text-foreground" />
              <span>Search</span>
            </button>

            {searchOpen || searchQuery.length > 0 ? (
              <div className="space-y-2 px-1 pt-1">
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search sessions"
                  className="h-9 w-full rounded-lg border border-input bg-background/70 px-3 text-sm text-foreground outline-none ring-ring/70 focus:ring-2"
                  aria-label="Search sessions"
                />

                <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {searching ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Searching...</div>
                  ) : null}

                  {!searching && searchQuery.trim().length > 0
                    ? searchResults.map((result) => (
                        <button
                          key={`${result.projectId}-${result.sessionFile}`}
                          type="button"
                          className="w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/20"
                          onClick={() => {
                            onOpenThread(result.projectId, result.sessionFile);
                            setCollapsedProjectIds((current) => ({
                              ...current,
                              [result.projectId]: false,
                            }));
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[13px] font-medium text-foreground">{result.threadTitle}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{result.ageLabel}</span>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">{result.projectName}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{result.excerpt}</div>
                        </button>
                      ))
                    : null}

                  {!searching && searchQuery.trim().length > 0 && searchResults.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">No session matches yet.</div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {pinnedThreads.length > 0 ? (
            <div className="pb-2">
              <div className="px-2 pb-1 text-[12px] font-medium text-muted-foreground">Pinned</div>
              <div className="space-y-0.5">
                {pinnedThreads.map(({ project, thread }) => (
                  <button
                    key={`${project.id}-${thread.id}`}
                    type="button"
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-accent/20"
                    aria-label={`Pinned thread ${thread.title} in ${project.name}`}
                    onClick={() => {
                      setSettingsMenuOpen(false);
                      onOpenThread(project.id, thread.sessionFile);
                    }}
                  >
                    <span className="truncate text-[14px] text-foreground">{thread.title}</span>
                    <span className="text-[13px] text-muted-foreground">{thread.ageLabel}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-1">
            <div className="flex items-center justify-between px-2 pb-0.5">
              <span className="text-[12px] font-medium text-muted-foreground">Projects</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onAddProject}
                aria-label="Add project"
                className="h-7 w-7 text-muted-foreground"
              >
                <FolderPlus size={14} />
              </Button>
            </div>

            {visibleProjects.map((project) => {
              const threads = threadsByProject[project.id] ?? [];
              const isActiveProject = project.id === activeProjectId;
              const isCollapsed = collapsedProjectIds[project.id] ?? !isActiveProject;

              return (
                <div
                  key={project.id}
                  className="space-y-0"
                  draggable
                  onDragStart={() => setDraggingProjectId(project.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => reorder(project.id)}
                  onDragEnd={() => setDraggingProjectId(null)}
                >
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-lg px-2 py-0.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0 text-muted-foreground"
                        onClick={() => {
                          setCollapsedProjectIds((current) => ({
                            ...current,
                            [project.id]: !isCollapsed,
                          }));
                        }}
                        aria-label={isCollapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
                        aria-expanded={!isCollapsed}
                        aria-controls={`sidebar-project-threads-${project.id}`}
                      >
                        {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      </Button>
                      <FolderOpen size={15} className={cn("shrink-0 text-muted-foreground", isActiveProject && "text-foreground")} />

                      {editingProjectId === project.id ? (
                        <input
                          value={projectNameDraft}
                          className="h-7 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none ring-ring/70 focus:ring-2"
                          onChange={(event) => setProjectNameDraft(event.target.value)}
                          onBlur={() => {
                            setEditingProjectId(null);
                            setProjectNameDraft("");
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              const nextName = projectNameDraft.trim();
                              if (nextName) {
                                onRenameProject(project.id, nextName);
                              }
                              setEditingProjectId(null);
                              setProjectNameDraft("");
                            }

                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingProjectId(null);
                              setProjectNameDraft("");
                            }
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className={cn(
                            "min-w-0 truncate rounded-md py-0.5 text-left text-[14px] leading-5 transition-colors",
                            isActiveProject ? "font-medium text-foreground" : "text-foreground/92",
                          )}
                          aria-current={isActiveProject ? "page" : undefined}
                          onClick={() => {
                            openProjectLatestThread(project);
                          }}
                          onDoubleClick={() => {
                            setEditingProjectId(project.id);
                            setProjectNameDraft(project.name);
                          }}
                        >
                          {project.name}
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          onCreateThread(project.id);
                        }}
                        aria-label={`Create thread in ${project.name}`}
                      >
                        <NotebookPen size={14} />
                      </Button>
                    </div>
                  </div>

                  {!isCollapsed ? (
                    <div id={`sidebar-project-threads-${project.id}`} className="space-y-0 pl-8" aria-label={`Threads in ${project.name}`}>
                      {threads.map((thread) => {
                        const isActiveThread = project.id === activeProjectId && thread.sessionFile === activeSessionFile;

                        return (
                          <div key={thread.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <button
                              type="button"
                              className={cn(
                                "min-w-0 truncate rounded-lg px-3 py-1 text-left text-[14px] leading-5 transition-colors",
                                isActiveThread
                                  ? "bg-white/8 text-foreground"
                                  : "text-foreground/90 hover:bg-accent/20",
                              )}
                              aria-label={`Thread ${thread.title} in ${project.name}`}
                              aria-current={isActiveThread ? "page" : undefined}
                              onClick={() => {
                                setSettingsMenuOpen(false);
                                onOpenThread(project.id, thread.sessionFile);
                              }}
                            >
                              {thread.title}
                            </button>
                            <span className="pr-1 text-[13px] leading-5 text-muted-foreground">{thread.ageLabel}</span>
                          </div>
                        );
                      })}
                      {threads.length === 0 ? (
                        <div className="rounded-md px-3 py-0.5 text-xs text-muted-foreground">No saved threads yet.</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}

          </div>
        </section>
      )}

      <Separator className="bg-border/50" />

      <div className="relative space-y-2 p-3">
        <div className="grid grid-cols-2 gap-1 rounded-[16px] border border-border/60 bg-background/50 p-1" role="tablist" aria-label="Session mode">
          <button
            type="button"
            role="tab"
            aria-selected={modeSelection === "gui"}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              modeSelection === "gui" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onSetMode("gui")}
            title="GUI mode"
          >
            GUI
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modeSelection === "tui"}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              modeSelection === "tui" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            onClick={() => onSetMode("tui")}
            title="TUI mode"
          >
            TUI
          </button>
        </div>

        <Button
          type="button"
          variant="ghost"
          className="w-full justify-between rounded-xl px-3 py-2 text-[15px]"
          onClick={() => setSettingsMenuOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={settingsMenuOpen}
          title="Settings"
        >
          <span className="inline-flex items-center gap-2">
            <Settings size={14} />
            <span>Settings</span>
          </span>
          <ChevronRight size={12} className={cn("transition-transform", settingsMenuOpen && "rotate-90")} />
        </Button>

        {settingsMenuOpen ? (
          <div className="absolute bottom-[calc(100%+8px)] left-3 right-3 z-20 rounded-lg border border-border/70 bg-popover p-2 shadow-glass" role="menu" aria-label="Sidebar settings menu">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent/20"
              onClick={() => {
                onToggleTheme();
                setSettingsMenuOpen(false);
              }}
            >
              <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
              {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
            </button>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
