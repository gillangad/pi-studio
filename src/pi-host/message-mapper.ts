import type { ResourceEntrySummary, ResourceOrigin, ResourceSummary, UiMessage, UiToolDetails } from "../shared/types";

type RuntimeMessage = {
  role?: string;
  content?: string | Array<{ type?: string; text?: string; thinking?: string; redacted?: boolean }>;
  timestamp?: string | number;
  errorMessage?: string;
  toolName?: string;
  isError?: boolean;
  command?: string;
  output?: string;
  exitCode?: number;
  cancelled?: boolean;
  truncated?: boolean;
  customType?: string;
  summary?: string;
  details?: {
    diff?: string;
    firstChangedLine?: number | null;
  };
};

function mapToolDetails(details: RuntimeMessage["details"]): UiToolDetails | undefined {
  if (!details || typeof details !== "object") return undefined;

  const diff = typeof details.diff === "string" && details.diff.trim() ? details.diff : undefined;
  const firstChangedLine = typeof details.firstChangedLine === "number" ? details.firstChangedLine : null;

  if (!diff && firstChangedLine === null) return undefined;

  return {
    diff,
    firstChangedLine,
  };
}

function normalizeTextBlock(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
}

function markdownBlocks(text: string) {
  const normalized = normalizeTextBlock(text);
  return normalized ? [normalized] : [];
}

function splitOutputLines(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  while (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

function textParts(content: RuntimeMessage["content"]) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];

  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text ?? "");
}

function thinkingParts(content: RuntimeMessage["content"]) {
  if (!Array.isArray(content)) return [];

  return content.filter(
    (part) => part?.type === "thinking" && typeof part.thinking === "string",
  ) as Array<{ thinking?: string; redacted?: boolean }>;
}

function collapseIncrementalBlocks(blocks: string[]) {
  const unique: string[] = [];

  for (const rawBlock of blocks) {
    const block = normalizeTextBlock(rawBlock);
    if (!block) continue;

    if (unique.includes(block)) {
      continue;
    }

    const coveredByExisting = unique.some((existing) => existing.startsWith(block));
    if (coveredByExisting) {
      continue;
    }

    const next = unique.filter((existing) => !block.startsWith(existing));
    next.push(block);
    unique.splice(0, unique.length, ...next);
  }

  return unique;
}

function normalizeThinkingHeader(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const firstLine = trimmed.split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) return null;

  const markdownHeading = firstLine.match(/^#{1,6}\s+(.+)$/);
  if (markdownHeading?.[1]) return markdownHeading[1].trim();

  const boldOnly = firstLine.match(/^\*\*(.+?)\*\*$/);
  if (boldOnly?.[1]) return boldOnly[1].trim();

  return null;
}

export function mapAgentMessages(messages: unknown[]): UiMessage[] {
  return messages
    .map((message, index) => mapAgentMessage(message as RuntimeMessage, index))
    .filter((message): message is UiMessage => Boolean(message));
}

function mapAgentMessage(message: RuntimeMessage, index: number): UiMessage | null {
  const id = `${message.timestamp ?? index}-${message.role ?? "message"}`;

  switch (message.role) {
    case "user": {
      const content = textParts(message.content).flatMap(markdownBlocks);
      return content.length > 0 ? { id, role: "user", content } : null;
    }

    case "assistant": {
      const content = textParts(message.content).flatMap(markdownBlocks);
      const thinking = thinkingParts(message.content);
      const thinkingContent = collapseIncrementalBlocks(
        thinking.flatMap((part) => markdownBlocks(part.thinking ?? "")),
      );
      const thinkingHeaders = thinkingContent
        .map(normalizeThinkingHeader)
        .filter((value): value is string => Boolean(value));

      if (content.length === 0 && thinkingContent.length === 0 && !message.errorMessage) {
        return null;
      }

      return {
        id,
        role: "assistant",
        timestamp: message.timestamp,
        content: content.length > 0 ? content : message.errorMessage ? [message.errorMessage] : [],
        thinkingContent: thinkingContent.length > 0 ? thinkingContent : undefined,
        thinkingHeaders: thinkingHeaders.length > 0 ? Array.from(new Set(thinkingHeaders)) : undefined,
        thinkingRedacted: thinking.some((part) => Boolean(part.redacted)) || undefined,
      };
    }

    case "toolResult": {
      const content = textParts(message.content).flatMap(markdownBlocks);
      return {
        id,
        role: "toolResult",
        timestamp: message.timestamp,
        toolName: message.toolName ?? "tool",
        content: content.length > 0 ? content : [message.isError ? "Tool failed." : "Tool finished."],
        isError: Boolean(message.isError),
        toolDetails: mapToolDetails(message.details),
      };
    }

    case "bashExecution":
      return {
        id,
        role: "bashExecution",
        timestamp: message.timestamp,
        content: [],
        command: message.command ?? "",
        output: splitOutputLines(message.output ?? "").slice(0, 16),
        exitCode: message.exitCode ?? null,
        cancelled: Boolean(message.cancelled),
        truncated: Boolean(message.truncated),
      };

    case "custom": {
      const content = textParts(message.content).flatMap(markdownBlocks);
      return content.length > 0
        ? {
            id,
            role: "custom",
            timestamp: message.timestamp,
            content,
            customType: message.customType ?? "custom",
          }
        : null;
    }

    case "branchSummary":
    case "compactionSummary":
      return message.summary?.trim()
        ? {
            id,
            role: message.role,
            timestamp: message.timestamp,
            content: markdownBlocks(message.summary),
          }
        : null;

    default:
      return null;
  }
}

