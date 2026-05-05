import { describe, expect, it } from "vitest";
import type { UiMessage } from "../../src/shared/types";
import { buildArtifactDataUrl, deriveArtifactsFromMessages } from "../../src/surfaces/lib/artifacts";

describe("deriveArtifactsFromMessages", () => {
  it("strips artifact blocks from message markdown and tracks the latest artifact revision", () => {
    const messages: UiMessage[] = [
      {
        id: "a1",
        role: "assistant",
        content: [
          [
            "Here is the first artifact.",
            "",
            "```pi-artifact",
            JSON.stringify(
              {
                id: "report",
                title: "Quarterly Report",
                summary: "First draft",
                kind: "react-tsx",
                tsx: "export default function ArtifactApp() { return <main>v1</main>; }",
              },
              null,
              2,
            ),
            "```",
          ].join("\n"),
        ],
      },
      {
        id: "a2",
        role: "assistant",
        content: [
          [
            "Updated the report view.",
            "",
            "```pi-artifact",
            JSON.stringify(
              {
                id: "report",
                title: "Quarterly Report",
                summary: "Second draft",
                kind: "react-tsx",
                tsx: "export default function ArtifactApp() { return <main>v2</main>; }",
              },
              null,
              2,
            ),
            "```",
          ].join("\n"),
        ],
      },
    ];

    const derived = deriveArtifactsFromMessages(messages);

    expect(derived.messages[0]?.content.join("\n")).toContain("Here is the first artifact.");
    expect(derived.messages[0]?.content.join("\n")).not.toContain("```pi-artifact");
    expect(derived.messages[0]?.artifactRefs?.[0]?.artifactId).toBe("report");
    expect(derived.artifacts).toHaveLength(1);
    expect(derived.artifactById.report?.summary).toBe("Second draft");
    expect(derived.artifactById.report?.updatedInMessageId).toBe("a2");
    expect(derived.artifactById.report?.revisionCount).toBe(2);
  });

  it("builds a runnable data url for react artifacts", () => {
    const derived = deriveArtifactsFromMessages([
      {
        id: "a1",
        role: "assistant",
        content: [
          [
            "```pi-artifact",
            JSON.stringify(
              {
                id: "viewer",
                title: "Viewer",
                kind: "react-tsx",
                tsx: "export default function ArtifactApp() { return <main>Hello</main>; }",
              },
              null,
              2,
            ),
            "```",
          ].join("\n"),
        ],
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

  it("recovers an artifact from a bare JSON payload when the fence is missing", () => {
    const derived = deriveArtifactsFromMessages([
      {
        id: "a3",
        role: "assistant",
        content: [
          [
            "The artifact has been created. Let me emit it directly in this response:",
            "",
            JSON.stringify(
              {
                id: "artifact-capability-check",
                title: "Artifact Capability Check",
                summary: "Checks artifact output.",
                kind: "react-tsx",
                data: {
                  items: ["one", "two", "three"],
                  success: true,
                },
                tsx: "export default function ArtifactApp() { return <main>ok</main>; }",
              },
              null,
              2,
            ),
          ].join("\n"),
        ],
      },
    ]);

    expect(derived.artifacts).toHaveLength(1);
    expect(derived.artifactById["artifact-capability-check"]?.title).toBe("Artifact Capability Check");
    expect(derived.messages[0]?.artifactRefs?.[0]?.artifactId).toBe("artifact-capability-check");
    expect(derived.messages[0]?.content.join("\n")).not.toContain("\"kind\": \"react-tsx\"");
    expect(derived.messages[0]?.content.join("\n")).toContain("The artifact has been created.");
  });
});
