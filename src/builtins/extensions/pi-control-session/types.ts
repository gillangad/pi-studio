import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { getAgentDir } from "@mariozechner/pi-coding-agent";

export type ControlRunState = "idle" | "queued" | "running" | "done" | "error" | "cancelled" | "timeout";

export type ControlTargetRecord = {
  targetId: string;
  name: string;
  projectId?: string;
  projectName?: string;
  projectPath: string;
  sessionPath: string;
  sessionTitle?: string;
  source: "studio" | "manual";
  createdAt: number;
  updatedAt: number;
  lastRunId?: string;
  lastError?: string;
  lastSyncedAt?: number;
  threadUpdatedAtMs?: number;
};

export type ControlRunRecord = {
  runId: string;
  targetId: string;
  targetName: string;
  projectPath: string;
  sessionPath: string;
  state: Exclude<ControlRunState, "idle">;
  promptPreview: string;
  modelArg?: string;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  timeoutSeconds: number;
  error?: string;
  cancelReason?: string;
};

export type ControlDashboardTarget = {
  targetId: string;
  name: string;
  projectId: string | null;
  projectName: string;
  projectPath: string;
  sessionPath: string;
  sessionTitle: string;
  status: ControlRunState;
  statusLabel: string;
  lastRunId: string | null;
  lastError: string | null;
  latestPrompt: string | null;
  latestResponse: string | null;
  latestTimestampMs: number | null;
  latestTimestamp: string | null;
  lastActivityLabel: string;
};

export type ControlDashboardState = {
  targets: ControlDashboardTarget[];
  summary: {
    totalTargets: number;
    activeTargets: number;
    errorTargets: number;
    pendingTargets: number;
  };
  updatedAt: number;
};

export type SessionMessageEntry = {
  entryId: string;
  timestamp: string;
  timestampMs: number;
  lineIndex: number;
  role: "user" | "assistant";
  text: string;
};

export type SessionPair = {
  prompt: SessionMessageEntry;
  response?: SessionMessageEntry;
  latestEntryId: string;
  latestTimestamp: string;
  latestTimestampMs: number;
  latestLineIndex: number;
};

export type SessionPairScan = {
  pairs: SessionPair[];
  idToLineIndex: Map<string, number>;
};

export type PairView = {
  prompt: {
    entry_id: string;
    timestamp: string;
    text: string;
  };
  response: {
    entry_id: string;
    timestamp: string;
    text: string;
  } | null;
  latest_entry_id: string;
  latest_timestamp: string;
  latest_timestamp_ms: number;
  pair_key: string;
};

export type RunPromptOptions = {
  projectPath: string;
  sessionPath: string;
  prompt: string;
  timeoutSeconds: number;
  modelArg?: string;
  sessionName?: string;
  signal?: AbortSignal;
};

export type RpcResponse = {
  type: "response";
  id?: string;
  success?: boolean;
  data?: unknown;
  error?: string;
};

export const CONTROL_ROOT = join(getAgentDir(), "control-session");
export const TARGETS_DIR = join(CONTROL_ROOT, "targets");
export const RUNS_DIR = join(CONTROL_ROOT, "runs");
export const PI_BINARY = (process.env.PI_CONTROL_SESSION_PI_BIN ?? "pi").trim() || "pi";
export const DEFAULT_TIMEOUT_SECONDS = 1800;
export const DEFAULT_READ_LIMIT = 80;
export const MAX_READ_LIMIT = 400;

export function now() {
  return Date.now();
}

export function toIso(ms: number) {
  return new Date(ms).toISOString();
}

export function clip(text: string, max = 3000) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

export function optionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function nonEmptyString(value: unknown, fieldName: string) {
  if (typeof value !== "string") throw new Error(`${fieldName} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${fieldName} must not be empty`);
  return trimmed;
}

export function uniqueIds(values: unknown[]) {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  )];
}

export function normalizeProjectPath(input: unknown, cwd: string) {
  const raw = nonEmptyString(input, "project_path");
  return resolve(cwd, raw);
}

export function normalizeSessionPath(projectPath: string, sessionPath: string) {
  return resolve(projectPath, sessionPath);
}

export function targetFilePath(targetId: string) {
  return join(TARGETS_DIR, `${targetId}.json`);
}

export function runFilePath(runId: string) {
  return join(RUNS_DIR, `${runId}.json`);
}

export function createManualTargetId() {
  return `target_${randomUUID().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function createRunId() {
  return `run_${randomUUID().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

export function createStudioTargetId(projectId: string, sessionPath: string) {
  const hash = createHash("sha1").update(`${projectId}:${resolve(sessionPath)}`).digest("hex").slice(0, 16);
  return `studio_${hash}`;
}

export function statusIcon(state: ControlRunState) {
  switch (state) {
    case "idle":
    case "queued":
      return "○";
    case "running":
      return "⏳";
    case "done":
      return "✓";
    case "cancelled":
      return "⊘";
    case "timeout":
      return "⌛";
    case "error":
      return "✗";
  }
}

export function formatAgeLabel(timestampMs: number | null) {
  if (!timestampMs) return "never";
  const diffMs = Math.max(0, now() - timestampMs);
  const diffMinutes = Math.floor(diffMs / 60_000);
  if (diffMinutes < 1) return "now";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  return `${Math.floor(diffHours / 24)}d`;
}

export function isTerminal(state: ControlRunRecord["state"]) {
  return state === "done" || state === "error" || state === "cancelled" || state === "timeout";
}
