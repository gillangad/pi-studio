import { ChevronDown, ChevronRight, LoaderCircle, Plus, Send, Square } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
  const [slashIndex, setSlashIndex] = useState(0);

  const latestAssistantText = useMemo(() => {
    for (let index = master.messages.length - 1; index >= 0; index -= 1) {
      const message = master.messages[index];
      if (message?.role === "assistant") {
        return message.content.join("\n");
      }
    }
    return null;
  }, [master.messages]);

  const slashQuery = value.trimStart();
  const slashToken = slashQuery.match(/^\/\S*/)?.[0].toLowerCase() ?? "";
  const slashSuggestions = useMemo(() => {
    if (!slashQuery.startsWith("/")) return [];
    if (slashToken.length <= 1) return master.slashCommands;
    return master.slashCommands.filter((entry) => entry.command.startsWith(slashToken));
  }, [master.slashCommands, slashQuery, slashToken]);

  useEffect(() => {
    setSlashIndex(0);
  }, [slashQuery]);

  const applySlashSuggestion = (command: string) => {
    const trailing = slashQuery.slice(slashToken.length);
    setValue(`${command}${trailing}`);
  };

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

        <div className="relative flex items-end gap-3 rounded-[20px] border border-border/65 bg-card/92 px-3 py-2.5">
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
                if (slashSuggestions.length > 0 && event.key === "ArrowDown") {
                  event.preventDefault();
                  setSlashIndex((current) => (current + 1) % slashSuggestions.length);
                  return;
                }

                if (slashSuggestions.length > 0 && event.key === "ArrowUp") {
                  event.preventDefault();
                  setSlashIndex((current) => (current - 1 + slashSuggestions.length) % slashSuggestions.length);
                  return;
                }

                if (event.key === "Enter" && !event.shiftKey) {
                  if (slashSuggestions.length > 0) {
                    const selectedCommand = slashSuggestions[slashIndex]?.command ?? slashSuggestions[0]?.command;
                    if (selectedCommand && slashToken !== selectedCommand) {
                      event.preventDefault();
                      applySlashSuggestion(selectedCommand);
                      return;
                    }
                  }

                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          {slashSuggestions.length > 0 ? (
            <div
              className="absolute left-12 right-14 top-[calc(100%-0.5rem)] z-20 overflow-hidden rounded-xl border border-border/70 bg-popover/98 shadow-glass"
              role="listbox"
              aria-label="Master slash commands"
            >
              {slashSuggestions.map((entry, index) => {
                const active = index === slashIndex;
                return (
                  <button
                    key={entry.command}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 px-4 py-2.5 text-left",
                      active
                        ? "bg-accent/20 text-foreground"
                        : "text-muted-foreground hover:bg-accent/10 hover:text-foreground",
                    )}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySlashSuggestion(entry.command);
                    }}
                  >
                    <span className="font-mono text-sm">{entry.command}</span>
                    <span className="text-xs">{entry.description}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

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
