import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { discoverBuiltinExtensionPaths } from "../../src/pi-host/builtin-resources";

describe("discoverBuiltinExtensionPaths", () => {
  it("discovers one-folder builtins by index entrypoint", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-studio-builtins-"));

    const extensionDir = path.join(root, "pi-browser");
    await mkdir(extensionDir, { recursive: true });
    await writeFile(path.join(extensionDir, "index.ts"), "export default function () {}", "utf8");

    await mkdir(path.join(root, ".ignored"), { recursive: true });
    await writeFile(path.join(root, ".ignored", "index.ts"), "export default function () {}", "utf8");

    const discovered = await discoverBuiltinExtensionPaths(root);

    expect(discovered).toEqual([path.join(extensionDir, "index.ts")]);
  });

  it("resolves manifest-declared entrypoints", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "pi-studio-builtins-"));

    const packageDir = path.join(root, "with-manifest");
    await mkdir(path.join(packageDir, "src"), { recursive: true });
    await writeFile(
      path.join(packageDir, "package.json"),
      JSON.stringify({
        name: "with-manifest",
        pi: {
          extensions: ["./src/index.ts"],
        },
      }),
      "utf8",
    );
    await writeFile(path.join(packageDir, "src", "index.ts"), "export default function () {}", "utf8");

    const discovered = await discoverBuiltinExtensionPaths(root);

    expect(discovered).toEqual([path.join(packageDir, "src", "index.ts")]);
  });
});
