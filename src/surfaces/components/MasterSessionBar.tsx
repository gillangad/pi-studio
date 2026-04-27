import { LoaderCircle, Plus, Send, Square, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { MasterState, UiMessage } from "../../shared/types";
import { cn } from "../lib/utils";
import { MessageCard } from "./MessageCard";
import { ToolCallsCard } from "./ToolCallsCard";
import { WorkTraceCard } from "./WorkTraceCard";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

type MasterSessionBarProps = {
  master: MasterState;
  onClose: () => void;
  onSendPrompt: (text: string, sessionId?: string) => Promise<unknown> | unknown;
  onAbort: (sessionId?: string) => Promise<unknown> | unknown;
  onPickAttachments: (sessionId?: string) => Promise<unknown> | unknown;
  onOpenTarget: (projectId: string, sessionPath: string) => void;
};

export function MasterSessionBar({
  master,
  onClose,
  onSendPrompt,
  onAbort,
  onPickAttachments,
  onOpenTarget,
}: MasterSessionBarProps) {
  const [value, setValue] = useState("");
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

  const timelineItems = useMemo(() => {
    type ToolCallMessage = UiMessage & { role: "toolResult" | "bashExecution" };

    const items: Array<
      | { id: string; kind: "message"; message: UiMessage }
      | { id: string; kind: "tool-group"; messages: ToolCallMessage[] }
      | { id: string; kind: "work-trace"; messages: UiMessage[]; endTimestamp?: string | number }
    > = [];

    const pushRawSegment = (segment: UiMessage[]) => {
      let toolBuffer: ToolCallMessage[] = [];

      const flushToolBuffer = () => {
        if (toolBuffer.length === 0) return;
        items.push({
          id: `tool-group-${toolBuffer[0]?.id ?? Math.random().toString(36).slice(2)}`,
          kind: "tool-group",
          messages: toolBuffer,
        });
        toolBuffer = [];
      };

      for (const message of segment) {
        if (message.role === "toolResult" || message.role === "bashExecution") {
          toolBuffer.push(message as ToolCallMessage);
          continue;
        }

        flushToolBuffer();
        items.push({ id: message.id, kind: "message", message });
      }

      flushToolBuffer();
    };

    let index = 0;
    while (index < master.messages.length) {
      const message = master.messages[index];
      if (!message) break;

      if (message.role === "user") {
        items.push({ id: message.id, kind: "message", message });
        index += 1;
        continue;
      }

      const segmentStart = index;
      while (index < master.messages.length && master.messages[index]?.role !== "user") {
        index += 1;
      }

      const segment = master.messages.slice(segmentStart, index);
      const isOpenStreamingSegment = master.isStreaming && index === master.messages.length;

      if (isOpenStreamingSegment) {
        pushRawSegment(segment);
        continue;
      }

      const assistantIndexes = segment
        .map((entry, entryIndex) => (entry.role === "assistant" ? entryIndex : -1))
        .filter((entryIndex) => entryIndex >= 0);
      const finalAssistantIndex = assistantIndexes.at(-1) ?? -1;

      if (finalAssistantIndex > 0) {
        const traceMessages = segment.slice(0, finalAssistantIndex);
        const finalAssistant = segment[finalAssistantIndex];
        const trailingMessages = segment.slice(finalAssistantIndex + 1);

        if (traceMessages.length > 0) {
          items.push({
            id: `work-trace-${traceMessages[0]?.id ?? finalAssistant.id}`,
            kind: "work-trace",
            messages: traceMessages,
            endTimestamp: finalAssistant.timestamp,
          });
        }

        items.push({ id: finalAssistant.id, kind: "message", message: finalAssistant });
        pushRawSegment(trailingMessages);
        continue;
      }

      pushRawSegment(segment);
    }

    return items;
  }, [master.isStreaming, master.messages]);

  return (
    <section className="workspace-panel absolute right-3 top-0 z-30 flex w-[min(420px,calc(100vw-7rem))] flex-col gap-3 rounded-2xl border border-border/70 bg-card/96 p-3 shadow-glass backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[14px] font-semibold text-foreground">Master</h3>
            <span className="truncate text-[12px] text-muted-foreground">
              {master.summary.totalTargets} linked
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{master.summary.activeTargets} active</span>
            {master.summary.errorTargets > 0 ? (
              <span className="text-destructive">{master.summary.errorTargets} issues</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1">
          {master.isStreaming ? <LoaderCircle className="size-4 animate-spin text-muted-foreground" /> : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground"
            aria-label="Close master session"
            onClick={onClose}
          >
            <X size={15} />
          </Button>
        </div>
      </div>

      {master.targets.length > 0 ? (
        <div className="text-[12px] text-muted-foreground">
          <span className="line-clamp-2">
            {master.targets
              .slice(0, 4)
              .map((target) => `${target.name} (${target.status})`)
              .join(" • ")}
          </span>
        </div>
      ) : null}

      <div className="max-h-72 min-h-0 overflow-y-auto">
        <div className="flex flex-col gap-2 pr-1">
          {timelineItems.length > 0 ? (
            timelineItems.map((item) => (
              <div key={item.id} className="flex w-full min-w-0">
                {item.kind === "message" ? <MessageCard message={item.message} /> : null}
                {item.kind === "tool-group" ? (
                  <ToolCallsCard messages={item.messages} initialExpanded={false} />
                ) : null}
                {item.kind === "work-trace" ? (
                  <WorkTraceCard messages={item.messages} endTimestamp={item.endTimestamp} />
                ) : null}
              </div>
            ))
          ) : latestAssistantText ? (
            <article className="w-full max-w-[760px] space-y-2 px-0.5 py-0.5 text-[14px] text-muted-foreground">
              <span className="line-clamp-4">{latestAssistantText}</span>
            </article>
          ) : (
            <div className="px-1 py-2 text-[13px] text-muted-foreground">No master messages yet.</div>
          )}
        </div>
      </div>

      {master.attachments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {master.attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex max-w-48 truncate rounded-full border border-border/65 bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground"
            >
              {attachment.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative rounded-[20px] border border-border/65 bg-background/55 px-3 py-2.5">
        <div className="flex items-end gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground"
            onClick={() => void onPickAttachments("master")}
            aria-label="Add attachment"
          >
            <Plus size={17} />
          </Button>

          <div className="min-w-0 flex-1">
            <Textarea
              value={value}
              rows={1}
              className="min-h-[42px] resize-none border-transparent bg-transparent px-0 py-1.5 text-[14px] shadow-none focus-visible:ring-0"
              placeholder="Ask Master Pi"
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

          {master.isStreaming ? (
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={() => void onAbort("master")}
              aria-label="Stop master session"
            >
              <Square size={15} className="fill-current" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-full"
              onClick={submit}
              disabled={!value.trim()}
              aria-label="Send to master session"
            >
              <Send size={15} />
            </Button>
          )}
        </div>

        {slashSuggestions.length > 0 ? (
          <div
            className="absolute inset-x-3 bottom-[calc(100%-0.35rem)] z-20 overflow-hidden rounded-xl border border-border/70 bg-popover/98 shadow-glass"
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
      </div>
    </section>
  );
}
