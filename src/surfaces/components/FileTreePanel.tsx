import { ChevronDown, ChevronRight, File, FolderClosed, FolderOpen, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { FileTreeNode } from "../../shared/types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

type FileTreePanelProps = {
  projectName: string;
  projectPath: string | null;
  nodes: FileTreeNode[];
  loading: boolean;
  errorText: string | null;
  onRefresh: () => void;
};

type TreeNodeProps = {
  node: FileTreeNode;
  level: number;
};

function TreeNode({ node, level }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(level < 2);
  const hasChildren = node.kind === "directory" && (node.children?.length ?? 0) > 0;

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-accent/20"
        style={{ paddingLeft: `${0.5 + level * 0.8}rem` }}
        onClick={() => {
          if (node.kind === "directory") {
            setExpanded((current) => !current);
          }
        }}
      >
        {node.kind === "directory" ? (
          hasChildren ? (
            expanded ? <ChevronDown size={14} className="shrink-0 text-muted-foreground" /> : <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
          ) : (
            <span className="w-[14px] shrink-0" />
          )
        ) : (
          <span className="w-[14px] shrink-0" />
        )}

        {node.kind === "directory" ? (
          expanded ? <FolderOpen size={15} className="shrink-0 text-muted-foreground" /> : <FolderClosed size={15} className="shrink-0 text-muted-foreground" />
        ) : (
          <File size={14} className="shrink-0 text-muted-foreground" />
        )}

        <span className="truncate">{node.name}</span>
      </button>

      {node.kind === "directory" && expanded ? (
        <div className="space-y-0.5">
          {(node.children ?? []).map((child) => (
            <TreeNode key={child.path} node={child} level={level + 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function FileTreePanel({ projectName, projectPath, nodes, loading, errorText, onRefresh }: FileTreePanelProps) {
  const fileCount = useMemo(() => {
    const walk = (items: FileTreeNode[]): number =>
      items.reduce((count, node) => count + (node.kind === "file" ? 1 : walk(node.children ?? [])), 0);

    return walk(nodes);
  }, [nodes]);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-border/55 bg-background/60">
      <header className="flex items-start justify-between gap-3 border-b border-border/55 px-3 py-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Files</p>
          <h3 className="truncate text-sm font-semibold text-foreground">{projectName}</h3>
          <p className="truncate text-xs text-muted-foreground">
            {loading ? "Refreshing tree..." : `${fileCount} files indexed`}
          </p>
          {projectPath ? <p className="mt-1 truncate text-[11px] text-muted-foreground/80">{projectPath}</p> : null}
        </div>

        <Button type="button" size="icon" variant="ghost" onClick={onRefresh} aria-label="Refresh files">
          <RefreshCw size={14} className={cn(loading && "animate-spin")} />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-2">
        {errorText ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorText}
          </div>
        ) : null}

        {!errorText && nodes.length === 0 && !loading ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            No files to show yet.
          </div>
        ) : null}

        <div className="space-y-0.5">
          {nodes.map((node) => (
            <TreeNode key={node.path} node={node} level={0} />
          ))}
        </div>
      </div>
    </aside>
  );
}
