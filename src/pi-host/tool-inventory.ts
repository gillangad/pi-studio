import type { ResourceSummary } from "../shared/types";

type ToolInventorySource = {
  getActiveToolNames?: () => string[];
  getAllTools?: () => Array<{ name: string; description?: string }>;
};

function normalizePrompt(value: string) {
  return value.trim().toLowerCase();
}

export function isToolInventoryPrompt(prompt: string) {
  const normalized = normalizePrompt(prompt);
  return (
    /\bwhat\b.*\btools?\b/.test(normalized)
    || /\bwhich\b.*\btools?\b/.test(normalized)
    || /\blist\b.*\btools?\b/.test(normalized)
    || /\bshow\b.*\btools?\b/.test(normalized)
    || /\bwhat can you do\b/.test(normalized)
  );
}

export function buildToolInventoryAnswer(session: ToolInventorySource, resources: ResourceSummary) {
  const activeToolNames = session.getActiveToolNames?.() ?? [];
  const toolsByName = new Map((session.getAllTools?.() ?? []).map((tool) => [tool.name, tool]));
  const toolLines = activeToolNames.map((toolName) => {
    const description = toolsByName.get(toolName)?.description?.trim() || "No description available.";
    return `- ${toolName} - ${description}`;
  });

  const bundledSkillNames = resources.skillEntries
    .filter((entry) => entry.origin === "bundled")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  const sections = ["I have these tools:", "", ...toolLines];
  if (bundledSkillNames.length > 0) {
    sections.push("", "Loaded Pi Studio skills:", "", ...bundledSkillNames.map((name) => `- ${name}`));
  }

  return sections.join("\n");
}
