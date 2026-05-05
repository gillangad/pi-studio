import ts from "typescript";
import type { UiArtifactReference, UiMessage } from "../../shared/types";

const ARTIFACT_BLOCK_PATTERN = /```pi-artifact(?:-[\w-]+)?\s*\n([\s\S]*?)```/g;
const REACT_IMPORT_SPECIFIER = "https://esm.sh/react@19.1.0";
const REACT_DOM_CLIENT_IMPORT_SPECIFIER = "https://esm.sh/react-dom@19.1.0/client";
const REACT_JSX_RUNTIME_IMPORT_SPECIFIER = "https://esm.sh/react@19.1.0/jsx-runtime";
const REACT_JSX_DEV_RUNTIME_IMPORT_SPECIFIER = "https://esm.sh/react@19.1.0/jsx-dev-runtime";

export type SessionArtifactKind = "react-tsx" | "html";

type ArtifactPayload = {
  id?: string;
  title?: string;
  summary?: string;
  kind?: unknown;
  tsx?: unknown;
  html?: unknown;
  css?: unknown;
  js?: unknown;
  data?: unknown;
};

export type SessionArtifact = {
  artifactId: string;
  title: string;
  summary: string;
  kind: SessionArtifactKind;
  tsx: string | null;
  html: string | null;
  css: string;
  js: string;
  data: unknown;
  createdInMessageId: string;
  updatedInMessageId: string;
  createdAt?: string | number;
  updatedAt?: string | number;
  revisionCount: number;
  updatedSequence: number;
};

export type DerivedArtifactState = {
  messages: UiMessage[];
  artifacts: SessionArtifact[];
  artifactById: Record<string, SessionArtifact>;
};

type ParsedArtifactBlock = {
  artifactId: string;
  title: string;
  summary: string;
  kind: SessionArtifactKind;
  tsx: string | null;
  html: string | null;
  css: string;
  js: string;
  data: unknown;
};

type ArtifactDocumentResult = {
  html: string;
  errorText: string | null;
};

function normalizeTextBlock(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/^\s+|\s+$/g, "");
}

function normalizeDisplayContent(text: string) {
  const normalized = normalizeTextBlock(text);
  return normalized ? [normalized] : [];
}

function slugifyArtifactId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return normalized || null;
}

function inferArtifactKind(payload: ArtifactPayload): SessionArtifactKind | null {
  if (payload.kind === "html") return "html";
  if (payload.kind === "react-tsx") return "react-tsx";
  if (typeof payload.html === "string" && payload.html.trim()) return "html";
  if (typeof payload.tsx === "string" && payload.tsx.trim()) return "react-tsx";
  return null;
}

function parseArtifactPayload(
  rawJson: string,
  messageId: string,
  index: number,
): ParsedArtifactBlock | null {
  try {
    const parsed = JSON.parse(rawJson) as ArtifactPayload;
    const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
    const kind = inferArtifactKind(parsed);

    if (!title || !kind) {
      return null;
    }

    const explicitId =
      typeof parsed.id === "string" && parsed.id.trim()
        ? slugifyArtifactId(parsed.id)
        : null;
    const artifactId = explicitId ?? `artifact-${slugifyArtifactId(messageId) ?? messageId}-${index + 1}`;

    return {
      artifactId,
      title,
      summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
      kind,
      tsx: typeof parsed.tsx === "string" && parsed.tsx.trim() ? parsed.tsx : null,
      html: typeof parsed.html === "string" && parsed.html.trim() ? parsed.html : null,
      css: typeof parsed.css === "string" ? parsed.css : "",
      js: typeof parsed.js === "string" ? parsed.js : "",
      data: parsed.data,
    };
  } catch {
    return null;
  }
}

type JsonObjectSpan = {
  start: number;
  end: number;
  rawJson: string;
};

function extractTopLevelJsonObjects(text: string) {
  const results: JsonObjectSpan[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === undefined) continue;

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (character === "\\") {
        escaped = true;
        continue;
      }

      if (character === "\"") {
        inString = false;
      }
      continue;
    }

    if (character === "\"") {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
      continue;
    }

    if (character === "}") {
      if (depth === 0) {
        continue;
      }

      depth -= 1;
      if (depth === 0 && start >= 0) {
        results.push({
          start,
          end: index + 1,
          rawJson: text.slice(start, index + 1),
        });
        start = -1;
      }
    }
  }

  return results;
}

