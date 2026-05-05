import { Boxes, Code2 } from "lucide-react";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UiMessage } from "../../shared/types";
import type { SessionArtifact } from "../lib/artifacts";
import { cn } from "../lib/utils";

type MessageCardProps = {
  message: UiMessage;
  artifactById?: Record<string, SessionArtifact>;
  onOpenArtifact?: (artifactId: string) => void;
};

function renderMarkdown(content: string[], className: string) {
  if (content.length === 0) return null;

  return (
    <div className={cn("markdown-content text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.join("\n\n")}</ReactMarkdown>
    </div>
  );
}

function ArtifactInlineCards({
  message,
  artifactById,
  onOpenArtifact,
}: Pick<MessageCardProps, "message" | "artifactById" | "onOpenArtifact">) {
  if (!message.artifactRefs?.length || !artifactById || !onOpenArtifact) {
    return null;
  }

  return (
    <div className="space-y-2">
      {message.artifactRefs.map((reference) => {
        const artifact = artifactById[reference.artifactId];
        if (!artifact) {
          return null;
        }

        const updatedLater = artifact.updatedInMessageId !== message.id;

        return (
          <button
            key={`${message.id}-${reference.artifactId}`}
            type="button"
            className="w-full rounded-2xl border border-border/70 bg-card/70 px-4 py-3 text-left transition-colors hover:bg-accent/20"
            onClick={() => onOpenArtifact(reference.artifactId)}
            aria-label={`Open artifact ${artifact.title}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Boxes size={15} className="text-foreground" />
                  <span className="truncate text-sm font-semibold text-foreground">{artifact.title}</span>
                </div>
                {artifact.summary ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{artifact.summary}</p>
                ) : null}
              </div>
              <div className="shrink-0 text-[11px] text-muted-foreground">v{artifact.revisionCount}</div>
            </div>

            <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Code2 size={12} />
                {artifact.kind === "react-tsx" ? "React + TSX" : "HTML"}
              </span>
              <span>{updatedLater ? "Opens latest update" : "Latest"}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function MessageCard({ message, artifactById, onOpenArtifact }: MessageCardProps) {
  if (message.role === "user") {
    return (
      <article className="message-user-bubble ml-auto w-fit max-w-[680px] rounded-[18px] px-4 py-3">
        {renderMarkdown(message.content, "text-foreground")}
      </article>
    );
  }

  if (message.role === "assistant") {
    const [thinkingExpanded, setThinkingExpanded] = useState(false);

    return (
      <article className="w-full max-w-[760px] space-y-2 px-0.5 py-0.5">
        {message.thinkingContent?.length ? (
          <button
            type="button"
            className="block space-y-1 px-0.5 py-0.5 text-left"
            onClick={() => setThinkingExpanded((current) => !current)}
            aria-expanded={thinkingExpanded}
            aria-label={thinkingExpanded ? "Collapse thinking" : "Expand thinking"}
          >
            {thinkingExpanded ? (
              renderMarkdown(message.thinkingContent, "italic text-muted-foreground")
            ) : (
              <p className="text-[14px] italic leading-relaxed text-muted-foreground">Thinking</p>
            )}
          </button>
        ) : null}

        {renderMarkdown(message.content, "text-foreground")}
        <ArtifactInlineCards message={message} artifactById={artifactById} onOpenArtifact={onOpenArtifact} />
      </article>
    );
  }

  if (message.role === "toolResult") {
    return (
      <article
        className={cn(
          "w-full max-w-[760px] rounded-lg border px-4 py-3",
          message.isError
            ? "border-destructive/30 bg-destructive/10"
            : "border-border/70 bg-card",
        )}
      >
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Tool · {message.toolName}
        </div>
        {renderMarkdown(message.content, message.isError ? "text-destructive" : "text-foreground")}
      </article>
    );
  }

  if (message.role === "bashExecution") {
    return (
      <article className="w-full max-w-[760px] rounded-lg border border-border/70 bg-background/90 px-4 py-3 font-mono text-xs text-muted-foreground">
        <div className="mb-1 text-foreground">$ {message.command}</div>
        <div className="space-y-0.5">
          {(message.output ?? []).length > 0 ? (
            (message.output ?? []).map((line, index) => <p key={`${line.slice(0, 32)}-${index}`}>{line}</p>)
          ) : (
            <p>No output</p>
          )}
        </div>
        <div className="mt-1 text-[11px]">
          exit {message.exitCode ?? "?"}
          {message.cancelled ? " · cancelled" : ""}
          {message.truncated ? " · truncated" : ""}
        </div>
      </article>
    );
  }

  return (
    <article className="w-full max-w-[760px] rounded-lg border border-border/70 bg-card px-4 py-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {message.customType ?? message.role}
      </div>
      {renderMarkdown(message.content, "text-foreground")}
      <div className="mt-3">
        <ArtifactInlineCards message={message} artifactById={artifactById} onOpenArtifact={onOpenArtifact} />
      </div>
    </article>
  );
}
