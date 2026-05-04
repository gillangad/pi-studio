# Architecture

This document tracks the current architecture of Pi Studio as it exists today. It is the source of truth for where code belongs.

## Current State

The repository is intentionally scaffolded around five source lanes and one top-level test area:

- `src/shell/`
- `src/pi-host/`
- `src/surfaces/`
- `src/shared/`
- `src/builtins/`
- `tests/`

The codebase is still at the scaffold stage. These folders currently define ownership boundaries more than implementation detail.

## Lane Responsibilities

### `src/shell/`

Owns the desktop application shell.

Examples:

- Electron main process boot
- preload bridge
- native window lifecycle
- native menus
- IPC transport wiring
- browser-surface ownership and live browser control
- app mode switching between desktop GUI and hosted Pi TUI

This lane should stay thin and desktop-specific.

### `src/pi-host/`

Owns embedding Pi inside the desktop app.

Examples:

- Pi SDK session/runtime creation
- resource loading
- extension discovery integration
- session and thread lifecycle
- event bridging into desktop-safe view models
- hosted TUI session management
- terminal hosting support

This lane is the boundary where Pi semantics meet desktop-app semantics.

### `src/surfaces/`

Owns user-facing application surfaces.

Examples:

- chat surface
- hosted TUI surface
- settings surface
- designer surface
- inspectors, sidebars, project/thread views

This lane should not contain Electron boot code or direct Pi runtime wiring.

### `src/shared/`

Owns thin shared contracts used across lanes.

Examples:

- IPC channel names
- payload types
- event/view-model contracts
- small pure helpers

This lane should remain small and stable.

### `src/builtins/`

Owns first-party Pi resources that ship with the app.

Examples:

- bundled Pi extensions
- bundled skills
- bundled prompts
- bundled themes

This lane exists for app-shipped resources only. It does not replace Pi's normal extension discovery model.

## Built-in Packaging

Pi Studio has one built-in loading path for app-shipped Pi resources.

- Built-in extensions live under `src/builtins/extensions/`
- Built-in skills live under `src/builtins/skills/`
- `src/pi-host/builtin-resources.ts` discovers those directories and exposes them to builtin-enabled sessions
- `src/pi-host/builtin-selection.ts` decides which sessions receive Pi Studio built-ins

For now, built-ins should follow a simple directory-based packaging convention instead of a heavier manifest format.

### Built-in extension conventions

- Use one folder per built-in extension under `src/builtins/extensions/`
- Use `index.ts` as the extension entrypoint
- Keep optional helpers colocated inside the same extension folder
- Prefer adding behavior through normal Pi extension APIs such as tools, hooks, commands, and prompt augmentation

### Built-in skill conventions

- Use one folder per built-in skill under `src/builtins/skills/`
- Use `SKILL.md` as the skill entrypoint
- Add a matching skill when an extension needs explicit operating guidance for the agent
- Keep extension and skill names aligned when they describe the same capability
- Place optional helper scripts under the same skill folder when the skill needs local runtime helpers

### Packaging guidance

- Prefer directory-based built-ins over inline or programmatic registration unless there is a specific reason not to
- Treat built-ins as Pi-native resources first and desktop features second
- Keep built-in code independent of Electron-specific APIs
- Reach for a manifest or stricter package contract only if the number or complexity of built-ins grows enough to justify it

## Tests

`tests/` is a first-class part of the architecture.

It is split into:

- `tests/unit/`
- `tests/integration/`
- `tests/contracts/`
- `tests/e2e/`
- `tests/fixtures/`
- `tests/helpers/`

Testing priorities:

1. contract correctness across boundaries
2. integration correctness for Pi host behavior
3. desktop end-to-end reliability
4. unit coverage for pure logic

## Dependency Rules

- `src/shell/` may depend on `src/pi-host/`, `src/surfaces/`, and `src/shared/`.
- `src/pi-host/` may depend on `src/shared/` and `src/builtins/`.
- `src/surfaces/` may depend on `src/shared/`.
- `src/shared/` must not depend on `src/shell/`, `src/pi-host/`, or `src/surfaces/`.
- `src/builtins/` must remain independent of Electron-specific code.

## Architectural Intent

Pi Studio should behave like a desktop client for Pi, not a parallel agent framework.

That means:

- Pi remains the source of truth for extension/resource behavior.
- Studio adds desktop-native shell and surface layers.
- Shared first-party behavior should be Pi-native whenever practical.
- GUI and TUI should stay operationally aligned, even when they are backed by different runtime surfaces.

## Update Policy

Update this document whenever:

- a new top-level lane is added
- responsibilities move between lanes
- dependency rules change
- test strategy changes materially
