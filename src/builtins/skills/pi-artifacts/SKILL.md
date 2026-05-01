---
name: pi-artifacts
description: Guidance for creating and revising Pi Studio session artifacts that appear inline in chat and open in the session artifact sidebar.
---

# Pi Studio session artifacts

Use this skill when the user wants a visualization, dashboard, report explorer, interactive summary, custom tool UI, or another durable UI surface inside the current Pi Studio session.

## What an artifact is

- An artifact is a session-scoped mini app.
- It appears as an inline card in the chat at the message where it was created or updated.
- Clicking that card opens the full artifact in the right sidebar.
- Reusing the same artifact id updates the existing artifact, and the chat card always resolves to the latest revision for that id.

## How to create one

Emit a fenced code block whose info string starts with `pi-artifact`, and make the body valid JSON.

When the user explicitly asks for an artifact in Pi Studio, fulfill that request with a `pi-artifact` block in the assistant response. Do not satisfy an artifact request by only writing a standalone HTML, TSX, or other file unless the user explicitly asks for a file as the deliverable.

Required fields:

- `id`: stable slug, for example `q2-report-explorer`
- `title`: short label shown in the UI
- `summary`: one-line description
- `kind`: `"react-tsx"` or `"html"`

Recommended fields:

- `tsx`: React + TypeScript source for `react-tsx` artifacts
- `html`: HTML markup for `html` artifacts
- `css`: styling string
- `js`: module script for `html` artifacts when needed
- `data`: structured JSON payload for the artifact to render

Canonical contract:

- The fenced block body itself must be valid JSON.
- For `kind: "react-tsx"`, provide `tsx` and optionally `css` and `data`.
- For `kind: "html"`, provide `html` and optionally `css`, `js`, and `data`.

## Default choice

Prefer `react-tsx` unless the artifact is truly tiny. React artifacts are the best default for charts, tables, filters, tabs, drilldowns, and polished app-like layouts.

React artifact rules:

- Export a default React component or `ArtifactApp`.
- The component receives the payload as an `artifact` prop.
- The same payload is also available through `window.PI_ARTIFACT_DATA`.
- Keep imports limited to React runtime expectations. Do not rely on Node, filesystem access, or arbitrary npm packages.

## Revision flow

- To revise an artifact, send another `pi-artifact` block with the same `id`.
- Keep the `title` stable unless the user asks to rename it.
- Replace the UI implementation with the updated one rather than describing the change abstractly.

## Authoring style

- Build the actual artifact the user asked for, not a sketch.
- Make it look intentional: good spacing, strong information hierarchy, sensible defaults, readable charts/tables, and useful empty states when needed.
- Keep the UI tightly scoped to the task.
- Prefer embedding the relevant data in `data` instead of hardcoding display text all over the component.

## Delivery guidance

- You may write brief explanatory text before or after the artifact block.
- Emit the artifact block directly in the assistant message that creates or revises it.
- If you also create supporting files, the artifact block is still the primary deliverable for artifact requests in Pi Studio.

## Example

```pi-artifact
{
  "id": "quarterly-report-explorer",
  "title": "Quarterly Report Explorer",
  "summary": "Revenue, margin, and segment breakdowns for the uploaded quarter.",
  "kind": "react-tsx",
  "data": {
    "quarter": "Q2 2026",
    "revenue": 128.4,
    "margin": 0.31
  },
  "tsx": "type ArtifactData = { quarter: string; revenue: number; margin: number }; export default function ArtifactApp({ artifact }: { artifact: ArtifactData }) { return <main style={{ padding: 24 }}><h1>{artifact.quarter}</h1><p>Revenue: ${artifact.revenue}M</p><p>Margin: {(artifact.margin * 100).toFixed(1)}%</p></main>; }",
  "css": "body { background: #0f1115; color: #f5f7fb; font-family: Inter, system-ui, sans-serif; } h1 { margin: 0 0 12px; font-size: 24px; } p { margin: 0 0 8px; }"
}
```
