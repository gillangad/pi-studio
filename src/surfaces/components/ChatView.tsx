import { useEffect, useMemo, useRef, useState } from "react";
import type { RunSlashCommandResult } from "../../shared/ipc";
import type { GuiState, SessionTreeSnapshot, UiMessage } from "../../shared/types";
import { cn } from "../lib/utils";
import { Composer } from "./Composer";
import { MessageCard } from "./MessageCard";
import { SessionTreeDialog } from "./SessionTreeDialog";
import { ToolCallsCard } from "./ToolCallsCard";
import { WorkTraceCard } from "./WorkTraceCard";
import { Button } from "./ui/button";

type ChatViewProps = {
  gui: GuiState;
  sessionId?: string;
  composerValue?: string;
  onComposerValueChange?: (value: string) => void;
  compact?: boolean;
  showComposer?: boolean;
  composerPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
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

export function ChatView({
  gui,
  sessionId,
  composerValue,
  onComposerValueChange,
  compact = false,
  showComposer = true,
  composerPlaceholder,
  emptyTitle = "Start a Pi session",
  emptyDescription = "Send your first prompt to begin a thread.",
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
}: ChatViewProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [internalComposerValue, setInternalComposerValue] = useState("");
  const [treeDialogOpen, setTreeDialogOpen] = useState(false);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeErrorText, setTreeErrorText] = useState<string | null>(null);
  const [treeSnapshot, setTreeSnapshot] = useState<SessionTreeSnapshot>({ leafId: null, nodes: [] });
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const resolvedComposerValue = composerValue ?? internalComposerValue;
  const setComposerValue = onComposerValueChange ?? setInternalComposerValue;

  const syncScrollState = () => {
    const container = scrollRef.current;
    if (!container) return true;

    const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
    const nearBottom = distanceFromBottom <= 24;
    setShowScrollToBottom(!nearBottom);
    return nearBottom;
  };

  const timelineItems = useMemo(() => {
    type ToolCallMessage = UiMessage & { role: "toolResult" | "bashExecution" };

    const items: Array<
      | { id: string; kind: "message"; message: UiMessage; showFooter: boolean }
      | { id: string; kind: "tool-group"; messages: ToolCallMessage[] }
      | { id: string; kind: "work-trace"; messages: UiMessage[]; endTimestamp?: string | number }
    > = [];

    const pushRawSegment = (segment: UiMessage[], options?: { assistantFooter?: boolean }) => {
      let toolBuffer: ToolCallMessage[] = [];
      const assistantFooter = options?.assistantFooter ?? false;

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
        items.push({
          id: message.id,
          kind: "message",
          message,
          showFooter: message.role === "user" || (message.role === "assistant" && assistantFooter),
        });
      }

      flushToolBuffer();
    };

    let index = 0;
    while (index < gui.messages.length) {
      const message = gui.messages[index];
      if (!message) break;

      if (message.role === "user") {
        items.push({ id: message.id, kind: "message", message, showFooter: true });
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
        pushRawSegment(segment, { assistantFooter: false });
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

        items.push({ id: finalAssistant.id, kind: "message", message: finalAssistant, showFooter: true });
        pushRawSegment(trailingMessages, { assistantFooter: false });
        continue;
      }

      const singleAssistantSegment =
        segment.length === 1 && segment[0]?.role === "assistant";
      pushRawSegment(segment, { assistantFooter: singleAssistantSegment });
    }

    return items;
  }, [gui.messages]);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    if (syncScrollState()) {
      container.scrollTop = container.scrollHeight;
      setShowScrollToBottom(false);
    }
  }, [timelineItems, gui.isStreaming]);

  const scrollToBottom = () => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    setShowScrollToBottom(false);
  };

  const openTreeDialog = async () => {
    setTreeDialogOpen(true);
    setTreeLoading(true);
    setTreeErrorText(null);

    try {
      const snapshot = await onGetSessionTree(sessionId);
      setTreeSnapshot(snapshot);
    } catch (error) {
      setTreeErrorText(error instanceof Error ? error.message : String(error));
      setTreeSnapshot({ leafId: null, nodes: [] });
    } finally {
      setTreeLoading(false);
    }
  };

  const send = () => {
    const trimmed = resolvedComposerValue.trim();
    if (!trimmed || gui.isStreaming) return;

    if (/^\//.test(trimmed)) {
      const submittedCommand = trimmed;
      setComposerValue("");
      void onRunSlashCommand(submittedCommand, sessionId).then((result) => {
        if (!result.handled) {
          setComposerValue(submittedCommand);
          return;
        }

        if (result.openTree) {
          void openTreeDialog();
        }

        if (result.openModelPicker) {
          setAgentMenuOpen(true);
        }
      });
      return;
    }

    void onSendPrompt(trimmed, sessionId);
    setComposerValue("");
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="relative min-h-0 flex-1">
      <div
        className="chat-scroll-region min-h-0 h-full overflow-y-auto"
        ref={scrollRef}
        aria-label="Session transcript"
        onScroll={() => {
          syncScrollState();
        }}
      >
        <div
          className={[
            compact ? "mx-auto flex w-full min-w-0 flex-col gap-2 px-3 py-3" : "chat-width-shell mx-auto flex min-w-0 flex-col gap-2.5 px-4 py-4 sm:px-5",
          ].join(" ")}
        >
          {timelineItems.length > 0 ? (
            timelineItems.map((item) => (
              <div key={item.id} className="mx-auto flex w-full min-w-0">
                {item.kind === "message" ? (
                  <MessageCard
                    message={item.message}
                    showFooter={item.showFooter}
                  />
                ) : null}
                {item.kind === "tool-group" ? <ToolCallsCard messages={item.messages} /> : null}
                {item.kind === "work-trace" ? (
                  <WorkTraceCard messages={item.messages} endTimestamp={item.endTimestamp} />
                ) : null}
              </div>
            ))
          ) : (
            <div className={compact ? "mx-auto grid w-full place-items-center px-4 py-8 text-center" : "mx-auto mt-16 grid w-full max-w-lg place-items-center px-6 py-10 text-center"}>
              <h3 className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>{emptyTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{emptyDescription}</p>
            </div>
          )}
        </div>
      </div>
      {showScrollToBottom ? (
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className={compact ? "absolute bottom-3 right-3 h-8 w-8 rounded-full shadow-glass" : "absolute bottom-4 right-5 h-9 w-9 rounded-full shadow-glass"}
          onClick={scrollToBottom}
          aria-label="Scroll chat to bottom"
          title="Scroll to bottom"
        >
          ↓
        </Button>
      ) : null}
      </div>

      {gui.errorText ? (
        <div className={compact ? "mx-2 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" : "mx-3 mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"}>
          {gui.errorText}
        </div>
      ) : null}
      {gui.statusText ? (
        <div className={compact ? "mx-3 mb-2 rounded-md bg-muted/55 px-3 py-1.5 text-[11px] text-muted-foreground" : "mx-4 mb-2 rounded-md bg-muted/55 px-3 py-1.5 text-xs text-muted-foreground"}>
          {gui.statusText}
        </div>
      ) : null}

      {showComposer ? (
        <div
          className={cn(
            compact ? "border-t border-border/50 bg-background px-3 py-2.5" : "border-t border-border/50 bg-background px-4 py-3 sm:px-5",
            gui.isStreaming && "shadow-inner",
          )}
        >
          <div className={compact ? "mx-auto w-full" : "chat-width-shell mx-auto w-full"}>
            <Composer
              busy={gui.isStreaming}
              value={resolvedComposerValue}
              onValueChange={setComposerValue}
              onSubmit={send}
              onAbort={() => onAbort(sessionId)}
              models={gui.availableModels}
              currentModel={gui.model}
              thinkingLevel={gui.thinkingLevel}
              availableThinkingLevels={gui.availableThinkingLevels}
              attachments={gui.attachments}
              slashCommands={gui.slashCommands}
              onSetModel={(provider, modelId) => void onSetModel(provider, modelId, sessionId)}
              onSetThinkingLevel={(level) => void onSetThinkingLevel(level, sessionId)}
              onPickAttachments={() => void onPickAttachments(sessionId)}
              onRemoveAttachment={(attachmentId) => void onRemoveAttachment(attachmentId, sessionId)}
              onClearAttachments={() => void onClearAttachments(sessionId)}
              agentMenuOpen={agentMenuOpen}
              onAgentMenuOpenChange={setAgentMenuOpen}
              compact={compact}
              placeholder={composerPlaceholder}
            />
          </div>
        </div>
      ) : null}

      <SessionTreeDialog
        open={treeDialogOpen}
        loading={treeLoading}
        errorText={treeErrorText}
        nodes={treeSnapshot.nodes}
        leafId={treeSnapshot.leafId}
        onClose={() => {
          setTreeDialogOpen(false);
          setTreeLoading(false);
          setTreeErrorText(null);
        }}
        onApplyEditorText={(text) => {
          if (!resolvedComposerValue.trim()) {
            setComposerValue(text);
          }
        }}
        onNavigate={(targetId, options) => onNavigateTree(targetId, options, sessionId)}
      />
    </section>
  );
}
