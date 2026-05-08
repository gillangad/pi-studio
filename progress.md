# Progress

## Goal

Implement a host-owned controller and worker session architecture for Pi Studio with:

- one built-in `session` tool
- one bottom master composer
- multiple visible worker session cards on the main canvas
- per-card mini chat surfaces with their own composers
- preserved top-right utility buttons
- preserved right-side utility panel

This pass intentionally excludes deeper follow-on systems outside the current session scope.

## Architecture Decisions

1. `src/pi-host/` is the source of truth for Studio session orchestration.
2. Pi sessions remain real embedded SDK sessions managed by `StudioHost`; no parallel subprocess control backend.
3. The built-in `session` extension is a thin agent-facing API over host-owned session routing and lifecycle.
4. The bottom composer talks to the controller session.
5. Worker cards are real mini chat surfaces, not summary-only dashboards.
6. Each worker card also keeps a local composer so users can talk to that session directly.
7. The existing top-right utility controls and right-side utility panel remain part of the shell.

## MVP Scope

- host registry for controller and worker sessions
- session roles and metadata exposed in snapshots
- `session` actions: `list`, `create`, `send`, `focus`, `status`, `close`
- delivery of delegated prompts into real worker Pi sessions
- multi-session canvas UI with per-card chat surfaces
- bottom master composer
- tests and docs updates
- commit and push when complete

## Milestones

- [x] Build host-owned session registry and routing
- [x] Add `session` built-in extension and skill
- [x] Expose controller/worker state through shared snapshot types
- [x] Rebuild GUI into a multi-session canvas
- [x] Add tests and docs
- [x] Run checks, commit, and push

## Current Follow-up

- [x] Remove the temporary session overview utility surface from the GUI
- [x] Reconcile docs and tests around the slimmer utility panel model
- [x] Re-run Windows verification, rebuild, and relink

## Current Pass

- [x] Persist a configurable master session directory and expose it in settings
- [x] Simplify the canvas header and master bar chrome
- [x] Group session panes by project with shared project styling and column behavior
- [x] Mirror changes to Windows, verify, commit, and push

## Progress Log

- 2026-05-08: Reviewed the current post-cleanup codebase. Confirmed that the host already supports multiple GUI session runtimes internally via `guiSessions`, optional `sessionId` parameters in the bridge methods, and per-session prompt handling. This will be extended into a host-owned controller/worker model instead of inventing a second orchestration path.
- 2026-05-08: Added the first shared and host-side session architecture pass. `WorkspaceState` now persists project-scoped open worker metadata, a new Pi Studio `session` extension/skill exists, and `StudioHost` now restores a dedicated controller session plus visible worker sessions per project while exposing create/focus/send/close/list behavior through one host-owned runtime.
- 2026-05-08: Rebuilt the main GUI shell around a multi-session canvas. Worker sessions now render as live chat-style cards with their own composers, the right-side utility panel now includes a session view, and the bottom master composer is wired to the controller session while preserving the top-right utility controls and the existing sidebar shell.
- 2026-05-08: Finished the verification pass and tightened the new UI tests to match the richer live-session layout. Checks now pass in the Windows desktop workspace with `npm run typecheck`, `npm run test`, `npm run build`, and `npm link`.
- 2026-05-08: Adjusted the session lifecycle to match the intended UX more closely. Pi Studio now starts with only the master session visible, no worker is auto-restored or auto-focused, and closing the focused worker clears focus instead of silently switching to another one.
- 2026-05-08: Removed the focused-session concept from the runtime and UI. Worker sessions now stay equal on the canvas, the `session` tool no longer exposes a focus action, and the right-side session tab is now a session overview instead of a focused-thread inspector.
- 2026-05-08: Verified the no-focus architecture end to end in the Windows workspace. `npm run typecheck`, `npm run test`, `npm run build`, and `npm link` all pass after the runtime, IPC, UI, and docs cleanup.
- 2026-05-08: Started the next refinement pass to remove the temporary session overview surface entirely. The canvas will stay peer-to-peer, and the utility panel will slim back down to browser, files, terminal, and diff until a better session-management surface is designed.
- 2026-05-08: Removed the session overview utility surface from the GUI. The right-side utility area now only hosts browser, files, terminal, and diff surfaces, and worker management is back to happening directly on the canvas plus through the master composer.
- 2026-05-08: Verified this refinement in the Windows workspace because local npm commands cannot execute reliably from the UNC-mounted WSL path in PowerShell. `npm run typecheck`, `npm run test`, `npm run build`, and `npm link` all pass in `C:\Users\Angad\Projects\pi-studio`.
- 2026-05-08: Began the next canvas refinement pass. This one keeps the existing sidebar and session-control behavior intact while introducing a persistent master-session directory, removing extra explanatory header copy, and regrouping session panes by project using a more deliberate column-and-pane model.
- 2026-05-08: Finished the canvas/master-directory refinement pass. The top-right canvas chrome now centers on the master cwd, settings can pin that cwd explicitly or reset it to the platform home directory, and worker sessions now render inside project-grouped pane columns with Mosaic-inspired column resizing while keeping the existing sidebar and session control intact.
- 2026-05-08: Re-verified this pass in `C:\Users\Angad\Projects\pi-studio` with `npm run typecheck`, `npm run test`, `npm run build`, and `npm link`.
