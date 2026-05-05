import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { UiMessage } from "../../shared/types";
import type { SessionArtifact } from "../lib/artifacts";
import { MessageCard } from "./MessageCard";
import { ToolCallsCard } from "./ToolCallsCard";

type WorkTraceCardProps = {
  messages: UiMessage[];
  endTimestamp?: string | number;
  artifactById?: Record<string, SessionArtifact>;
  onOpenArtifact?: (artifactId: string) => void;
};

function renderMarkdown(content: string[]) {
  if (content.length === 0) return null;

  return (
    <div className="markdown-content text-[14px] leading-relaxed text-muted-foreground">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content.join("\n\n")}</ReactMarkdown>
    </div>
  );
}

function parseTimestamp(value: string | number | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && value.trim() !== "") return asNumber;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function isToolTraceMessage(message: UiMessage): message is UiMessage & { role: "toolResult" | "bashExecution" } {
  return message.role === "toolResult" || message.role === "bashExecution";
}

function buildSummaryLabel(messages: UiMessage[], endTimestamp?: string | number) {
  const first = messages.map((message) => parseTimestamp(message.timestamp)).find((value) => typeof value === "number");
  const end = parseTimestamp(endTimestamp) ?? [...messages]
    .reverse()
    .map((message) => parseTimestamp(message.timestamp))
    .find((value) => typeof value === "number");

  if (typeof first === "number" && typeof end === "number" && end > first) {
    return `Worked for ${formatDuration(end - first)}`;
  }

  return "Worked";
}

export function WorkTraceCard({ messages, endTimestamp, artifactById, onOpenArtifact }: WorkTraceCardProps) {
  const [expanded, setExpanded] = useState(false);

  const summaryLabel = useMemo(() => buildSummaryLabel(messages, endTimestamp), [endTimestamp, messages]);

  const items = useMemo(() => {
    const next: Array<
      | { id: string; kind: "assistant"; message: UiMessage }
      | { id: string; kind: "tools"; messages: Array<UiMessage & { role: "toolResult" | "bashExecution" }> }
    > = [];

    let toolBuffer: Array<UiMessage & { role: "toolResult" | "bashExecution" }> = [];

    const flushTools = () => {
      if (toolBuffer.length === 0) return;
      next.push({
        id: `trace-tools-${toolBuffer[0]?.id ?? Math.random().toString(36).slice(2)}`,
        kind: "tools",
        messages: toolBuffer,
      });
      toolBuffer = [];
    };

    for (const message of messages) {
      if (isToolTraceMessage(message)) {
        toolBuffer.push(message);
        continue;
      }

      flushTools();
      next.push({
        id: message.id,
        kind: "assistant",
        message,
      });
    }

    flushTools();
    return next;
  }, [messages]);

  return (
    <article className="w-full max-w-[760px]">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 py-1 text-left text-[14px] text-muted-foreground transition-colors hover:text-foreground"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span>{summaryLabel}</span>
      </button>

      {expanded ? (
        <div className="mt-2 space-y-2">
          {items.map((item) =>
            item.kind === "tools" ? (
              <ToolCallsCard key={item.id} messages={item.messages} initialExpanded={false} hideGroupLabel={true} />
            ) : (
              <div key={item.id} className="pl-5">
                {item.message.artifactRefs?.length ? (
                  <MessageCard
                    message={item.message}
                    artifactById={artifactById}
                    onOpenArtifact={onOpenArtifact}
                    showFooter={false}
                  />
                ) : (
                  renderMarkdown(item.message.content)
                )}
              </div>
            ),
          )}
        </div>
      ) : null}
    </article>
  );
}
