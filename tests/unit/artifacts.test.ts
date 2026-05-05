import { describe, expect, it } from "vitest";
import type { UiMessage } from "../../src/shared/types";
import { buildArtifactDataUrl, deriveArtifactsFromMessages } from "../../src/surfaces/lib/artifacts";

describe("deriveArtifactsFromMessages", () => {
  it("tracks the latest artifact revision from artifact tool results", () => {
    const messages: UiMessage[] = [
      {
        id: "tool-1",
        role: "toolResult",
        toolName: "artifact",
        content: ['Saved artifact "Quarterly Report" (report) for this chat.'],
        details: {
          artifact: {
            id: "report",
            title: "Quarterly Report",
            summary: "First draft",
            kind: "react-tsx",
            tsx: "export default function ArtifactApp() { return <main>v1</main>; }",
          },
        },
      },
      {
        id: "tool-2",
        role: "toolResult",
        toolName: "artifact",
        content: ['Saved artifact "Quarterly Report" (report) for this chat.'],
        details: {
          artifact: {
            id: "report",
            title: "Quarterly Report",
            summary: "Second draft",
            kind: "react-tsx",
            tsx: "export default function ArtifactApp() { return <main>v2</main>; }",
          },
        },
      },
    ];

    const derived = deriveArtifactsFromMessages(messages);

    expect(derived.messages).toEqual(messages);
    expect(derived.artifacts).toHaveLength(1);
    expect(derived.artifactById.report?.summary).toBe("Second draft");
    expect(derived.artifactById.report?.updatedInMessageId).toBe("tool-2");
    expect(derived.artifactById.report?.revisionCount).toBe(2);
  });

  it("builds a runnable data url for react artifacts", () => {
    const derived = deriveArtifactsFromMessages([
      {
        id: "tool-1",
        role: "toolResult",
        toolName: "artifact",
        content: ['Saved artifact "Viewer" (viewer) for this chat.'],
        details: {
          artifact: {
            id: "viewer",
            title: "Viewer",
            kind: "react-tsx",
            tsx: "export default function ArtifactApp() { return <main>Hello</main>; }",
          },
        },
      },
    ]);

    const artifact = derived.artifactById.viewer;
    if (!artifact) {
      throw new Error("artifact missing");
    }

    const runtime = buildArtifactDataUrl(artifact);
    expect(runtime.errorText).toBeNull();
    expect(runtime.dataUrl?.startsWith("data:text/html")).toBe(true);
  });

  it("ignores non-artifact tool results and malformed artifact payloads", () => {
    const derived = deriveArtifactsFromMessages([
      {
        id: "tool-1",
        role: "toolResult",
        toolName: "browser",
        content: ["Opened the browser."],
      },
      {
        id: "tool-2",
        role: "toolResult",
        toolName: "artifact",
        content: ["Tool finished."],
        details: {
          artifact: {
            id: "",
            title: "",
            kind: "react-tsx",
          },
        },
      },
    ]);

    expect(derived.messages).toHaveLength(2);
    expect(derived.artifacts).toHaveLength(0);
    expect(derived.artifactById).toEqual({});
  });
});
