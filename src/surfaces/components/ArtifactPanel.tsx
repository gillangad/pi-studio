import { Boxes, Code2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { SessionArtifact } from "../lib/artifacts";
import { buildArtifactDataUrl } from "../lib/artifacts";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";

type ArtifactPanelProps = {
  artifacts: SessionArtifact[];
  selectedArtifactId: string | null;
  onSelectArtifact: (artifactId: string) => void;
};

export function ArtifactPanel({ artifacts, selectedArtifactId, onSelectArtifact }: ArtifactPanelProps) {
  const [reloadKey, setReloadKey] = useState(0);
  const selectedArtifact =
    artifacts.find((artifact) => artifact.artifactId === selectedArtifactId) ?? artifacts[0] ?? null;

  const runtime = useMemo(
    () => (selectedArtifact ? buildArtifactDataUrl(selectedArtifact) : { dataUrl: null, errorText: null }),
    [selectedArtifact, reloadKey],
  );

  return (
    <aside
      className="flex min-h-0 min-w-0 flex-col overflow-hidden border-l border-border/55 bg-background/60"
      aria-label="Session artifacts surface"
    >
      <header className="space-y-3 border-b border-border/55 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Boxes size={16} className="text-foreground" />
              <h3 className="truncate text-sm font-semibold text-foreground">Artifacts</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Inline cards always open the latest revision in this session.
            </p>
          </div>
          <Badge variant="outline">{artifacts.length}</Badge>
        </div>

        {artifacts.length > 0 ? (
          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {artifacts.map((artifact) => {
              const isActive = artifact.artifactId === selectedArtifact?.artifactId;

              return (
                <button
                  key={artifact.artifactId}
                  type="button"
                  className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                    isActive
                      ? "border-primary/45 bg-primary/10"
                      : "border-border/65 bg-card/60 hover:bg-accent/20"
                  }`}
                  onClick={() => onSelectArtifact(artifact.artifactId)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-foreground">{artifact.title}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">v{artifact.revisionCount}</span>
                  </div>
                  {artifact.summary ? (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{artifact.summary}</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Code2 size={12} />
                      {artifact.kind === "react-tsx" ? "React + TSX" : "HTML"}
                    </span>
                    <span>latest</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        {selectedArtifact ? (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border/45 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-foreground">{selectedArtifact.title}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {selectedArtifact.kind === "react-tsx" ? "React + TSX artifact" : "HTML artifact"}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => setReloadKey((current) => current + 1)}
                  aria-label="Reload artifact"
                  title="Reload artifact"
                >
                  <RefreshCw size={14} />
                </Button>
              </div>
            </div>

            {runtime.errorText ? (
              <div className="m-3 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-3 text-sm text-destructive">
                {runtime.errorText}
              </div>
            ) : runtime.dataUrl ? (
              <webview
                key={`${selectedArtifact.artifactId}-${reloadKey}`}
                className="h-full w-full min-h-0 flex-1 bg-background"
                src={runtime.dataUrl}
              />
            ) : (
              <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
                Artifact preview is unavailable.
              </div>
            )}
          </>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <h4 className="text-sm font-semibold text-foreground">No artifacts yet</h4>
              <p className="mt-1 text-sm text-muted-foreground">
                When Pi emits a `pi-artifact` block, it will show up here and inline in the chat.
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
