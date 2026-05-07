import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { ProjectRecord } from "../shared/types";
import type { WorkspaceState } from "./workspace-bootstrap";

const DEFAULT_STATE: WorkspaceState = {
  projects: [],
  activeProjectId: null,
  activeMode: "gui",
  projectFavorites: {},
  threadMetadataByProject: {},
  gitCommentsByProject: {},
  gitBaselineByProject: {},
  studioSessionsByProject: {},
};

export class WorkspaceStore {
  constructor(private readonly filePath: string) {}

  async load() {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
      return {
        projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        activeProjectId: parsed.activeProjectId ?? null,
        activeMode: parsed.activeMode ?? "gui",
        projectFavorites: parsed.projectFavorites ?? {},
        threadMetadataByProject: parsed.threadMetadataByProject ?? {},
        gitCommentsByProject: parsed.gitCommentsByProject ?? {},
        gitBaselineByProject: parsed.gitBaselineByProject ?? {},
        studioSessionsByProject: parsed.studioSessionsByProject ?? {},
      } satisfies WorkspaceState;
    } catch {
      return { ...DEFAULT_STATE };
    }
  }

  async save(state: WorkspaceState) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(state, null, 2), "utf8");
  }

  createProject(projectPath: string): ProjectRecord {
    const normalizedPath = path.resolve(projectPath);
    return {
      id: crypto.createHash("sha1").update(normalizedPath).digest("hex").slice(0, 12),
      name: path.basename(normalizedPath) || normalizedPath,
      path: normalizedPath,
    };
  }
}
