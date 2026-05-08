import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { WorkspaceStore } from "../../src/pi-host/workspace-store";

describe("WorkspaceStore", () => {
  it("creates stable project ids from absolute paths", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-studio-store-"));
    const store = new WorkspaceStore(path.join(tempDir, "workspace.json"));

    const projectA = store.createProject("/tmp/example");
    const projectB = store.createProject("/tmp/example");

    expect(projectA.id).toBe(projectB.id);
    expect(projectA.name).toBe("example");
  });

  it("persists workspace state to disk", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "pi-studio-store-"));
    const filePath = path.join(tempDir, "workspace.json");
    const store = new WorkspaceStore(filePath);

    await store.save({
      projects: [store.createProject("/tmp/demo")],
      activeProjectId: "demo",
      activeMode: "gui",
      masterSessionPath: null,
      projectFavorites: {},
      threadMetadataByProject: {},
      gitCommentsByProject: {},
      gitBaselineByProject: {},
      studioSessionsByProject: {},
    });

    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain("\"activeMode\": \"gui\"");
  });
});
