# AGENTS.md

## Project Intent

Pi Studio is a desktop client for Pi. Keep Pi behavior Pi-native whenever practical and avoid inventing a parallel system.

Current baseline:

* Pi Studio currently ships a Pi-native browser capability.
* The old artifact and session-control systems were removed and should be treated as deleted, not as patterns to restore by default.
* If artifacts or higher-level session orchestration come back, rebuild them against the current vision instead of reviving the old transcript-derived or parallel-runtime designs.

## Read First

* [README.md](/home/angad/projects/pi-studio/README.md) explains usage.
* [docs/ARCHITECTURE.md](/home/angad/projects/pi-studio/docs/ARCHITECTURE.md) explains the present structure.
* [docs/VISION.md](/home/angad/projects/pi-studio/docs/VISION.md) explains the future direction.
* Upstream Pi source lives at [badlogic/pi-mono](https://github.com/badlogic/pi-mono). When packaged docs are not enough, inspect the upstream Pi code path there too, especially `packages/coding-agent`.
* When developing Pi extensions, skills, prompts, themes, or Pi SDK integrations, read the upstream Pi docs and examples first and follow relevant `.md` cross-references before implementing:
  * [Pi SDK README](/home/angad/projects/pi-studio/node_modules/@earendil-works/pi-coding-agent/README.md)
  * [Pi extensions docs](/home/angad/projects/pi-studio/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)
  * [Pi extension examples](/home/angad/projects/pi-studio/node_modules/@earendil-works/pi-coding-agent/examples/extensions/README.md)

## Source Lanes

* `src/shell/` for Electron shell code only.
* `src/pi-host/` for Pi SDK integration only.
* `src/surfaces/` for UI only.
* `src/shared/` for thin shared contracts and types only.
* `src/builtins/` for app-shipped Pi-native resources only.

## Core Rules

* Keep Electron code out of `src/pi-host/` and `src/surfaces/`.
* Keep Pi SDK/runtime logic out of `src/shell/` and `src/surfaces/`.
* Keep UI code out of `src/pi-host/`.
* Prefer Pi-native extensions/resources over desktop-only behavior when the feature belongs to Pi behavior.
* Treat Pi-facing capabilities as Pi-native whenever practical. Agent-callable verbs such as browser control, artifact creation requests, delegation requests, and similar capabilities should usually ship as Pi extensions/tools unless there is a clear documented reason not to.
* Do not force Pi extensions to become the source of truth for core desktop runtime concerns. Session orchestration, artifact persistence, routing, visibility, and UI state should stay host-owned unless there is a clear documented reason to model them inside Pi itself.
* Do not reintroduce removed systems by inertia. If artifact workflows or multi-session orchestration return, design them from the current product vision and document the ownership split between host runtime, Pi extensions, and UI surfaces first.
* Be minimal. Do not add new host-side plumbing, duplicate tool-discovery paths, meta tools, or parallel behavior when Pi already has a native mechanism for it.
* Before adding functionality, check whether Pi already provides it through the tool registry, active tool list, extensions, skills, prompt snippets, prompt guidelines, commands, or another built-in surface. Reuse and configure what already exists before inventing anything new.
* For extension or skill work, treat Pi docs and examples as required implementation context, not optional background reading.
* Do not add new top-level lanes without updating `docs/ARCHITECTURE.md`.

## Feature Porting

* Use external projects as reference material only.
* Do not mention the reference project in code, docs, or comments.



## Testing

* Every non-trivial change should add or update automated tests.
* Prefer contract, integration, and end-to-end coverage for boundary-heavy behavior.
* Do not rely on manual testing when automated verification is practical.
* After finishing a change set, run automated checks (`npm run typecheck`, `npm run test`, and `npm run build`) before handoff when practical.
* When a Pi Studio session is hosted by the Windows desktop app, file tools may need to use the actual workspace path reported by the session (for example `\\wsl.localhost\Ubuntu\home\angad\projects\pi-studio` or `C:\Users\Angad\projects\pi-studio`). Do not invent bare `C:\home\...` paths.
* After each change set, sync the updated project to the Windows workspace and rebuild/relink there (`C:\\Users\\Angad\\projects\\pi-studio`; run `npm run build` then `npm link`) so `pistudio` launched from Windows uses the latest code.
* Before ending a turn, push the latest committed state to the configured remote when git is available and the user has not asked to avoid pushing.

## Documentation

* Update `README.md` when usage changes.
* Update `docs/ARCHITECTURE.md` when structure or ownership changes.
* Update `docs/VISION.md` when product direction changes materially.
