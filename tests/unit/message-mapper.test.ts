import { describe, expect, it } from "vitest";
import { mapAgentMessages, mapResourceSummary } from "../../src/pi-host/message-mapper";

describe("mapAgentMessages", () => {
  it("maps assistant messages with thinking blocks", () => {
    const messages = mapAgentMessages([
      {
        role: "assistant",
        timestamp: 1,
        content: [
          { type: "thinking", thinking: "# Planning\n\nFirst think." },
          { type: "text", text: "Final answer." },
        ],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "assistant",
      content: ["Final answer."],
      thinkingHeaders: ["Planning"],
    });
  });

  it("collapses incremental duplicate thinking blocks", () => {
    const messages = mapAgentMessages([
      {
        role: "assistant",
        timestamp: 2,
        content: [
          { type: "thinking", thinking: "The path might be different." },
          {
            type: "thinking",
            thinking:
              "The path might be different. Let me try to find the code-reference folder in another location.",
          },
          { type: "text", text: "I found it." },
        ],
      },
    ]);

    expect(messages).toHaveLength(1);
    expect(messages[0].thinkingContent).toEqual([
      "The path might be different. Let me try to find the code-reference folder in another location.",
    ]);
  });

  it("maps tool results into visible UI cards", () => {
    const messages = mapAgentMessages([
      {
        role: "toolResult",
        timestamp: 2,
        toolName: "read",
        content: [{ type: "text", text: "done" }],
      },
    ]);

    expect(messages[0]).toMatchObject({
      role: "toolResult",
      toolName: "read",
      content: ["done"],
    });
  });

  it("preserves tool details for edit-style results", () => {
    const messages = mapAgentMessages([
      {
        role: "toolResult",
        timestamp: 3,
        toolName: "edit",
        content: [{ type: "text", text: "Successfully replaced 1 block(s) in src/file.ts." }],
        details: {
          diff: "-old\n+new",
          firstChangedLine: 12,
        },
      },
    ]);

    expect(messages[0]).toMatchObject({
      role: "toolResult",
      toolName: "edit",
      toolDetails: {
        diff: "-old\n+new",
        firstChangedLine: 12,
      },
    });
  });

  it("classifies bundled and user-installed resources for settings", () => {
    const summary = mapResourceSummary({
      extensions: [
        { name: "pi-control-session", path: "/home/test/.pi-studio/builtins/extensions/pi-control-session" },
        { name: "user-helper", path: "/home/test/.pi/agent/extensions/user-helper" },
      ],
      skills: [
        { name: "pi-control-session", path: "/home/test/.pi-studio/builtins/skills/pi-control-session/SKILL.md" },
        { name: "custom-writer", path: "/home/test/.pi/agent/skills/custom-writer/SKILL.md" },
      ],
    });

    expect(summary.extensionEntries).toEqual([
      {
        name: "pi-control-session",
        path: "/home/test/.pi-studio/builtins/extensions/pi-control-session",
        origin: "bundled",
      },
      {
        name: "user-helper",
        path: "/home/test/.pi/agent/extensions/user-helper",
        origin: "userInstalled",
      },
    ]);
    expect(summary.skillEntries).toEqual([
      {
        name: "pi-control-session",
        path: "/home/test/.pi-studio/builtins/skills/pi-control-session/SKILL.md",
        origin: "bundled",
      },
      {
        name: "custom-writer",
        path: "/home/test/.pi/agent/skills/custom-writer/SKILL.md",
        origin: "userInstalled",
      },
    ]);
  });
});
