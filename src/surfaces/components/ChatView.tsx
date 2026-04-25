import { useEffect, useMemo, useRef, useState } from "react";
import type { GuiState, UiMessage } from "../../shared/types";
import { cn } from "../lib/utils";
import { Composer } from "./Composer";
import { MessageCard } from "./MessageCard";
import { ToolCallsCard } from "./ToolCallsCard";
import { WorkTraceCard } from "./WorkTraceCard";

type ChatViewProps = {
  gui: GuiState;
  sessionId?: string;
  onSendPrompt: (text: string, sessionId?: string) => Promise<unknown> | unknown;
  onAbort: (sessionId?: string) => Promise<unknown> | unknown;
  onSetModel: (provider: string, modelId: string, sessionId?: string) => Promise<unknown> | unknown;
  onSetThinkingLevel: (level: string, sessionId?: string) => Promise<unknown> | unknown;
  onPickAttachments: (sessionId?: string) => Promise<unknown> | unknown;
  onRemoveAttachment: (attachmentId: string, sessionId?: string) => Promise<unknown> | unknown;
  onClearAttachments: (sessionId?: string) => Promise<unknown> | unknown;
};

export function ChatView({
  gui,
  sessionId,
  onSendPrompt,
  onAbort,
  onSetModel,
  onSetThinkingLevel,
  onPickAttachments,
  onRemoveAttachment,
  onClearAttachments,
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [composerValue, setComposerValue] = useState("");

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
    while (index < gui.messages.length) {
      const message = gui.messages[index];
      if (!message) break;

      if (message.role === "user") {
        items.push({ id: message.id, kind: "message", message });
        index += 1;
        continue;
      }

      const segmentStart = index;
      while (index < gui.messages.length && gui.messages[index]?.role !== "user") {
        index += 1;
      }

      const segment = gui.messages.slice(segmentStart, index);
      const isOpenStreamingSegment = gui.isStreaming && index === gui.messages.length;

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
  }, [gui.messages]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    container.scrollTop = container.scrollHeight;
  }, [timelineItems, gui.isStreaming]);

  const send = () => {
    const trimmed = composerValue.trim();
    if (!trimmed || gui.isStreaming) return;

    void onSendPrompt(trimmed, sessionId);
    setComposerValue("");
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="chat-scroll-region min-h-0 flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="mx-auto flex w-full max-w-4xl min-w-0 flex-col gap-3 px-4 py-4 sm:px-5">
          {timelineItems.length > 0 ? (
            timelineItems.map((item) => (
              <div key={item.id} className="mx-auto flex w-full min-w-0 max-w-3xl">
                {item.kind === "message" ? <MessageCard message={item.message} /> : null}
                {item.kind === "tool-group" ? <ToolCallsCard messages={item.messages} /> : null}
                {item.kind === "work-trace" ? <WorkTraceCard messages={item.messages} endTimestamp={item.endTimestamp} /> : null}
              </div>
            ))
          ) : (
            <div className="mx-auto mt-16 grid w-full max-w-lg place-items-center px-6 py-10 text-center">
              <h3 className="text-base font-semibold">Start a Pi session</h3>
              <p className="mt-1 text-sm text-muted-foreground">Send your first prompt to begin a thread.</p>
            </div>
          )}
        </div>
      </div>

      {gui.errorText ? (
        <div className="mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {gui.errorText}
        </div>
      ) : null}
      {gui.statusText ? (
        <div className="mx-4 mb-2 rounded-md bg-muted/55 px-3 py-1.5 text-xs text-muted-foreground">
          {gui.statusText}
        </div>
      ) : null}

      <div className={cn("border-t border-border/55 bg-background px-4 py-3 sm:px-5", gui.isStreaming && "shadow-inner")}>
        <Composer
          busy={gui.isStreaming}
          value={composerValue}
          onValueChange={setComposerValue}
          onSubmit={send}
          onAbort={() => onAbort(sessionId)}
          models={gui.availableModels}
          currentModel={gui.model}
          thinkingLevel={gui.thinkingLevel}
          availableThinkingLevels={gui.availableThinkingLevels}
          attachments={gui.attachments}
          onSetModel={(provider, modelId) => void onSetModel(provider, modelId, sessionId)}
          onSetThinkingLevel={(level) => void onSetThinkingLevel(level, sessionId)}
          onPickAttachments={() => void onPickAttachments(sessionId)}
          onRemoveAttachment={(attachmentId) => void onRemoveAttachment(attachmentId, sessionId)}
          onClearAttachments={() => void onClearAttachments(sessionId)}
        />
      </div>
    </section>
  );
}
