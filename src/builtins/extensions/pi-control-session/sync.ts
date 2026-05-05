import { basename, resolve } from "node:path";
import type { ProjectRecord, ProjectThreadsMap } from "../../../shared/types";
import { readLatestPair } from "./transcript.ts";
import { getStatusRuns, latestRunsMap } from "./runtime.ts";
import { deleteTarget, listTargets, upsertStudioTarget } from "./storage.ts";
import { type ControlDashboardState, type ControlDashboardTarget, formatAgeLabel, type ControlTargetRecord, now, statusIcon } from "./types.ts";

function formatStatusLabel(target: ControlTargetRecord, state: string) {
  if (state === "error" && target.lastError) return `${statusIcon("error")} error`;
  if (state === "running") return `${statusIcon("running")} running`;
  if (state === "queued") return `${statusIcon("queued")} queued`;
  if (state === "done") return `${statusIcon("done")} done`;
  return `${statusIcon("idle")} ready`;
}

export async function syncStudioTargets(projects: ProjectRecord[], threadsByProject: ProjectThreadsMap) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const existingTargets = await listTargets();
  const seenPaths = new Set<string>();

  for (const [projectId, threads] of Object.entries(threadsByProject)) {
    const project = projectById.get(projectId);
    if (!project) continue;
    for (const thread of threads) {
      seenPaths.add(resolve(thread.sessionFile));
      await upsertStudioTarget(project.id, project.name, project.path, thread.sessionFile, thread.title, thread.updatedAtMs);
    }
  }

  for (const target of existingTargets) {
    if (target.source !== "studio") continue;
    if (seenPaths.has(resolve(target.sessionPath))) continue;
    await deleteTarget(target.targetId);
  }
}

export async function getDashboardState(): Promise<ControlDashboardState> {
  const targets = await listTargets();
  const latestRuns = await latestRunsMap();
  const dashboardTargets = [];

  for (const target of targets) {
    const run = latestRuns.get(target.targetId);
    const latest = await readLatestPair(target.targetId).catch(() => ({ latestPair: null }));
    const latestTimestampMs = latest.latestPair?.latest_timestamp_ms ?? target.threadUpdatedAtMs ?? null;
    const lastActivityMs = latestTimestampMs ?? run?.updatedAt ?? target.updatedAt;
    const status: ControlDashboardTarget["status"] = run?.state ?? (target.lastError ? "error" : "idle");

    dashboardTargets.push({
      targetId: target.targetId,
      name: target.name,
      projectId: target.projectId ?? null,
      projectName: target.projectName ?? basename(target.projectPath),
      projectPath: target.projectPath,
      sessionPath: target.sessionPath,
      sessionTitle: target.sessionTitle ?? target.name,
      status,
      statusLabel: formatStatusLabel(target, status),
      lastRunId: run?.runId ?? target.lastRunId ?? null,
      lastError: run?.error ?? target.lastError ?? null,
      latestPrompt: latest.latestPair?.prompt.text ?? null,
      latestResponse: latest.latestPair?.response?.text ?? null,
      latestTimestampMs,
      latestTimestamp: latest.latestPair?.latest_timestamp ?? null,
      lastActivityLabel: formatAgeLabel(lastActivityMs),
    });
  }

  dashboardTargets.sort((left, right) => {
    const leftRank = left.status === "running" ? 3 : left.status === "error" ? 2 : left.status === "queued" ? 1 : 0;
    const rightRank = right.status === "running" ? 3 : right.status === "error" ? 2 : right.status === "queued" ? 1 : 0;
    if (leftRank !== rightRank) return rightRank - leftRank;
    return (right.latestTimestampMs ?? 0) - (left.latestTimestampMs ?? 0);
  });

  return {
    targets: dashboardTargets,
    summary: {
      totalTargets: dashboardTargets.length,
      activeTargets: dashboardTargets.filter((target) => target.status === "running").length,
      errorTargets: dashboardTargets.filter((target) => target.status === "error" || target.status === "timeout").length,
      pendingTargets: dashboardTargets.filter((target) => target.status === "queued").length,
    },
    updatedAt: now(),
  };
}

export async function buildMasterContext(limit = 16) {
  const dashboard = await getDashboardState();
  if (dashboard.targets.length === 0) {
    return [
      "CONTROL SESSION MODE",
      "You are the single persistent master Pi session for Pi Studio.",
      "There are currently no managed servant sessions available.",
      "Use control(action=list) to check again later.",
    ].join("\n");
  }

  const lines = dashboard.targets.slice(0, limit).map((target, index) => {
    const parts = [
      `${index + 1}. ${target.name}`,
      `target_id=${target.targetId}`,
      `project=${target.projectName}`,
      `status=${target.status}`,
    ];
    if (target.latestResponse) {
      parts.push(`latest="${target.latestResponse.replace(/\s+/g, " ").slice(0, 120)}"`);
    }
    return parts.join(" | ");
  });

  return [
    "CONTROL SESSION MODE",
    "You are the single persistent master Pi session for Pi Studio.",
    "Use the control tool to steer servant sessions across projects.",
    "action=send writes a real user-role prompt into the servant session.",
    "Prefer action=latest for quick previews and action=read only when you need deeper catch-up.",
    "",
    "Managed servant sessions:",
    ...lines,
  ].join("\n");
}

export async function formatTargetListText(targetIds?: string[]) {
  const targets = await listTargets();
  const latestRuns = await getStatusRuns({ targetIds });
  const latestByTarget = new Map(latestRuns.map((run) => [run.targetId, run]));
  const visibleTargets = targetIds && targetIds.length > 0 ? targets.filter((target) => targetIds.includes(target.targetId)) : targets;

  if (visibleTargets.length === 0) return "No managed targets.";
  return visibleTargets
    .map((target) => {
      const run = latestByTarget.get(target.targetId);
      const state = run?.state ?? (target.lastError ? "error" : "idle");
      return `${statusIcon(state)} ${target.name} | id=${target.targetId} | project=${target.projectName ?? basename(target.projectPath)} | session=${target.sessionTitle ?? basename(target.sessionPath)}`;
    })
    .join("\n");
}
