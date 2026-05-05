import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

function normalizePrompt(value: string) {
  return value.trim().toLowerCase();
}

function isToolInventoryPrompt(prompt: string) {
  const normalized = normalizePrompt(prompt);
  return (
    /\bwhat\b.*\btools?\b/.test(normalized)
    || /\bwhich\b.*\btools?\b/.test(normalized)
    || /\blist\b.*\btools?\b/.test(normalized)
    || /\bshow\b.*\btools?\b/.test(normalized)
    || /\bwhat can you do\b/.test(normalized)
  );
}

function buildToolInventory(pi: ExtensionAPI) {
  const activeToolNames = pi.getActiveTools();
  const definitions = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));

  const lines = activeToolNames.map((name) => {
    const definition = definitions.get(name);
    const description = definition?.description?.trim() || "No description available.";
    return `- ${name}: ${description}`;
  });

  return lines.join("\n");
}

export default function toolAwarenessExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    if (!isToolInventoryPrompt(event.prompt)) {
      return undefined;
    }

    const toolInventory = buildToolInventory(pi);
    if (!toolInventory) {
      return undefined;
    }

    return {
      systemPrompt: `${event.systemPrompt}\n\nTool inventory note:\nIf the user asks what tools are available, list every active tool exactly once from this session inventory:\n${toolInventory}\nDo not omit an active tool from that list. Do not claim a listed active tool is unavailable.`,
    };
  });
}
