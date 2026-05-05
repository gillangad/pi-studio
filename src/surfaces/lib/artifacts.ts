import ts from "typescript";
import type { UiMessage } from "../../shared/types";

const REACT_IMPORT_SPECIFIER = "https://esm.sh/react@19.1.0";
const REACT_DOM_CLIENT_IMPORT_SPECIFIER = "https://esm.sh/react-dom@19.1.0/client";
const REACT_JSX_RUNTIME_IMPORT_SPECIFIER = "https://esm.sh/react@19.1.0/jsx-runtime";
const REACT_JSX_DEV_RUNTIME_IMPORT_SPECIFIER = "https://esm.sh/react@19.1.0/jsx-dev-runtime";
const ARTIFACT_TOOL_NAME = "artifact";

export type SessionArtifactKind = "react-tsx" | "html";

type ArtifactToolDetails = {
  artifact?: {
    id?: unknown;
    title?: unknown;
    summary?: unknown;
    kind?: unknown;
    tsx?: unknown;
    html?: unknown;
    css?: unknown;
    js?: unknown;
    data?: unknown;
  };
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

type ParsedArtifact = Omit<
  SessionArtifact,
  "createdInMessageId" | "updatedInMessageId" | "createdAt" | "updatedAt" | "revisionCount" | "updatedSequence"
>;

type ArtifactDocumentResult = {
  html: string;
  errorText: string | null;
};

function slugifyArtifactId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");

  return normalized || null;
}

function inferArtifactKind(value: unknown, payload: ArtifactToolDetails["artifact"]): SessionArtifactKind | null {
  if (value === "html") return "html";
  if (value === "react-tsx") return "react-tsx";
  if (typeof payload?.html === "string" && payload.html.trim()) return "html";
  if (typeof payload?.tsx === "string" && payload.tsx.trim()) return "react-tsx";
  return null;
}

function parseArtifactFromMessage(message: UiMessage): ParsedArtifact | null {
  if (message.role !== "toolResult" || message.toolName !== ARTIFACT_TOOL_NAME) {
    return null;
  }

  const details = message.details as ArtifactToolDetails | undefined;
  const payload = details?.artifact;
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const kind = inferArtifactKind(payload.kind, payload);
  if (!title || !kind) {
    return null;
  }

  const explicitId =
    typeof payload.id === "string" && payload.id.trim() ? slugifyArtifactId(payload.id) : null;
  const artifactId = explicitId ?? slugifyArtifactId(title);
  if (!artifactId) {
    return null;
  }

  return {
    artifactId,
    title,
    summary: typeof payload.summary === "string" ? payload.summary.trim() : "",
    kind,
    tsx: typeof payload.tsx === "string" && payload.tsx.trim() ? payload.tsx : null,
    html: typeof payload.html === "string" && payload.html.trim() ? payload.html : null,
    css: typeof payload.css === "string" ? payload.css : "",
    js: typeof payload.js === "string" ? payload.js : "",
    data: payload.data ?? null,
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

  for (const message of messages) {
    const artifact = parseArtifactFromMessage(message);
    if (!artifact) {
      continue;
    }

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

  const artifacts = [...artifactById.values()].sort((left, right) => right.updatedSequence - left.updatedSequence);

  return {
    messages,
    artifacts,
    artifactById: Object.fromEntries(artifacts.map((artifact) => [artifact.artifactId, artifact])),
  };
}