function extractLooseArtifacts(rawContent: string, messageId: string) {
  const artifactRefs: UiArtifactReference[] = [];
  const artifacts: ParsedArtifactBlock[] = [];
  const cleanedParts: string[] = [];
  const matches: Array<JsonObjectSpan & { artifact: ParsedArtifactBlock }> = [];

  for (const candidate of extractTopLevelJsonObjects(rawContent)) {
    const artifact = parseArtifactPayload(candidate.rawJson, messageId, matches.length);
    if (!artifact) {
      continue;
    }

    matches.push({
      ...candidate,
      artifact,
    });
  }

  if (matches.length === 0) {
    return {
      artifactRefs,
      displayContent: normalizeDisplayContent(rawContent),
      artifacts,
    };
  }

  let lastIndex = 0;
  for (const match of matches) {
    cleanedParts.push(rawContent.slice(lastIndex, match.start));
    lastIndex = match.end;
    artifacts.push(match.artifact);
    artifactRefs.push({
      artifactId: match.artifact.artifactId,
      title: match.artifact.title,
      summary: match.artifact.summary,
      kind: match.artifact.kind,
    });
  }

  cleanedParts.push(rawContent.slice(lastIndex));

  return {
    artifactRefs,
    displayContent: normalizeDisplayContent(cleanedParts.join("").replace(/\n{3,}/g, "\n\n")),
    artifacts,
  };
}

function extractArtifactsFromMessage(message: UiMessage) {
  if (message.content.length === 0) {
    return {
      artifactRefs: [] as UiArtifactReference[],
      displayContent: message.content,
      artifacts: [] as ParsedArtifactBlock[],
    };
  }

  const rawContent = message.content.join("\n\n");
  const artifactRefs: UiArtifactReference[] = [];
  const artifacts: ParsedArtifactBlock[] = [];
  const cleanedParts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let artifactIndex = 0;

  ARTIFACT_BLOCK_PATTERN.lastIndex = 0;

  while ((match = ARTIFACT_BLOCK_PATTERN.exec(rawContent))) {
    const artifact = parseArtifactPayload(match[1] ?? "", message.id, artifactIndex);
    artifactIndex += 1;
    if (!artifact) {
      continue;
    }

    cleanedParts.push(rawContent.slice(lastIndex, match.index));
    lastIndex = match.index + match[0].length;
    artifacts.push(artifact);
    artifactRefs.push({
      artifactId: artifact.artifactId,
      title: artifact.title,
      summary: artifact.summary,
      kind: artifact.kind,
    });
  }

  if (artifacts.length === 0) {
    return extractLooseArtifacts(rawContent, message.id);
  }

  cleanedParts.push(rawContent.slice(lastIndex));
  const displayContent = normalizeDisplayContent(cleanedParts.join("").replace(/\n{3,}/g, "\n\n"));

  return {
    artifactRefs,
    displayContent,
    artifacts,
  };
}

