import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const ArtifactParams = Type.Object({
  id: Type.String({
    minLength: 1,
    maxLength: 80,
    description: "Stable artifact id, for example expense-tracker or q2-report-explorer.",
  }),
  title: Type.String({
    minLength: 1,
    maxLength: 120,
    description: "Short artifact title shown in the Pi Studio artifact sidebar.",
  }),
  summary: Type.Optional(
    Type.String({
      maxLength: 240,
      description: "Short one-line summary for the artifact sidebar.",
    }),
  ),
  kind: Type.Union([Type.Literal("react-tsx"), Type.Literal("html")]),
  tsx: Type.Optional(Type.String({ description: "React + TSX source when kind is react-tsx." })),
  html: Type.Optional(Type.String({ description: "HTML source when kind is html." })),
  css: Type.Optional(Type.String({ description: "Optional CSS for the artifact runtime." })),
  js: Type.Optional(Type.String({ description: "Optional module script for html artifacts." })),
  data: Type.Optional(Type.Any({ description: "Optional structured JSON payload exposed to the artifact." })),
});

function ensureToolActive(pi: ExtensionAPI, toolName: string) {
  const active = pi.getActiveTools();
  if (active.includes(toolName)) {
    return;
  }

  pi.setActiveTools([...active, toolName]);
}

function normalizeText(value: string | undefined) {
  return value?.trim() ?? "";
}

export default function artifactsExtension(pi: ExtensionAPI) {
  pi.on("session_start", async () => {
    ensureToolActive(pi, "artifact");
  });

  pi.registerTool({
    name: "artifact",
    label: "Artifact",
    description: "Create or update a Pi Studio artifact for the current chat sidebar.",
    promptSnippet: "Create or update a Pi Studio artifact in the current chat sidebar.",
    promptGuidelines: [
      "Use this tool when the user asks for a Pi Studio artifact, dashboard, mini app, explorer, or custom sidebar surface.",
      "Pass the full artifact implementation through this tool instead of printing artifact JSON in the assistant message.",
      "Reuse the same artifact id to revise an existing artifact in the current chat.",
    ],
    parameters: ArtifactParams,
    async execute(_toolCallId, params) {
      const title = normalizeText(params.title);
      const summary = normalizeText(params.summary);
      const css = params.css ?? "";
      const js = params.js ?? "";
      const tsx = normalizeText(params.tsx);
      const html = normalizeText(params.html);

      if (params.kind === "react-tsx" && !tsx) {
        throw new Error("React artifacts require a non-empty tsx field.");
      }

      if (params.kind === "html" && !html) {
        throw new Error("HTML artifacts require a non-empty html field.");
      }

      return {
        content: [
          {
            type: "text",
            text: `Saved artifact "${title}" (${params.id}) for this chat.`,
          },
        ],
        details: {
          artifact: {
            id: params.id,
            title,
            summary,
            kind: params.kind,
            tsx: params.kind === "react-tsx" ? tsx : null,
            html: params.kind === "html" ? html : null,
            css,
            js,
            data: params.data ?? null,
          },
        },
      };
    },
  });
}
