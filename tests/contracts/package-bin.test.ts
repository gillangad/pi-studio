import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("package bin entries", () => {
  it("exposes only the pistudio command", async () => {
    const packageJsonPath = path.resolve(process.cwd(), "package.json");
    const raw = await readFile(packageJsonPath, "utf8");
    const pkg = JSON.parse(raw) as {
      bin?: Record<string, string>;
    };

    expect(pkg.bin?.pistudio).toBe("./bin/pistudio.js");
    expect(pkg.bin?.piestudio).toBeUndefined();
  });
});
