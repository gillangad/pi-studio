import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UiMessage } from "../../shared/types";
import { cn } from "../lib/utils";

type MessageCardProps = {
  message: UiMessage;
};

function renderMarkdown(content: string[], className: string) {
  if (content.length === 0) return null;

  return (
    <div className={cn("markdown-content text-sm leading-relaxed", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.join("\n\n")}</ReactMarkdown>
    </div>
  );
}

export function MessageCard({ message }: MessageCardProps) {
  if (message.role === "user") {
    return (
      <article className="ml-auto w-full max-w-2xl rounded-[22px] bg-muted/70 px-4 py-3">
        {renderMarkdown(message.content, "text-foreground")}
      </article>
    );
  }

  if (message.role === "assistant") {
    const [thinkingExpanded, setThinkingExpanded] = useState(false);
    const thinkingPreview = useMemo(() => {
      const joined = (message.thinkingContent ?? []).join(" ").replace(/\s+/g, " ").trim();
      if (!joined) return "";
      return joined.length > 140 ? `${joined.slice(0, 140).trimEnd()}...` : joined;
    }, [message.thinkingContent]);

    return (
      <article className="w-full max-w-3xl space-y-2 px-1 py-0.5">
        {message.thinkingContent?.length ? (
          <button
            type="button"
            className="block space-y-1.5 px-0.5 py-1 text-left"
            onClick={() => setThinkingExpanded((current) => !current)}
            aria-expanded={thinkingExpanded}
            aria-label={thinkingExpanded ? "Collapse thinking" : "Expand thinking"}
          >
            {thinkingExpanded ? (
              renderMarkdown(message.thinkingContent, "italic text-muted-foreground")
            ) : (
              <p className="text-sm italic leading-relaxed text-muted-foreground">{thinkingPreview}</p>
            )}
          </button>
        ) : null}

        {renderMarkdown(message.content, "text-foreground")}
      </article>
    );
  }

  if (message.role === "toolResult") {
    return (
      <article
        className={cn(
          "w-full max-w-3xl rounded-xl border px-4 py-3",
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
      <article className="w-full max-w-3xl rounded-xl border border-border/70 bg-background/90 px-4 py-3 font-mono text-xs text-muted-foreground">
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
    <article className="w-full max-w-3xl rounded-xl border border-border/70 bg-card px-4 py-3">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {message.customType ?? message.role}
      </div>
      {renderMarkdown(message.content, "text-foreground")}
    </article>
  );
}
