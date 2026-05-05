import { Check, ChevronDown, ChevronRight, Clipboard, FileCode2, PencilLine, SquareTerminal } from "lucide-react";
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
  detailTarget: string;
  added: number;
  removed: number;
};

type GroupSummary = {
  label: string;
  commandCount: number;
  editCount: number;
};

function normalize(text: string) {
  return text.replace(/\r\n/g, "\n");
}

function trimTrailingBlank(lines: string[]) {
  const next = [...lines];
  while (next.length > 0 && next[next.length - 1]!.trim() === "") {
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

function basename(path: string) {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  if (!trimmed) return path;
  const segments = trimmed.split(/[\\/]/);
  return segments[segments.length - 1] ?? trimmed;
}

function inferToolPath(kind: ToolKind, raw: string) {
  const firstLine = raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) return "";

  if (kind === "edit") {
    const successMatch = firstLine.match(/^Successfully replaced \d+ block\(s\) in (.+?)(?:\.)?$/i);
    if (successMatch?.[1]) return successMatch[1].trim();
  }

  if (kind === "write") {
    const successMatch = firstLine.match(/^Successfully wrote \d+ bytes to (.+)$/i);
    if (successMatch?.[1]) return successMatch[1].trim();
  }

  if (kind === "read") {
    const successMatch = firstLine.match(/^(?:Read|Reading)\s+(.+)$/i);
    if (successMatch?.[1]) return successMatch[1].trim();
  }

  return "";
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
  if (line.startsWith("successfully replaced")) return "edit";
  if (line.startsWith("successfully wrote")) return "write";
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
    const firstLine = lines[firstNonEmpty]!.trim();
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

    while (startIndex < lines.length && lines[startIndex]!.trim() === "") {
      startIndex += 1;
    }

    let tail = trimTrailingBlank(lines.slice(startIndex));
    let exitCodeFromText: number | null = null;

    for (let index = tail.length - 1; index >= 0; index -= 1) {
      const line = tail[index]!.trim();
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

  const firstLine = lines[firstNonEmpty]!.trim();
  let header = "";
  let startIndex = firstNonEmpty;

  if (kind === "read" || kind === "edit" || kind === "write") {
    const match = firstLine.match(new RegExp(`^${kind}\\s+(.+)$`, "i"));
    if (match?.[1]) {
      header = match[1].trim();
      startIndex = firstNonEmpty + 1;
      while (startIndex < lines.length && lines[startIndex]!.trim() === "") {
        startIndex += 1;
      }
    }
  }

  if (!header) {
    header = inferToolPath(kind, raw);
    if (header) {
      startIndex = firstNonEmpty + 1;
      while (startIndex < lines.length && lines[startIndex]!.trim() === "") {
        startIndex += 1;
      }
    }
  }

  let body = trimTrailingBlank(lines.slice(startIndex)).join("\n");
  if (!body && (kind === "edit" || kind === "write")) {
    body = message.toolDetails?.diff ? normalize(message.toolDetails.diff) : "";
  }

  return {
    header,
    body,
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
      verb: "Ran",
      target: parsed.header || message.command || firstMeaningfulLine(message.content).replace(/^\$\s*/, "") || "bash",
      detailTarget: parsed.header || message.command || "bash",
      added: 0,
      removed: 0,
    };
  }

  const detailTarget = parsed.header || "file";
  const target = basename(detailTarget);

  if (kind === "read") {
    return {
      verb: "Read",
      target,
      detailTarget,
      added: 0,
      removed: 0,
    };
  }

  if (kind === "edit") {
    const counts = countDiff(parsed.body);
    return {
      verb: "Edited",
      target,
      detailTarget,
      added: counts.added,
      removed: counts.removed,
    };
  }

  if (kind === "write") {
    const counts = countDiff(parsed.body);
    return {
      verb: "Edited",
      target,
      detailTarget,
      added: counts.added || parsed.body.split("\n").filter(Boolean).length,
      removed: counts.removed,
    };
  }

  return {
    verb: "Used",
    target: firstMeaningfulLine(message.content) || String(message.toolName ?? "tool"),
    detailTarget: firstMeaningfulLine(message.content) || String(message.toolName ?? "tool"),
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

function buildGroupSummary(messages: ToolCallMessage[]) {
  const counts = messages.reduce(
    (summary, message) => {
      const kind = detectToolKind(message);
      if (kind === "bash") summary.commandCount += 1;
      if (kind === "edit" || kind === "write") summary.editCount += 1;
      return summary;
    },
    { commandCount: 0, editCount: 0 },
  );

  let label = "";
  if (counts.editCount > 0 && counts.commandCount > 0) {
    label = `Edited ${counts.editCount} ${counts.editCount === 1 ? "file" : "files"}, ran ${counts.commandCount} ${counts.commandCount === 1 ? "command" : "commands"}`;
  } else if (counts.editCount > 0) {
    label = `Edited ${counts.editCount} ${counts.editCount === 1 ? "file" : "files"}`;
  } else if (counts.commandCount > 0) {
    label = `Ran ${counts.commandCount} ${counts.commandCount === 1 ? "command" : "commands"}`;
  } else {
    label = `Ran ${messages.length} ${messages.length === 1 ? "tool call" : "tool calls"}`;
  }

  return {
    label,
    ...counts,
  } satisfies GroupSummary;
}

function groupIcon(summary: GroupSummary) {
  return summary.editCount > 0 ? PencilLine : SquareTerminal;
}

function expandedRowLabel(kind: ToolKind) {
  if (kind === "bash") return "Ran command";
  if (kind === "read") return "Read file";
  return "Edited file";
}

function renderDiffBody(body: string) {
  const lines = body.split("\n");
  return (
    <pre className="tool-detail-pre">
      {lines.map((line, index) => {
        const trimmed = line.trimStart();
        const lineClass = trimmed.startsWith("+") && !trimmed.startsWith("+++")
          ? "tool-detail-line-add"
          : trimmed.startsWith("-") && !trimmed.startsWith("---")
            ? "tool-detail-line-remove"
            : "";

        return (
          <div key={`${line}-${index}`} className={cn("tool-detail-line", lineClass)}>
            {line || " "}
          </div>
        );
      })}
    </pre>
  );
}

function detailLabel(kind: ToolKind) {
  if (kind === "bash") return "Shell";
  if (kind === "read") return "Read file";
  return "Edited file";
}

function itemIcon(kind: ToolKind) {
  if (kind === "bash") return SquareTerminal;
  if (kind === "read") return FileCode2;
  return PencilLine;
}

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      className="tool-detail-copy"
      aria-label="Copy tool output"
      title="Copy"
      onClick={() => {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
        void navigator.clipboard.writeText(value);
      }}
    >
      <Clipboard size={14} />
    </button>
  );
}

function renderDetail(
  message: ToolCallMessage,
  kind: ToolKind,
  parsed: ParsedToolContent,
  failed: boolean,
  summary: ActivitySummary,
) {
  const exitCode = message.role === "bashExecution" ? message.exitCode : parsed.exitCodeFromText;
  const output = parsed.body.trim();

  if (!output && typeof exitCode !== "number") {
    return null;
  }

  if (kind === "edit" || kind === "write") {
    return (
      <div className="tool-detail-card">
        <div className="tool-detail-header">
          <div className="tool-detail-title-row">
            <span className="tool-detail-filename">{summary.detailTarget}</span>
            {(summary.added > 0 || summary.removed > 0) ? (
              <span className="tool-detail-diff-counts">
                {summary.added > 0 ? <span className="text-success">+{summary.added}</span> : null}
                {summary.removed > 0 ? <span className="text-destructive">-{summary.removed}</span> : null}
              </span>
            ) : null}
          </div>
          <CopyButton value={parsed.body} />
        </div>

        {renderDiffBody(parsed.body)}
      </div>
    );
  }

  if (kind === "read") {
    return (
      <div className="tool-detail-card">
        <div className="tool-detail-header">
          <span className="tool-detail-filename">{summary.detailTarget}</span>
          <CopyButton value={parsed.body} />
        </div>
        <pre className="tool-detail-pre">{output}</pre>
      </div>
    );
  }

  return (
    <div className="tool-detail-card">
      <div className="tool-detail-header">
        <span className="tool-detail-label">{detailLabel(kind)}</span>
        <CopyButton value={parsed.body} />
      </div>

      {kind === "bash" ? (
        <div className="tool-detail-shell-command">$ {parsed.header || message.command || "bash"}</div>
      ) : null}

      {output ? <pre className="tool-detail-pre">{output}</pre> : null}

      <div className="tool-detail-footer">
        {typeof exitCode === "number" ? (
          <div className={cn("tool-detail-exit", failed && "tool-detail-exit-failed")}>
            exit {exitCode}
            {message.cancelled ? "  cancelled" : ""}
          </div>
        ) : <span />}
        <span className={cn("tool-detail-status", failed ? "tool-detail-status-failed" : "tool-detail-status-success")}>
          {!failed ? <Check size={12} /> : null}
          {failed ? "Failed" : "Success"}
        </span>
      </div>
    </div>
  );
}

export function ToolCallsCard({
  messages,
  initialExpanded,
  hideGroupLabel = false,
}: ToolCallsCardProps) {
  const isSingleCall = messages.length === 1;
  void initialExpanded;
  const [expanded, setExpanded] = useState(false);
  const [expandedItemIds, setExpandedItemIds] = useState<Record<string, boolean>>({});

  const parsedItems = useMemo(
    () =>
      messages.map((message, index) => {
        const key = `${message.id}:${index}`;
        const kind = detectToolKind(message);
        const parsed = parseToolContent(message, kind);
        const failed = isFailure(message, kind, parsed);
        const summary = buildActivitySummary(message, kind, parsed);
        return {
          key,
          kind,
          parsed,
          failed,
          summary,
          hasDetail: hasDetail(message, parsed),
          message,
        };
      }),
    [messages],
  );

  const groupSummary = useMemo(() => buildGroupSummary(messages), [messages]);
  const showGroupLabel = !hideGroupLabel && !isSingleCall;
  const showItems = showGroupLabel ? expanded : true;
  const GroupIcon = groupIcon(groupSummary);

  return (
    <article className="w-full max-w-[760px]">
      {showGroupLabel ? (
        <button
          type="button"
          className="tool-summary-row"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          <span className="tool-summary-chevron">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <GroupIcon size={14} className="text-muted-foreground/80" />
          <span>{groupSummary.label}</span>
        </button>
      ) : null}

      {showItems ? (
        <div className={cn("space-y-2", showGroupLabel && "mt-2")}>
          {parsedItems.map(({ key, kind, parsed, failed, summary, hasDetail, message }) => {
            const Icon = itemIcon(kind);
            const itemExpanded = expandedItemIds[key] ?? false;
            const primaryLabel = itemExpanded ? expandedRowLabel(kind) : `${summary.verb} ${summary.target}`;

            return (
              <div key={key} className="space-y-1">
                <button
                  type="button"
                  className={cn(
                    "tool-item-row",
                    failed && "tool-item-row-failed",
                    !hasDetail && "cursor-default",
                  )}
                  aria-label={`${summary.verb} ${summary.target}`}
                  onClick={() => {
                    if (!hasDetail) return;
                    setExpandedItemIds((current) => ({
                      ...current,
                      [key]: !itemExpanded,
                    }));
                  }}
                  aria-expanded={hasDetail ? itemExpanded : undefined}
                >
                  <span className="tool-item-chevron">
                    {hasDetail ? (itemExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : null}
                  </span>
                  <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground/80" />
                  <span className="min-w-0 flex-1 truncate">
                    {itemExpanded ? (
                      <span className={cn("truncate text-muted-foreground", failed && "text-destructive")}>{primaryLabel}</span>
                    ) : (
                      <>
                        <span className={cn("mr-1 text-muted-foreground", failed && "text-destructive")}>{summary.verb}</span>
                        <span className="truncate text-muted-foreground">{summary.target}</span>
                      </>
                    )}
                  </span>
                  {(summary.added > 0 || summary.removed > 0) ? (
                    <span className="shrink-0 text-[12px]">
                      {summary.added > 0 ? <span className="text-success">+{summary.added}</span> : null}
                      {summary.removed > 0 ? <span className="ml-1 text-destructive">-{summary.removed}</span> : null}
                    </span>
                  ) : null}
                </button>

                {itemExpanded ? renderDetail(message, kind, parsed, failed, summary) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
