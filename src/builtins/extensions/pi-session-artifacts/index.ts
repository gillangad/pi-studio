import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export const PI_SESSION_ARTIFACTS_PROMPT = `
Pi Studio session artifacts are a built-in capability in this environment.

Use artifacts when the user asks for a visualization, dashboard, report viewer, interactive summary, custom tool UI, or another durable surface that should live alongside the chat.

Artifact contract:
- Create or update artifacts by emitting a fenced code block whose info string starts with \`pi-artifact\`.
- The canonical form is \`\\\`\\\`pi-artifact\` followed by valid JSON and a closing fence.
- The fenced block body must be valid JSON.
- Include:
  - \`id\`: a stable slug. Reuse the same id to revise an existing artifact. The chat card always points to the latest revision for that id in this session.
  - \`title\`: short human-readable name.
  - \`summary\`: short one-line description.
  - \`kind\`: \`"react-tsx"\` or \`"html"\`.
- For \`kind: "react-tsx"\`, provide \`tsx\` and optionally \`css\` and \`data\`.
- For \`kind: "html"\`, provide \`html\` and optionally \`css\`, \`js\`, and \`data\`.

Authoring guidance:
- Prefer \`react-tsx\` for most artifacts.
- Keep the artifact self-contained and client-side. Do not depend on Node APIs, local files, or arbitrary external packages.
- React artifacts must export a default React component or \`ArtifactApp\`.
- The artifact receives structured payload data as the \`artifact\` prop. The same data is also available as \`window.PI_ARTIFACT_DATA\`.
- Make the UI polished and task-focused. Build the actual tool or visualization, not a placeholder.

Delivery guidance:
- You may write brief explanatory text before or after the artifact block.
- Emit the artifact block directly in the assistant message that creates or revises it.
- When the user asks to tweak an existing artifact, update it by sending a new \`pi-artifact\` block with the same \`id\`.
`.trim();

export function appendArtifactInstructions(systemPrompt: string) {
  return [systemPrompt, "", PI_SESSION_ARTIFACTS_PROMPT].join("\n");
}

export default function sessionArtifactsExtension(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: appendArtifactInstructions(event.systemPrompt),
  }));
}
