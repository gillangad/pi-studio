import { describe, expect, it } from "vitest";
import { buildToolInventoryAnswer, isToolInventoryPrompt } from "../../src/pi-host/tool-inventory";

describe("isToolInventoryPrompt", () => {
  it("matches plain tool inventory questions", () => {
    expect(isToolInventoryPrompt("what tools you got")).toBe(true);
    expect(isToolInventoryPrompt("Which tools are available?")).toBe(true);
    expect(isToolInventoryPrompt("show tools")).toBe(true);
  });

  it("ignores unrelated prompts", () => {
    expect(isToolInventoryPrompt("build me a dashboard")).toBe(false);
    expect(isToolInventoryPrompt("open the browser")).toBe(false);
  });
});

describe("buildToolInventoryAnswer", () => {
  it("lists active tools and bundled skills from runtime state", () => {
    const answer = buildToolInventoryAnswer(
      {
        getActiveToolNames: () => ["read", "browser", "artifact", "control"],
        getAllTools: () => [
          { name: "read", description: "Read file contents." },
          { name: "browser", description: "Control the browser." },
          { name: "artifact", description: "Create artifacts." },
          { name: "control", description: "Control other sessions." },
        ],
      },
      {
        extensions: 3,
        skills: 3,
        prompts: 0,
        themes: 0,
        agentsFiles: 0,
        extensionEntries: [],
        extensionNames: [],
        skillEntries: [
          { name: "pi-browser", path: null, origin: "bundled" },
          { name: "pi-artifacts", path: null, origin: "bundled" },
          { name: "pi-control-session", path: null, origin: "bundled" },
        ],
        skillNames: [],
        promptNames: [],
        themeNames: [],
        agentsFilePaths: [],
      },
    );

    expect(answer).toContain("- control - Control other sessions.");
    expect(answer).toContain("- pi-control-session");
    expect(answer).toContain("- pi-browser");
  });
});
