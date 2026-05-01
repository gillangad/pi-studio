# Master Session

## Status

This document defines the intended architecture and product contract for the Pi Studio master session.

It is a developer-facing document. It is not marketing copy and it is not a user tutorial.

## Purpose

Pi Studio has many normal sessions across many projects. The master session exists so the user can steer those sessions from one persistent control surface without turning Pi Studio into a second orchestration runtime.

The master session is:

- one persistent Pi session for the whole app
- one control layer above the normal workspace sessions
- one Pi-native way to inspect, steer, and coordinate other sessions

The master session is not:

- a separate app inside Pi Studio
- a replacement for normal project threads
- a transcript sink for every servant session
- a desktop-only orchestration system with Pi bolted on afterward

## Core Model

The distinction below is mandatory:

- `master session` = one real Pi session with extra control tools
- `servant session` = any normal Pi session already represented in the Pi Studio workspace
- `control-session extension` = the Pi-native behavior layer the master uses to act on servants
- `Pi Studio UI` = the native presentation layer that exposes the master cleanly

The master session should remain conceptually close to a normal Pi session:

- it has messages
- it has a model
- it can use slash commands
- it can use tools
- it persists across restarts

The key difference is that it has access to the bundled control tools and is surfaced through a special UI position.

## UX Contract

The master session should be shown through a new embedded top bar in Cockpit mode.

That top bar should be:

- always available in Cockpit mode
- compact by default
- expandable when needed
- visually part of the app shell, not a second main transcript

The rest of the GUI should stay centered on the currently open servant session or artifact.

The intended split is:

- Cockpit top bar = master control surface
- main workspace = current servant session or artifact
- sidebar = normal project and session navigation

The master session must not take over the whole center of gravity of the app unless the user explicitly expands into more detail.

## Product Rules

The master session should feel like:

- a normal Pi session
- with extra authority
- with persistent scope across the whole app
- shown through a compact embedded control surface

It should not feel like:

- a dashboard-first app mode
- a second giant chat area stacked above the real work
- a transcript browser for every worker by default

This rule matters because Pi Studio should stay calm. The user should not feel like they are manually piloting a mission-control maze just to keep working.

## Extension vs Native Split

This split is the most important architectural rule.

### Bundled Extension Owns

The bundled `pi-control-session` extension owns the behavior.

That includes:

- target registry
- target linking and target creation semantics
- run lifecycle
- the `control` tool and its actions
- persistence for managed target metadata
- transcript reading for servant sessions
- shaping compact control context for the master

This is Pi behavior. It should remain Pi-native.

### Native Pi Studio Owns

Pi Studio owns the UI and app-shell integration.

That includes:

- top-bar presentation
- expand and collapse behavior
- servant previews, status chips, and compact cards
- routing from servant previews into the normal session view
- layout and shell composition
- polling and rendering of extension-backed state

Pi Studio should not reimplement orchestration semantics in `src/surfaces/`, `src/pi-host/`, or `src/shell/`.

## Tool Surface

The control tool surface should stay intentionally small.

Final agreed set:

1. `control`

The tool description and prompt-level guidance should stay minimal. The deeper operating model belongs in the `pi-control-session` skill so the model only loads that context when it actually needs session-control behavior.

### Tool Semantics

The single `control` tool exposes these actions:

- `list`
  - list managed targets
  - discover existing servant sessions before guessing
- `new`
  - create a managed target for a fresh servant session
- `link`
  - link an existing session as a managed target
- `send`
  - append a real `user` message into a servant session
  - start or trigger work in that servant session
- `status`
  - inspect run state
- `cancel`
  - cancel an active servant run
- `latest`
  - return a compact preview for quick inspection
- `read`
  - read a bounded transcript slice for deeper catch-up

This is a hard rule:

`action: "send"` must write a normal user-role message to the servant session.

It must not invent a custom control-role message type.

Supported states should stay small and stable:

- queued
- running
- done
- error
- cancelled
- timeout

## Scope of Control

There is exactly one master session for the whole app.

The master should be able to control the sessions already represented in Pi Studio.

Practically, that means:

- sessions visible in the sidebar
- sessions opened or saved under projects known to Studio

This keeps the model bounded and avoids the master becoming a vague remote-control interface for arbitrary external state.

## Lifecycle

### Startup

On app startup:

1. Pi Studio restores or opens the single persistent master session
2. Pi Studio loads the bundled control-session extension for the master
3. Pi Studio syncs visible workspace sessions into control targets
4. Pi Studio polls compact extension state for rendering

### Runtime

During normal use:

- the user types into the embedded top bar
- the master session reasons normally as Pi
- the master uses the `control` tool when it wants to act on servants
- Pi Studio renders concise servant state around that interaction

### Restart

After restart:

- the same master session identity should come back
- the same control extension should be available
- managed servant metadata should still be available
- servant transcripts should still live in their normal Pi storage locations

## Data Flow

The intended control path is:

`user -> master session -> control-session extension -> servant session`

The return path is:

`servant session -> control-session extension -> compact UI state and intentional reads -> master session and Studio UI`

This is intentionally pull-based.

Servant output should not be auto-forwarded into the master transcript.

The master should read servant state when needed through `control` actions like `latest` and `read`.

## Persistence and Storage

The master session should persist like a normal Pi session, with its own history and identity.

The control extension may persist:

- managed target metadata
- run metadata
- lightweight control state

The control extension should not duplicate full servant transcript storage.

Servant transcripts should remain stored where normal Pi sessions already store them.

## UI Data Contract

The native UI only needs a compact subset of control state.

Recommended target preview shape:

- `target_id`
- `session_id`
- `display_name`
- `project_name`
- `status`
- `last_activity_at`
- `latest_prompt_preview`
- `latest_response_preview`
- `thread_jump_target`

The UI should render that compact state directly.

It should not dump raw extension internals, full transcript blobs, or ad hoc debug text into the main shell.

## Recommended File Ownership

The bundled extension should stay modular.

Recommended shape:

- `src/builtins/extensions/pi-control-session/index.ts`
- `src/builtins/extensions/pi-control-session/types.ts`
- `src/builtins/extensions/pi-control-session/storage.ts`
- `src/builtins/extensions/pi-control-session/runtime.ts`
- `src/builtins/extensions/pi-control-session/transcript.ts`
- `src/builtins/extensions/pi-control-session/sync.ts`

The rest of the app should stay thin:

- `src/pi-host/` loads the master and polls extension-backed state
- `src/surfaces/` renders the embedded control UI
- `src/shared/` carries only the narrow state contract needed by the UI

## Anti-Goals

Do not let this feature drift into any of the following:

- a second main transcript stacked above the normal session transcript
- a giant card-heavy control dashboard that overwhelms the workspace
- auto-forwarding every servant output into the master
- a Studio-only control protocol that bypasses Pi-native extensions
- a large and growing tool surface for every control nuance

If a new feature can be expressed by refining the extension contract or the native rendering of compact state, prefer that over adding more control verbs.

## Implementation Checklist

The first good implementation should satisfy all of the following:

- one global persistent master session
- master surfaced through an embedded top bar
- normal servant sessions remain normal threads
- control behavior lives in the bundled extension
- Studio UI remains a thin shell around extension state
- `action: "send"` writes real user-role messages into servants
- servant output remains pull-based
- compact previews are first-class
- deep transcript reads are intentional

## Summary

The master session is one real Pi session for the whole app.

It sits above the normal workspace as a compact embedded control surface, uses a small bundled control-session extension to steer servant sessions, and preserves the core Pi Studio rule:

Pi behavior stays Pi-native, while the desktop app provides the native shell and experience.