function rewriteReactImports(code: string) {
  return code
    .replaceAll(/from\s+["']react["']/g, `from "${REACT_IMPORT_SPECIFIER}"`)
    .replaceAll(/from\s+["']react\/jsx-runtime["']/g, `from "${REACT_JSX_RUNTIME_IMPORT_SPECIFIER}"`)
    .replaceAll(/from\s+["']react\/jsx-dev-runtime["']/g, `from "${REACT_JSX_DEV_RUNTIME_IMPORT_SPECIFIER}"`)
    .replaceAll(/from\s+["']react-dom\/client["']/g, `from "${REACT_DOM_CLIENT_IMPORT_SPECIFIER}"`);
}

function buildReactArtifactDocument(artifact: SessionArtifact): ArtifactDocumentResult {
  if (!artifact.tsx) {
    return {
      html: "",
      errorText: "This artifact is missing its TSX source.",
    };
  }

  try {
    const transpiled = ts.transpileModule(artifact.tsx, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
        allowSyntheticDefaultImports: true,
        esModuleInterop: true,
      },
      fileName: `${artifact.artifactId}.tsx`,
      reportDiagnostics: false,
    }).outputText;

    const moduleSource = rewriteReactImports(transpiled);

    return {
      errorText: null,
      html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "Segoe UI", system-ui, sans-serif;
      }

      html,
      body,
      #root {
        width: 100%;
        height: 100%;
      }

      body {
        margin: 0;
        background: #101114;
        color: #f5f6f8;
      }

      * {
        box-sizing: border-box;
      }

      ${artifact.css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.PI_ARTIFACT_DATA = ${JSON.stringify(artifact.data ?? null)};
    </script>
    <script type="module">
      const source = ${JSON.stringify(moduleSource)};
      const moduleUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));

      try {
        const [{ default: ArtifactComponent, ArtifactApp }, React, ReactDomClient] = await Promise.all([
          import(moduleUrl),
          import(${JSON.stringify(REACT_IMPORT_SPECIFIER)}),
          import(${JSON.stringify(REACT_DOM_CLIENT_IMPORT_SPECIFIER)}),
        ]);

        const App = ArtifactComponent ?? ArtifactApp;
        if (!App) {
          throw new Error("Artifact modules must export a default React component or ArtifactApp.");
        }

        const root = ReactDomClient.createRoot(document.getElementById("root"));
        root.render(React.createElement(App, { artifact: window.PI_ARTIFACT_DATA }));
      } catch (error) {
        const element = document.getElementById("root");
        if (element) {
          element.innerHTML = "";
          const panel = document.createElement("div");
          panel.style.padding = "16px";
          panel.style.margin = "16px";
          panel.style.borderRadius = "14px";
          panel.style.border = "1px solid rgba(255,255,255,0.12)";
          panel.style.background = "rgba(255,255,255,0.04)";
          panel.style.fontSize = "14px";
          panel.innerHTML = "<strong>Artifact failed to run.</strong><div style=\\"margin-top:8px;opacity:0.8\\"></div>";
          panel.querySelector("div").textContent = error instanceof Error ? error.message : String(error);
          element.appendChild(panel);
        }
      } finally {
        URL.revokeObjectURL(moduleUrl);
      }
    </script>
  </body>
</html>`,
    };
  } catch (error) {
    return {
      html: "",
      errorText: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildHtmlArtifactDocument(artifact: SessionArtifact): ArtifactDocumentResult {
  if (!artifact.html) {
    return {
      html: "",
      errorText: "This artifact is missing its HTML payload.",
    };
  }

  if (/<html[\s>]/i.test(artifact.html)) {
    return {
      html: artifact.html,
      errorText: null,
    };
  }

  return {
    errorText: null,
    html: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html,
      body {
        margin: 0;
        min-height: 100%;
        background: #101114;
        color: #f5f6f8;
        font-family: Inter, "Segoe UI", system-ui, sans-serif;
      }

      * {
        box-sizing: border-box;
      }

      ${artifact.css}
    </style>
  </head>
  <body>
    ${artifact.html}
    ${artifact.js ? `<script type="module">${artifact.js}</script>` : ""}
  </body>
</html>`,
  };
}

export function buildArtifactDocument(artifact: SessionArtifact): ArtifactDocumentResult {
  if (artifact.kind === "html") {
    return buildHtmlArtifactDocument(artifact);
  }

  return buildReactArtifactDocument(artifact);
}

export function buildArtifactDataUrl(artifact: SessionArtifact) {
  const documentResult = buildArtifactDocument(artifact);
  return {
    errorText: documentResult.errorText,
    dataUrl: documentResult.errorText
      ? null
      : `data:text/html;charset=utf-8,${encodeURIComponent(documentResult.html)}`,
  };
}

export function deriveArtifactsFromMessages(messages: UiMessage[]): DerivedArtifactState {
  const artifactById = new Map<string, SessionArtifact>();
  let sequence = 0;

  const processedMessages = messages.map((message) => {
    const extracted = extractArtifactsFromMessage(message);
    if (extracted.artifacts.length === 0) {
      return message;
    }

    for (const artifact of extracted.artifacts) {
      const previous = artifactById.get(artifact.artifactId);
      sequence += 1;

      artifactById.set(artifact.artifactId, {
        artifactId: artifact.artifactId,
        title: artifact.title || previous?.title || "Artifact",
        summary: artifact.summary || previous?.summary || "",
        kind: artifact.kind ?? previous?.kind ?? "react-tsx",
        tsx: artifact.tsx ?? previous?.tsx ?? null,
        html: artifact.html ?? previous?.html ?? null,
        css: artifact.css || previous?.css || "",
        js: artifact.js || previous?.js || "",
        data: artifact.data ?? previous?.data ?? null,
        createdInMessageId: previous?.createdInMessageId ?? message.id,
        updatedInMessageId: message.id,
        createdAt: previous?.createdAt ?? message.timestamp,
        updatedAt: message.timestamp,
        revisionCount: (previous?.revisionCount ?? 0) + 1,
        updatedSequence: sequence,
      });
    }

    return {
      ...message,
      content: extracted.displayContent,
      artifactRefs: extracted.artifactRefs,
    };
  });

  const artifacts = [...artifactById.values()].sort((left, right) => right.updatedSequence - left.updatedSequence);

  return {
    messages: processedMessages,
    artifacts,
    artifactById: Object.fromEntries(artifacts.map((artifact) => [artifact.artifactId, artifact])),
  };
}
