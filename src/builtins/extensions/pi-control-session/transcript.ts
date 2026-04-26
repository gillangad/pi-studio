import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  clip,
  DEFAULT_READ_LIMIT,
  MAX_READ_LIMIT,
  type PairView,
  type SessionPair,
  type SessionPairScan,
  toIso,
} from "./types";
import { loadTarget } from "./storage";

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function extractTextBlocks(content: unknown) {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && typeof part === "object" && (part as any).type === "text" && typeof (part as any).text === "string")
    .map((part) => String((part as any).text))
    .join("\n")
    .trim();
}

function extractUserText(content: unknown) {
  const text = extractTextBlocks(content);
  if (text) return text;
  if (typeof content === "string" && content.trim()) return content.trim();
  if (Array.isArray(content) && content.some((part) => part && typeof part === "object" && (part as any).type === "image")) {
    return "[non-text user message: image/content blocks]";
  }
  return "[empty user message]";
}

function extractAssistantText(content: unknown) {
  const text = extractTextBlocks(content);
  if (text) return text;
  if (Array.isArray(content) && content.some((part) => part && typeof part === "object" && (part as any).type === "toolCall")) {
    return "[assistant response without text: tool calls only]";
  }
  return "[assistant response with no text blocks]";
}

function parseTimestampMs(entryTimestamp: unknown, messageTimestamp: unknown, fallbackMs: number) {
  if (typeof entryTimestamp === "string") {
    const ms = Date.parse(entryTimestamp);
    if (!Number.isNaN(ms)) return ms;
  }
  if (typeof messageTimestamp === "number" && Number.isFinite(messageTimestamp)) {
    return messageTimestamp;
  }
  return Number.isFinite(fallbackMs) ? Math.max(1, Math.floor(fallbackMs)) : 1;
}

export async function scanSessionPairs(sessionPath: string): Promise<SessionPairScan> {
  if (!existsSync(sessionPath)) {
    return { pairs: [], idToLineIndex: new Map<string, number>() };
  }

  const raw = await readFile(sessionPath, "utf8").catch(() => "");
  if (!raw) return { pairs: [], idToLineIndex: new Map<string, number>() };

  const lines = raw.split(/\r?\n/);
  const idToLineIndex = new Map<string, number>();
  const pairs: SessionPair[] = [];
  let currentPrompt: SessionPair["prompt"] | undefined;
  let currentResponse: SessionPair["response"] | undefined;
  let lastTimestampMs = 0;

  const pushCurrent = () => {
    if (!currentPrompt) return;
    const latest = currentResponse ?? currentPrompt;
    pairs.push({
      prompt: currentPrompt,
      response: currentResponse,
      latestEntryId: latest.entryId,
      latestTimestamp: latest.timestamp,
      latestTimestampMs: latest.timestampMs,
      latestLineIndex: latest.lineIndex,
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const entry = parseJson<any>(line);
    if (!entry || entry.type !== "message" || !entry.message || typeof entry.message !== "object") continue;
    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;

    const entryId = typeof entry.id === "string" ? entry.id : `line-${index + 1}`;
    const fallbackMs = Math.max(lastTimestampMs + 1, index + 1);
    const timestampMs = Math.max(parseTimestampMs(entry.timestamp, entry.message.timestamp, fallbackMs), fallbackMs);
    const timestamp = toIso(timestampMs);
    lastTimestampMs = timestampMs;
    idToLineIndex.set(entryId, index);

    if (role === "user") {
      pushCurrent();
      currentPrompt = {
        entryId,
        timestamp,
        timestampMs,
        lineIndex: index,
        role,
        text: extractUserText(entry.message.content),
      };
      currentResponse = undefined;
      continue;
    }

    if (!currentPrompt) continue;
    currentResponse = {
      entryId,
      timestamp,
      timestampMs,
      lineIndex: index,
      role,
      text: extractAssistantText(entry.message.content),
    };
  }

  pushCurrent();
  return { pairs, idToLineIndex };
}

function toPairView(pair: SessionPair): PairView {
  return {
    prompt: {
      entry_id: pair.prompt.entryId,
      timestamp: pair.prompt.timestamp,
      text: pair.prompt.text,
    },
    response: pair.response
      ? {
          entry_id: pair.response.entryId,
          timestamp: pair.response.timestamp,
          text: pair.response.text,
        }
      : null,
    latest_entry_id: pair.latestEntryId,
    latest_timestamp: pair.latestTimestamp,
    latest_timestamp_ms: pair.latestTimestampMs,
    pair_key: `${pair.prompt.entryId}:${pair.response?.entryId ?? "pending"}`,
  };
}

export function formatPairBlock(pair: PairView, index?: number) {
  const header = typeof index === "number" ? `Pair ${index + 1}` : "Latest Pair";
  const lines: string[] = [];
  lines.push(header);
  lines.push(`prompt_id: ${pair.prompt.entry_id}`);
  lines.push(`prompt_at: ${pair.prompt.timestamp}`);
  lines.push(`prompt_text: ${clip(pair.prompt.text, 2500)}`);
  if (pair.response) {
    lines.push(`response_id: ${pair.response.entry_id}`);
    lines.push(`response_at: ${pair.response.timestamp}`);
    lines.push(`response_text: ${clip(pair.response.text, 2500)}`);
  } else {
    lines.push("response: [pending - no assistant response yet]");
  }
  lines.push(`latest_entry_id: ${pair.latest_entry_id}`);
  lines.push(`latest_timestamp: ${pair.latest_timestamp}`);
  return lines.join("\n");
}

export async function readLatestPair(targetId: string) {
  const target = await loadTarget(targetId);
  if (!target) throw new Error(`Unknown target: ${targetId}`);
  const scan = await scanSessionPairs(target.sessionPath);
  const pair = scan.pairs.at(-1);
  return { target, latestPair: pair ? toPairView(pair) : null };
}

export async function readTargetTranscript(
  targetId: string,
  options?: { mode?: "full" | "since"; afterEntryId?: string; afterTimestamp?: number; limit?: number },
) {
  const target = await loadTarget(targetId);
  if (!target) throw new Error(`Unknown target: ${targetId}`);

  const mode = options?.mode ?? "full";
  const limit = Math.min(MAX_READ_LIMIT, Math.max(1, options?.limit ?? DEFAULT_READ_LIMIT));
  const { pairs, idToLineIndex } = await scanSessionPairs(target.sessionPath);
  let filteredPairs = pairs;
  let nextAfterEntryId: string | null = null;

  if (mode === "since") {
    filteredPairs = pairs.filter((pair) => {
      if (options?.afterEntryId) {
        const pivot = idToLineIndex.get(options.afterEntryId) ?? -1;
        return pair.latestLineIndex > pivot;
      }
      if (typeof options?.afterTimestamp === "number") {
        return pair.latestTimestampMs > options.afterTimestamp;
      }
      return true;
    });
  }

  if (filteredPairs.length > limit) {
    filteredPairs = filteredPairs.slice(-limit);
  }

  if (filteredPairs.length > 0) {
    nextAfterEntryId = filteredPairs[filteredPairs.length - 1]?.latestEntryId ?? null;
  }

  return {
    target,
    pairs: filteredPairs.map(toPairView),
    nextAfterEntryId,
  };
}
