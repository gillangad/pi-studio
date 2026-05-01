import type { GuiState, UiMessage } from "../../shared/types";

function labelForRole(message: UiMessage) {
  switch (message.role) {
    case "user":
      return "user";
    case "assistant":
      return "pi";
    case "toolResult":
      return message.toolName ? `tool:${message.toolName}` : "tool";
    case "bashExecution":
      return message.command ? `bash:${message.command}` : "bash";
    case "branchSummary":
      return "branch";
    case "compactionSummary":
      return "compaction";
    case "system":
      return "system";
    case "custom":
      return message.customType ? `custom:${message.customType}` : "custom";
    default:
      return "pi";
  }
}

function cleanLines(lines: string[]) {
  return lines
    .map((line) => line.replace(/\r/g, "").trimEnd())
    .join("\n")
    .trim();
}

function renderMessage(message: UiMessage) {
  const body = cleanLines(message.content);
  const thinking = cleanLines(message.thinkingContent ?? []);
  const output = cleanLines(message.output ?? []);
  const sections: string[] = [];

  if (body) {
    sections.push(body);
  }

  if (thinking) {
    sections.push(`[thinking]\n${thinking}`);
  }

  if (output) {
    sections.push(`[output]\n${output}`);
  }

  if (message.artifactRefs?.length) {
    sections.push(
      message.artifactRefs
        .map((artifact) => {
          const summary = artifact.summary ? ` - ${artifact.summary}` : "";
          return `[artifact] ${artifact.title}${summary}`;
        })
        .join("\n"),
    );
  }

  const joined = sections.filter(Boolean).join("\n\n");
  return joined ? `${labelForRole(message)}> ${joined}` : `${labelForRole(message)}>`;
}

export function buildTuiTranscript(gui: GuiState, draft: string) {
  const lines: string[] = [
    "Pi Studio TUI",
    "",
    `thread: ${gui.sessionTitle || "New thread"}`,
    `cwd: ${gui.cwd || "No project"}`,
    gui.model ? `model: ${gui.model.provider}/${gui.model.id} (${gui.thinkingLevel})` : `thinking: ${gui.thinkingLevel}`,
  ];

  if (gui.statusText) {
    lines.push(`status: ${gui.statusText}`);
  } else if (gui.isStreaming) {
    lines.push("status: generating");
  }

  if (gui.errorText) {
    lines.push(`error: ${gui.errorText}`);
  }

  lines.push("", "----------------------------------------", "");

  if (gui.messages.length === 0) {
    lines.push("pi> Start a Pi session by typing below.");
  } else {
    for (const message of gui.messages) {
      lines.push(renderMessage(message), "");
    }
  }

  lines.push("----------------------------------------");
  lines.push(gui.isStreaming ? "pi is busy. Ctrl+C aborts the current run." : "Enter submits. Ctrl+C clears the current line.");
  lines.push("");
  lines.push(`> ${draft}`);

  return `${lines.join("\n")}\n`;
}