function listNames(values: unknown[], fallbackPrefix: string) {
  return values
    .map((value, index) => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object") {
        const candidate = (value as { name?: unknown; id?: unknown; path?: unknown }).name
          ?? (value as { id?: unknown; path?: unknown }).id
          ?? (value as { path?: unknown }).path;

        if (typeof candidate === "string" && candidate.trim()) {
          return candidate.trim();
        }
      }

      return `${fallbackPrefix}-${index + 1}`;
    })
    .filter((value): value is string => Boolean(value));
}

function resourcePath(value: unknown) {
  if (!value || typeof value !== "object") return null;

  const candidate = (value as { path?: unknown; filePath?: unknown; resolvedPath?: unknown }).path
    ?? (value as { filePath?: unknown; resolvedPath?: unknown }).filePath
    ?? (value as { resolvedPath?: unknown }).resolvedPath;

  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function resourceOrigin(value: unknown): ResourceOrigin {
  const candidatePath = resourcePath(value);
  if (!candidatePath) return "userInstalled";

  const normalized = candidatePath.replace(/\\/g, "/").toLowerCase();
  if (
    normalized.includes("/src/builtins/")
    || normalized.includes("/.pi-studio/builtins/")
    || normalized.includes("/out/main/builtins/")
  ) {
    return "bundled";
  }

  return "userInstalled";
}

function resourceEntries(values: unknown[], fallbackPrefix: string): ResourceEntrySummary[] {
  return listNames(values, fallbackPrefix).map((name, index) => ({
    name,
    path: resourcePath(values[index]) ?? null,
    origin: resourceOrigin(values[index]),
  }));
}

export function emptyResourceSummary(): ResourceSummary {
  return {
    extensions: 0,
    skills: 0,
    prompts: 0,
    themes: 0,
    agentsFiles: 0,
    extensionEntries: [],
    extensionNames: [],
    skillEntries: [],
    skillNames: [],
    promptNames: [],
    themeNames: [],
    agentsFilePaths: [],
  };
}

export function mapResourceSummary(resources: any): ResourceSummary {
  const extensions = Array.isArray(resources?.extensions) ? resources.extensions : [];
  const skills = Array.isArray(resources?.skills) ? resources.skills : [];
  const prompts = Array.isArray(resources?.prompts) ? resources.prompts : [];
  const themes = Array.isArray(resources?.themes) ? resources.themes : [];
  const agentsFiles = Array.isArray(resources?.agentsFiles) ? resources.agentsFiles : [];

  return {
    extensions: extensions.length,
    skills: skills.length,
    prompts: prompts.length,
    themes: themes.length,
    agentsFiles: agentsFiles.length,
    extensionEntries: resourceEntries(extensions, "extension"),
    extensionNames: listNames(extensions, "extension"),
    skillEntries: resourceEntries(skills, "skill"),
    skillNames: listNames(skills, "skill"),
    promptNames: listNames(prompts, "prompt"),
    themeNames: listNames(themes, "theme"),
    agentsFilePaths: listNames(agentsFiles, "agents-file"),
  };
}

export function normalizeThreadTitle(value: unknown) {
  const text = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return "New thread";
  return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}
