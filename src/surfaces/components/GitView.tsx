import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { GitState, GitDiffBaseline } from "../../shared/types";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type GitViewProps = {
  git: GitState;
  onRefresh: () => Promise<unknown> | unknown;
  onSetBaseline: (baseline: GitDiffBaseline) => Promise<unknown> | unknown;
  onAddComment: (filePath: string, text: string) => Promise<unknown> | unknown;
  onRemoveComment: (commentId: string) => Promise<unknown> | unknown;
  compact?: boolean;
};

const BASELINE_OPTIONS: Array<{ id: GitDiffBaseline; label: string }> = [
  { id: "working", label: "Working tree" },
  { id: "head", label: "Against HEAD" },
  { id: "head~1", label: "HEAD~1…HEAD" },
];

export function GitView({ git, onRefresh, onSetBaseline, onAddComment, onRemoveComment, compact = false }: GitViewProps) {
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");

  const selectedFilePath = activeFilePath ?? git.changedFiles[0]?.path ?? null;
  const commentsForFile = useMemo(
    () => git.comments.filter((comment) => comment.filePath === selectedFilePath),
    [git.comments, selectedFilePath],
  );

  if (!git.projectId) {
    return (
      <section className="flex h-full min-h-0 w-full flex-col">
        <header className="px-4 py-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Git</p>
          <h2 className="mt-1 text-lg font-semibold">No project selected</h2>
        </header>
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="gap-2 border-b border-border/55 px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Git / diff</p>
            <h2 className="mt-1 text-lg font-semibold">{git.branch ? `Branch ${git.branch}` : "Repository"}</h2>
          </div>

          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none ring-ring/70 focus:ring-2"
              value={git.baseline}
              onChange={(event) => void onSetBaseline(event.target.value as GitDiffBaseline)}
            >
              {BASELINE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <Button type="button" variant="outline" onClick={() => void onRefresh()} className="gap-1.5">
              <RefreshCw size={14} />
              Refresh
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-4 py-3">
        {!git.isGitRepo ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            This project is not a Git repository.
          </div>
        ) : (
          <div className={compact ? "grid min-h-0 flex-1 grid-rows-[220px_minmax(0,1fr)] gap-3" : "grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] gap-3"}>
            <aside className="flex min-h-0 flex-col border-r border-border/55 pr-3">
              <div className="px-1 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Changed files
              </div>
              <div className="min-h-0 flex-1 space-y-1 overflow-auto p-2">
                {git.changedFiles.map((file) => (
                  <button
                    key={`${file.status}-${file.path}`}
                    type="button"
                    className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
                      file.path === selectedFilePath ? "bg-primary/15 text-foreground" : "hover:bg-accent/20"
                    }`}
                    onClick={() => setActiveFilePath(file.path)}
                  >
                    <Badge variant="outline" className="h-5 text-[10px]">
                      {file.status}
                    </Badge>
                    <span className="truncate">{file.path}</span>
                  </button>
                ))}
                {git.changedFiles.length === 0 ? <p className="px-2 text-xs text-muted-foreground">No changes.</p> : null}
              </div>
            </aside>

            <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3">
              <div className="overflow-hidden border border-border/45 bg-background/35">
                <pre className="h-full overflow-auto p-3 font-mono text-xs text-muted-foreground">
                  {git.diffText || "No diff for the selected baseline."}
                </pre>
              </div>

              <div className="border-t border-border/55 pt-3">
                <h3 className="text-sm font-semibold">
                  Diff comments{selectedFilePath ? <span className="text-muted-foreground"> · {selectedFilePath}</span> : ""}
                </h3>

                <div className="mt-2 max-h-40 space-y-2 overflow-auto pr-1">
                  {commentsForFile.map((comment) => (
                    <article key={comment.id} className="border-l border-border/60 pl-3">
                      <p className="text-sm text-foreground">{comment.text}</p>
                      <footer className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>{new Date(comment.createdAt).toLocaleString()}</span>
                        <button
                          type="button"
                          className="text-destructive transition-colors hover:text-destructive/80"
                          onClick={() => void onRemoveComment(comment.id)}
                        >
                          Remove
                        </button>
                      </footer>
                    </article>
                  ))}
                  {commentsForFile.length === 0 ? <p className="text-xs text-muted-foreground">No comments yet.</p> : null}
                </div>

                <div className="mt-3 grid gap-2">
                  <textarea
                    value={commentDraft}
                    rows={3}
                    placeholder="Add a comment for this file/hunk…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none ring-ring/70 focus:ring-2"
                    onChange={(event) => setCommentDraft(event.target.value)}
                  />
                  <Button
                    type="button"
                    disabled={!selectedFilePath || !commentDraft.trim()}
                    onClick={() => {
                      if (!selectedFilePath || !commentDraft.trim()) return;
                      void onAddComment(selectedFilePath, commentDraft.trim());
                      setCommentDraft("");
                    }}
                  >
                    Add comment
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {git.errorText ? (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {git.errorText}
          </div>
        ) : null}
        {git.loading ? (
          <div className="mt-2 inline-flex w-fit items-center gap-2 rounded-md border border-border/70 bg-background/70 px-2 py-1 text-xs text-muted-foreground">
            <RefreshCw size={12} className="animate-spin" />
            Refreshing git state…
          </div>
        ) : null}
      </div>
    </section>
  );
}
