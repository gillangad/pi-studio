---
name: pi-artifacts
description: Guidance for creating and revising Pi Studio session artifacts through the built-in artifact tool.
---

# Pi Studio session artifacts

Use this skill when the user wants a visualization, dashboard, report explorer, interactive summary, custom tool UI, or another durable UI surface inside the current Pi Studio session.

## What an artifact is

- An artifact is a session-scoped mini app.
- It appears in the current session's artifact sidebar.
- Reusing the same artifact id updates the existing artifact, and the sidebar always resolves to the latest revision for that id in the current session.

## How to create one

Use the built-in `artifact` tool.

When the user explicitly asks for an artifact in Pi Studio, fulfill that request by calling the `artifact` tool with the complete artifact payload. Do not satisfy an artifact request by only writing a standalone HTML, TSX, or other file unless the user explicitly asks for a file as the deliverable.

Required fields:

- `id`: stable slug, for example `q2-report-explorer`
- `title`: short label shown in the sidebar
- `summary`: one-line description
- `kind`: `"react-tsx"` or `"html"`

Recommended fields:

- `tsx`: React + TypeScript source for `react-tsx` artifacts
- `html`: HTML markup for `html` artifacts
- `css`: styling string
- `js`: module script for `html` artifacts when needed
- `data`: structured JSON payload for the artifact to render

Canonical contract:

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

- To revise an artifact, call the `artifact` tool again with the same `id`.
- Keep the `title` stable unless the user asks to rename it.
- Replace the UI implementation with the updated one rather than describing the change abstractly.

## Authoring style

- Build the actual artifact the user asked for, not a sketch.
- Make it look intentional: good spacing, strong information hierarchy, sensible defaults, readable charts/tables, and useful empty states when needed.
- Keep the UI tightly scoped to the task.
- Prefer embedding the relevant data in `data` instead of hardcoding display text all over the component.
- Keep the first shipped version compact. Prefer a small, complete artifact over a sprawling one that risks truncation.
- For test/status/checklist artifacts, use a minimal dashboard or summary card layout rather than a large custom app.
- Keep `tsx` concise. Avoid giant inline style blobs, repeated markup, or writing the artifact payload out to a side file before making the real tool call.

## Delivery guidance

- You may write brief explanatory text before or after the tool call.
- Call the `artifact` tool directly in the turn that creates or revises the artifact.
- When an artifact is the main deliverable, keep surrounding prose short.
- If you also create supporting files, the tool call is still the primary deliverable for artifact requests in Pi Studio.
- Do not stop after writing temporary files or printing only JSON in the assistant text. The artifact tool call is the thing Pi Studio renders.

## Example

Call `artifact` with:

- `id`: `quarterly-report-explorer`
- `title`: `Quarterly Report Explorer`
- `summary`: `Revenue, margin, and segment breakdowns for the uploaded quarter.`
- `kind`: `react-tsx`
- `data`: `{ "quarter": "Q2 2026", "revenue": 128.4, "margin": 0.31 }`
- `tsx`: concise React component source
- `css`: optional styling string
