import { useEffect, useMemo, useRef, useState } from "react";
import type { NavigateTreeOptions, NavigateTreeResult, SessionTreeFilterMode, SessionTreeNode } from "../../shared/types";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

type SessionTreeDialogProps = {
  open: boolean;
  loading: boolean;
  errorText: string | null;
  nodes: SessionTreeNode[];
  leafId: string | null;
  onClose: () => void;
  onApplyEditorText: (text: string) => void;
  onNavigate: (targetId: string, options?: NavigateTreeOptions) => Promise<NavigateTreeResult>;
};

type FlatNode = {
  node: SessionTreeNode;
  depth: number;
  isLastFlags: boolean[];
};

function filterTree(nodes: SessionTreeNode[], filterMode: SessionTreeFilterMode): SessionTreeNode[] {
  const matches = (node: SessionTreeNode) => {
    if (filterMode === "all") return true;
    if (filterMode === "user-only") {
      return node.role === "user";
    }

    return node.role === "user" || node.role === "assistant";
  };

  const visit = (node: SessionTreeNode): SessionTreeNode[] => {
    const children = node.children.flatMap(visit);
    if (matches(node)) {
      return [
        {
          ...node,
          children,
        },
      ];
    }

    return children;
  };

  return nodes.flatMap(visit);
}

function flattenTree(nodes: SessionTreeNode[], trail: boolean[] = []): FlatNode[] {
  const output: FlatNode[] = [];

  nodes.forEach((node, index) => {
    const isLast = index === nodes.length - 1;
    const flags = [...trail, isLast];
    output.push({
      node,
      depth: trail.length,
      isLastFlags: flags,
    });
    output.push(...flattenTree(node.children, flags));
  });

  return output;
}

function buildPrefix(flatNode: FlatNode) {
  if (flatNode.depth === 0) return "";

  return flatNode.isLastFlags
    .slice(0, -1)
    .map((isLast) => (isLast ? "   " : "│  "))
    .join("") +
    (flatNode.isLastFlags.at(-1) ? "└─ " : "├─ ");
}

function formatTimestamp(value: string) {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return "";
  return new Date(parsed).toLocaleString();
}

