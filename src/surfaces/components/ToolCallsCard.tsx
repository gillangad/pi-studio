import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { UiMessage } from "../../shared/types";
import { cn } from "../lib/utils";

type ToolCallMessage = UiMessage & { role: "toolResult" | "bashExecution" };

type ToolCallsCardProps = {
  messages: ToolCallMessage[];
  initialExpanded?: boolean;
  hideGroupLabel?: boolean;
};

type ToolKind = "read" | "edit" | "write" | "bash" | "other";

type ParsedToolContent = {
  header: string;
  body: string;
  exitCodeFromText: number | null;
};

type ActivitySummary = {
  verb: string;
  target: string;
  added: number;
  removed: number;
};

function normalize(text: string) {
  return text.replace(/\r\n/g, "\n");
}

function trimTrailingBlank(lines: string[]) {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1].trim() === "") {
    next.pop();
  }
  return next;
}

function firstMeaningfulLine(content: string[]) {
  return (
    content
      .flatMap((block) => normalize(block).split("\n"))
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

function detectToolKind(message: ToolCallMessage): ToolKind {
  if (message.role === "bashExecution") return "bash";

  const byName = String(message.toolName ?? "").toLowerCase();
  if (byName.includes("read")) return "read";
  if (byName.includes("edit")) return "edit";
  if (byName.includes("write")) return "write";
  if (byName.includes("bash")) return "bash";

  const line = firstMeaningfulLine(message.content).toLowerCase();
  if (line.startsWith("read ")) return "read";
  if (line.startsWith("edit ")) return "edit";
  if (line.startsWith("write ")) return "write";
  if (line.startsWith("$ ") || line.startsWith("bash ")) return "bash";

  return "other";
}

function parseToolContent(message: ToolCallMessage, kind: ToolKind): ParsedToolContent {
  const raw = normalize(message.content.join("\n\n"));
  const lines = raw.split("\n");
  const firstNonEmpty = lines.findIndex((line) => line.trim().length > 0);

  if (firstNonEmpty < 0) {
    return {
      header: "",
      body: "",
      exitCodeFromText: null,
    };
  }

  if (kind === "bash") {
    const firstLine = lines[firstNonEmpty].trim();
    const dollarMatch = firstLine.match(/^\$\s+(.+)$/);
    const bashMatch = firstLine.match(/^bash\s+(.+)$/i);

    let header = "";
    let startIndex = firstNonEmpty;

    if (message.role === "bashExecution") {
      header = message.command ? message.command : "bash";
      startIndex = lines.length;
    } else if (dollarMatch?.[1]) {
      header = dollarMatch[1].trim();
      startIndex = firstNonEmpty + 1;
    } else if (bashMatch?.[1]) {
      header = bashMatch[1].trim();
      startIndex = firstNonEmpty + 1;
    }

    while (startIndex < lines.length && lines[startIndex].trim() === "") {
      startIndex += 1;
    }

    let tail = trimTrailingBlank(lines.slice(startIndex));
    let exitCodeFromText: number | null = null;

    for (let index = tail.length - 1; index >= 0; index -= 1) {
      const line = tail[index].trim();
      const exitMatch = line.match(/^Command exited with code\s+(-?\d+)$/i);
      if (exitMatch?.[1]) {
        exitCodeFromText = Number(exitMatch[1]);
        tail = tail.slice(0, index).concat(tail.slice(index + 1));
        break;
      }
    }

    return {
      header,
      body: message.role === "bashExecution" ? normalize((message.output ?? []).join("\n")) : tail.join("\n"),
      exitCodeFromText,
    };
  }

  const firstLine = lines[firstNonEmpty].trim();
  let header = "";
  let startIndex = firstNonEmpty;

  if (kind === "read" || kind === "edit" || kind === "write") {
    const match = firstLine.match(new RegExp(`^${kind}\\s+(.+)$`, "i"));
    if (match?.[1]) {
      header = match[1].trim();
      startIndex = firstNonEmpty + 1;
      while (startIndex < lines.length && lines[startIndex].trim() === "") {
        startIndex += 1;
      }
    }
  }

  return {
    header,
    body: trimTrailingBlank(lines.slice(startIndex)).join("\n"),
    exitCodeFromText: null,
  };
}

function isFailure(message: ToolCallMessage, kind: ToolKind, parsed: ParsedToolContent) {
  if (kind === "bash") {
    if (message.role === "bashExecution") {
      return Boolean(message.cancelled) || (message.exitCode ?? 0) !== 0;
    }

    if (typeof parsed.exitCodeFromText === "number") {
      return parsed.exitCodeFromText !== 0;
    }
  }

  return Boolean(message.isError);
}

function summarizeGroup(messages: ToolCallMessage[]) {
  const bashCount = messages.filter((message) => detectToolKind(message) === "bash").length;
  return bashCount === messages.length
    ? `Ran ${messages.length} ${messages.length === 1 ? "command" : "commands"}`
    : `Ran ${messages.length} ${messages.length === 1 ? "tool call" : "tool calls"}`;
}

function countDiff(body: string) {
  return body.split("\n").reduce(
    (counts, line) => {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("+") && !trimmed.startsWith("+++")) counts.added += 1;
      if (trimmed.startsWith("-") && !trimmed.startsWith("---")) counts.removed += 1;
      return counts;
    },
    { added: 0, removed: 0 },
  );
}

function buildActivitySummary(message: ToolCallMessage, kind: ToolKind, parsed: ParsedToolContent): ActivitySummary {
  if (kind === "bash") {
    return {
      verb: "Bash",
      target: parsed.header || message.command || firstMeaningfulLine(message.content).replace(/^\$\s*/, "") || "bash",
      added: 0,
      removed: 0,
    };
  }

  if (kind === "read") {
    return {
      verb: "Read",
      target: parsed.header || "file",
      added: 0,
      removed: 0,
    };
  }

  if (kind === "edit") {
    const counts = countDiff(parsed.body);
    return {
      verb: "Edited",
      target: parsed.header || "file",
      added: counts.added,
      removed: counts.removed,
    };
  }

  if (kind === "write") {
    const counts = countDiff(parsed.body);
    return {
      verb: "Created",
      target: parsed.header || "file",
      added: counts.added || parsed.body.split("\n").filter(Boolean).length,
      removed: counts.removed,
    };
  }

  return {
    verb: "Used",
    target: firstMeaningfulLine(message.content) || String(message.toolName ?? "tool"),
    added: 0,
    removed: 0,
  };
}

function hasDetail(message: ToolCallMessage, parsed: ParsedToolContent) {
  if (message.role === "bashExecution") {
    return Boolean(parsed.body.trim()) || typeof message.exitCode === "number";
  }

  return Boolean(parsed.body.trim()) || typeof parsed.exitCodeFromText === "number";
}

function renderDetail(message: ToolCallMessage, parsed: ParsedToolContent, failed: boolean) {
  const exitCode = message.role === "bashExecution" ? message.exitCode : parsed.exitCodeFromText;
  const output = parsed.body.trim();

  if (!output && typeof exitCode !== "number") {
    return null;
  }

  return (
    <div className="ml-4 mt-1.5 border-l border-border/60 pl-3">
      {output ? (
        <pre className="overflow-auto whitespace-pre-wrap font-mono text-xs text-muted-foreground">{output}</pre>
      ) : null}
      {typeof exitCode === "number" ? (
        <div className={cn("mt-1 text-[11px] text-muted-foreground", failed && "text-destructive")}>
          exit {exitCode}
          {message.cancelled ? "  cancelled" : ""}
        </div>
      ) : null}
    </div>
  );
}

export function ToolCallsCard({
  messages,
  initialExpanded,
  hideGroupLabel = false,
}: ToolCallsCardProps) {
  const isSingleCall = messages.length === 1;
  const [expanded, setExpanded] = useState(initialExpanded ?? false);
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});

  const parsedByKey = useMemo(
    () =>
      Object.fromEntries(
        messages.map((message, index) => {
          const key = `${message.id}:${index}`;
          const kind = detectToolKind(message);
          return [key, parseToolContent(message, kind)] as const;
        }),
      ),
    [messages],
  );

  const groupLabel = useMemo(() => summarizeGroup(messages), [messages]);
  const showGroupLabel = !hideGroupLabel && !isSingleCall;
  const showItems = showGroupLabel ? expanded : true;

  return (
    <article className="w-full max-w-3xl">
      {showGroupLabel ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 py-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>{groupLabel}</span>
        </button>
      ) : null}

      {showItems ? (
        <div className={cn("space-y-1", showGroupLabel && "mt-1")}>
          {messages.map((message, index) => {
            const key = `${message.id}:${index}`;
            const kind = detectToolKind(message);
            const parsed = parsedByKey[key] ?? parseToolContent(message, kind);
            const failed = isFailure(message, kind, parsed);
            const summary = buildActivitySummary(message, kind, parsed);
            const itemHasDetail = hasDetail(message, parsed);
            const itemExpanded = expandedItemIds[key] ?? failed;

            return (
              <div key={key}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 text-left text-sm text-muted-foreground transition-colors hover:text-foreground",
                    !itemHasDetail && "cursor-default",
                    failed && "text-destructive",
                  )}
                  onClick={() => {
                    if (!itemHasDetail) return;
                    setExpandedItemIds((current) => ({
                      ...current,
                      [key]: !itemExpanded,
                    }));
                  }}
                  aria-expanded={itemHasDetail ? itemExpanded : undefined}
                >
                  <span className="mt-0.5 shrink-0 text-muted-foreground/75">
                    {itemHasDetail ? (itemExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("mr-1 text-foreground", failed && "text-destructive")}>{summary.verb}</span>
                    <span className="break-all">{summary.target}</span>
                    {summary.added > 0 ? <span className="ml-2 text-success">+{summary.added}</span> : null}
                    {summary.removed > 0 ? <span className="ml-1 text-destructive">-{summary.removed}</span> : null}
                  </span>
                </button>
                {itemExpanded ? renderDetail(message, parsed, failed) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
