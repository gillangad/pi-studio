import { X } from "lucide-react";
import type { RunSlashCommandResult } from "../../shared/ipc";
import type { GuiState, SessionTreeSnapshot, StudioSessionSummary } from "../../shared/types";
import { cn } from "../lib/utils";
import { ChatView } from "./ChatView";
import { Button } from "./ui/button";

type SessionCardProps = {
  summary: StudioSessionSummary;
  gui: GuiState;
  focused: boolean;
  onFocus: () => void;
  onClose: () => void;
  onSendPrompt: (text: string, sessionId?: string) => Promise<unknown> | unknown;
  onAbort: (sessionId?: string) => Promise<unknown> | unknown;
  onSetModel: (provider: string, modelId: string, sessionId?: string) => Promise<unknown> | unknown;
  onSetThinkingLevel: (level: string, sessionId?: string) => Promise<unknown> | unknown;
  onPickAttachments: (sessionId?: string) => Promise<unknown> | unknown;
  onRemoveAttachment: (attachmentId: string, sessionId?: string) => Promise<unknown> | unknown;
  onClearAttachments: (sessionId?: string) => Promise<unknown> | unknown;
  onGetSessionTree: (sessionId?: string) => Promise<SessionTreeSnapshot>;
  onNavigateTree: (
    targetId: string,
    options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
    sessionId?: string,
  ) => Promise<{ cancelled: boolean; aborted?: boolean; editorText?: string }>;
  onRunSlashCommand: (text: string, sessionId?: string) => Promise<RunSlashCommandResult>;
};

function statusLabel(summary: StudioSessionSummary) {
  if (summary.errorText) return "error";
  if (summary.isStreaming) return "running";
  return "idle";
}

export function SessionCard({
  summary,
  gui,
  focused,
  onFocus,
  onClose,
  onSendPrompt,
  onAbort,
  onSetModel,
  onSetThinkingLevel,
  onPickAttachments,
  onRemoveAttachment,
  onClearAttachments,
  onGetSessionTree,
  onNavigateTree,
  onRunSlashCommand,
}: SessionCardProps) {
  const status = statusLabel(summary);

  return (
    <article
      className={cn(
        "workspace-panel flex min-h-[460px] min-w-0 flex-col overflow-hidden rounded-[28px] border border-border/70 shadow-sm transition-all duration-150",
        focused && "ring-1 ring-primary/35 shadow-[0_18px_44px_rgba(0,0,0,0.16)]",
      )}
      aria-label={summary.sessionTitle}
    >
      <header className="flex items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
        <button
          type="button"
          className="min-w-0 flex-1 rounded-lg text-left"
          onClick={onFocus}
          aria-label={`Focus ${summary.sessionTitle}`}
        >
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-foreground">{summary.sessionTitle}</h3>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                status === "running" && "bg-success/12 text-success",
                status === "error" && "bg-destructive/12 text-destructive",
                status === "idle" && "bg-muted text-muted-foreground",
              )}
            >
              {status}
            </span>
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{summary.cwd ?? "No working directory"}</div>
          {summary.lastMessagePreview ? (
            <div className="mt-1 max-h-10 overflow-hidden text-xs text-muted-foreground">{summary.lastMessagePreview}</div>
          ) : null}
        </button>

        <div className="flex items-center gap-1">
          {focused ? (
            <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
              focused
            </span>
          ) : null}
          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 rounded-full" onClick={onClose} aria-label={`Close ${summary.sessionTitle}`}>
            <X size={14} />
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1" onClick={onFocus}>
        <ChatView
          gui={gui}
          sessionId={summary.sessionId}
          compact
          composerPlaceholder={`Message ${summary.sessionTitle}`}
          emptyTitle={summary.sessionTitle}
          emptyDescription="This worker has not received a prompt yet."
          onSendPrompt={onSendPrompt}
          onAbort={onAbort}
          onSetModel={onSetModel}
          onSetThinkingLevel={onSetThinkingLevel}
          onPickAttachments={onPickAttachments}
          onRemoveAttachment={onRemoveAttachment}
          onClearAttachments={onClearAttachments}
          onGetSessionTree={onGetSessionTree}
          onNavigateTree={onNavigateTree}
          onRunSlashCommand={onRunSlashCommand}
        />
      </div>
    </article>
  );
}
