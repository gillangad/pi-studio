import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolvePreloadScriptPath } from "../../src/shell/main/preload-path";

describe("resolvePreloadScriptPath", () => {
  it("prefers index.js when present", () => {
    const currentDir = path.join("/workspace", "out", "main");
    const resolved = resolvePreloadScriptPath(currentDir, (targetPath) => targetPath.endsWith("index.js"));

    expect(resolved).toBe(path.join(currentDir, "../preload/index.js"));
  });

  it("falls back to index.mjs when index.js is missing", () => {
    const currentDir = path.join("/workspace", "out", "main");
    const resolved = resolvePreloadScriptPath(currentDir, () => false);

    expect(resolved).toBe(path.join(currentDir, "../preload/index.mjs"));
  });
});
