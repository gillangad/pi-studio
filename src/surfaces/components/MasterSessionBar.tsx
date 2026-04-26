import { ChevronDown, ChevronRight, LoaderCircle, Plus, Send, Square } from "lucide-react";
import { useMemo, useState } from "react";
import type { MasterState } from "../../shared/types";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

type MasterSessionBarProps = {
  master: MasterState;
  onSendPrompt: (text: string, sessionId?: string) => Promise<unknown> | unknown;
  onAbort: (sessionId?: string) => Promise<unknown> | unknown;
  onPickAttachments: (sessionId?: string) => Promise<unknown> | unknown;
  onOpenTarget: (projectId: string, sessionPath: string) => void;
};

export function MasterSessionBar({ master, onSendPrompt, onAbort, onPickAttachments, onOpenTarget }: MasterSessionBarProps) {
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);

  const latestAssistantText = useMemo(() => {
    for (let index = master.messages.length - 1; index >= 0; index -= 1) {
      const message = master.messages[index];
      if (message?.role === "assistant") {
        return message.content.join("\n");
      }
    }
    return null;
  }, [master.messages]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || master.isStreaming) return;
    void onSendPrompt(trimmed, "master");
    setValue("");
  };

  return (
    <section className="border-b border-border/50 bg-background/90 px-4 py-3 backdrop-blur sm:px-5">
      <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex min-w-0 items-center gap-2 text-left"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
            <span className="text-[15px] font-semibold">Master</span>
            <span className="truncate text-xs text-muted-foreground">
              {master.summary.totalTargets} sessions • {master.summary.activeTargets} active
            </span>
          </button>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {master.summary.errorTargets > 0 ? <span className="text-destructive">{master.summary.errorTargets} issues</span> : null}
            {master.isStreaming ? <LoaderCircle className="size-4 animate-spin" /> : null}
          </div>
        </div>

        <div className="flex items-end gap-3 rounded-[20px] border border-border/65 bg-card/92 px-3 py-2.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
            onClick={() => void onPickAttachments("master")}
            aria-label="Add attachment"
          >
            <Plus size={18} />
          </Button>

          <div className="min-w-0 flex-1">
            <Textarea
              value={value}
              rows={1}
              className="min-h-[42px] resize-none border-transparent bg-transparent px-0 py-1.5 text-[15px] shadow-none focus-visible:ring-0"
              placeholder="Ask Master Pi to steer the workspace"
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          {master.isStreaming ? (
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              onClick={() => void onAbort("master")}
              aria-label="Stop master session"
            >
              <Square size={16} className="fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 shrink-0 rounded-full"
              onClick={submit}
              disabled={!value.trim()}
              aria-label="Send to master session"
            >
              <Send size={16} />
            </Button>
          )}
        </div>

        {master.attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pl-11">
            {master.attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="inline-flex max-w-56 truncate rounded-full border border-border/65 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
              >
                {attachment.name}
              </span>
            ))}
          </div>
        ) : null}

        {latestAssistantText ? (
          <div className="pl-11 text-[14px] text-muted-foreground">
            <span className="line-clamp-2">{latestAssistantText}</span>
          </div>
        ) : null}

        {expanded ? (
          <div className="grid gap-2 pl-11 sm:grid-cols-2 xl:grid-cols-3">
            {master.targets.map((target) => (
              <button
                key={target.targetId}
                type="button"
                className="rounded-xl border border-border/60 bg-background/70 px-3 py-2.5 text-left transition-colors hover:bg-accent/10"
                onClick={() => {
                  if (target.projectId) {
                    onOpenTarget(target.projectId, target.sessionPath);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{target.name}</span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                      target.status === "running"
                        ? "bg-emerald-500/12 text-emerald-500"
                        : target.status === "error" || target.status === "timeout"
                          ? "bg-destructive/12 text-destructive"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {target.status}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {target.projectName} • {target.lastActivityLabel}
                </div>
                {target.latestResponse || target.latestPrompt ? (
                  <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                    {target.latestResponse ?? target.latestPrompt}
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
