# AGENTS.md

## Project Intent

Pi Studio is a desktop client for Pi. Keep Pi behavior Pi-native whenever practical and avoid inventing a parallel system.

## Read First

* [README.md](/home/angad/projects/pi-studio/README.md) explains usage.
* [docs/ARCHITECTURE.md](/home/angad/projects/pi-studio/docs/ARCHITECTURE.md) explains the present structure.
* [docs/VISION.md](/home/angad/projects/pi-studio/docs/VISION.md) explains the future direction.
* When developing Pi extensions, skills, prompts, themes, or Pi SDK integrations, read the upstream Pi docs and examples first and follow relevant `.md` cross-references before implementing.

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
* Treat the WSL repo at `/home/angad/projects/pi-studio` as the source of truth for edits, verification, git history, and pushes.
* After each change set, sync the updated project to the Windows workspace and rebuild/relink there (`C:\\Users\\Angad\\projects\\pi-studio`; run `npm run build` then `npm link`) so `pistudio` launched from Windows uses the latest code.
* Before ending a turn, push the latest committed WSL state to the configured remote when git is available and the user has not asked to avoid pushing.

## Documentation

* Update `README.md` when usage changes.
* Update `docs/ARCHITECTURE.md` when structure or ownership changes.
* Update `docs/VISION.md` when product direction changes materially.