export function SessionTreeDialog({
  open,
  loading,
  errorText,
  nodes,
  leafId,
  onClose,
  onApplyEditorText,
  onNavigate,
}: SessionTreeDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [filterMode, setFilterMode] = useState<SessionTreeFilterMode>("default");
  const [selectedId, setSelectedId] = useState<string | null>(leafId);
  const [stage, setStage] = useState<"tree" | "summary" | "custom">("tree");
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [customInstructions, setCustomInstructions] = useState("");
  const [working, setWorking] = useState(false);

  const filteredNodes = useMemo(() => filterTree(nodes, filterMode), [filterMode, nodes]);
  const flatNodes = useMemo(() => flattenTree(filteredNodes), [filteredNodes]);

  useEffect(() => {
    if (!open) return;
    setFilterMode("default");
    setStage("tree");
    setPendingTargetId(null);
    setCustomInstructions("");
    setSelectedId(leafId);
  }, [leafId, open]);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
  }, [open, stage, loading]);

  useEffect(() => {
    if (!open || flatNodes.length === 0) return;
    if (selectedId && flatNodes.some((entry) => entry.node.id === selectedId)) {
      return;
    }

    setSelectedId(flatNodes[0]?.node.id ?? null);
  }, [flatNodes, open, selectedId]);

  const selectedIndex = flatNodes.findIndex((entry) => entry.node.id === selectedId);
  const selectedNode = selectedIndex >= 0 ? flatNodes[selectedIndex]?.node : undefined;

  if (!open) return null;

  const moveSelection = (direction: 1 | -1) => {
    if (flatNodes.length === 0) return;
    const currentIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const nextIndex = (currentIndex + direction + flatNodes.length) % flatNodes.length;
    setSelectedId(flatNodes[nextIndex]?.node.id ?? null);
  };

  const executeNavigation = async (targetId: string, options?: NavigateTreeOptions) => {
    setWorking(true);
    try {
      const result = await onNavigate(targetId, options);
      if (result.aborted) {
        setStage("tree");
        return;
      }

      if (!result.cancelled && result.editorText) {
        onApplyEditorText(result.editorText);
      }

      onClose();
    } finally {
      setWorking(false);
    }
  };

  const beginSelection = (targetId: string) => {
    if (targetId === leafId) {
      onClose();
      return;
    }

    setPendingTargetId(targetId);
    setStage("summary");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6">
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[78vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-glass outline-none"
        onKeyDown={(event) => {
          if (stage === "tree") {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              moveSelection(-1);
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveSelection(1);
            }
            if (event.key === "Enter" && selectedNode) {
              event.preventDefault();
              beginSelection(selectedNode.id);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "u") {
              event.preventDefault();
              setFilterMode((current) => (current === "user-only" ? "default" : "user-only"));
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "o") {
              event.preventDefault();
              setFilterMode((current) => (current === "all" ? "default" : "all"));
            }
          } else if (stage === "summary") {
            if (event.key === "Escape") {
              event.preventDefault();
              setStage("tree");
            }
          } else if (stage === "custom" && event.key === "Escape") {
            event.preventDefault();
            setStage("summary");
          }
        }}
      >
        <div className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold">/tree</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Navigate the session tree in-place and optionally summarize the branch you leave behind.
              </p>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <div>Up/Down navigate</div>
              <div>Enter select</div>
              <div>Ctrl+U user only</div>
              <div>Ctrl+O show all</div>
              <div>Esc cancel</div>
            </div>
          </div>
        </div>

        {stage === "tree" ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            {loading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading session tree…</div>
            ) : errorText ? (
              <div className="py-12 text-center text-sm text-destructive">{errorText}</div>
            ) : flatNodes.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">No entries in session.</div>
            ) : (
              <div className="space-y-1 font-mono text-sm">
                {flatNodes.map((flatNode) => {
                  const isSelected = flatNode.node.id === selectedId;
                  const isActive = flatNode.node.id === leafId;
                  const prefix = buildPrefix(flatNode);
                  return (
                    <button
                      key={flatNode.node.id}
                      type="button"
                      className={[
                        "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left transition-colors",
                        isSelected ? "bg-accent/20 text-foreground" : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                      ].join(" ")}
                      onClick={() => setSelectedId(flatNode.node.id)}
                      onDoubleClick={() => beginSelection(flatNode.node.id)}
                      aria-label={`${flatNode.node.preview}${isActive ? " active" : ""}`}
                    >
                      <span className="shrink-0 text-muted-foreground">{prefix}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {flatNode.node.role ? `${flatNode.node.role}: ` : ""}
                        {flatNode.node.preview}
                        {flatNode.node.label ? (
                          <span className="ml-2 text-xs text-muted-foreground">[{flatNode.node.label}]</span>
                        ) : null}
                      </span>
                      {isActive ? <span className="shrink-0 text-xs text-foreground">← active</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}

        {stage === "summary" ? (
          <div className="space-y-3 px-5 py-5">
            <div>
              <h3 className="text-sm font-semibold">Summarize branch?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Switching branches can optionally create a summary of the abandoned path.
              </p>
            </div>
            <div className="grid gap-2">
              <Button
                type="button"
                variant="secondary"
                disabled={!pendingTargetId || working}
                onClick={() => {
                  if (!pendingTargetId) return;
                  void executeNavigation(pendingTargetId, { summarize: false });
                }}
              >
                No summary
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!pendingTargetId || working}
                onClick={() => {
                  if (!pendingTargetId) return;
                  void executeNavigation(pendingTargetId, { summarize: true });
                }}
              >
                Summarize
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={!pendingTargetId || working}
                onClick={() => setStage("custom")}
              >
                Summarize with custom prompt
              </Button>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="ghost" disabled={working} onClick={() => setStage("tree")}>
                Back
              </Button>
            </div>
          </div>
        ) : null}

        {stage === "custom" ? (
          <div className="space-y-3 px-5 py-5">
            <div>
              <h3 className="text-sm font-semibold">Custom summarization instructions</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                These instructions will be appended to the default branch summary prompt.
              </p>
            </div>
            <Textarea
              value={customInstructions}
              rows={5}
              className="min-h-[140px]"
              placeholder="Focus on the important decisions, dead ends, and files changed."
              onChange={(event) => setCustomInstructions(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={working} onClick={() => setStage("summary")}>
                Back
              </Button>
              <Button
                type="button"
                disabled={!pendingTargetId || working}
                onClick={() => {
                  if (!pendingTargetId) return;
                  void executeNavigation(pendingTargetId, {
                    summarize: true,
                    customInstructions: customInstructions.trim() || undefined,
                  });
                }}
              >
                Continue
              </Button>
            </div>
          </div>
        ) : null}

        <div className="border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          {selectedNode ? (
            <div className="flex items-center justify-between gap-4">
              <span className="truncate">{selectedNode.preview}</span>
              <span className="shrink-0">{formatTimestamp(selectedNode.timestamp)}</span>
            </div>
          ) : (
            <div>Select a point in the session to continue from there.</div>
          )}
        </div>
      </div>
    </div>
  );
}
