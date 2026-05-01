# pi-studio

Desktop Pi client with a chat-first GUI, hosted TUI, Pi-native built-ins, and session-scoped artifacts.

## Built-in Pi Resources

Pi Studio ships first-party Pi-native built-ins through a simple directory convention:

- extensions live in `src/builtins/extensions/<name>/index.ts`
- skills live in `src/builtins/skills/<name>/SKILL.md`

Those resources are loaded for Pi Studio builtin-enabled sessions through the host resource loader, so built-in capabilities should be packaged as normal Pi extensions and skills rather than ad hoc desktop-only behavior.

Pi Studio now also ships a built-in `pi-browser` package:

- the `pi-browser` extension exposes a single `browser` tool to Pi
- the `pi-browser` skill teaches the agent how to use that tool
- the visible browser panel binds to the current thread so Pi acts on the same live surface the user sees

## Experimental Artifacts

Pi Studio can surface session artifacts directly inside the chat timeline.

- Artifacts are session-scoped.
- Each artifact appears inline at the message where Pi created or updated it.
- Clicking an inline artifact card opens the latest revision in the right sidebar.
- The workspace header includes an `Artifacts` button for browsing every artifact created in the current session.

Pi Studio ships a built-in `pi-artifacts` extension and skill that teach Pi how to emit fenced `pi-artifact` blocks in assistant markdown. The inline card always resolves to the latest artifact revision with the same artifact id.

When a user asks Pi Studio to make an artifact, the intended deliverable is a `pi-artifact` block in the assistant response, not just a standalone HTML or source file on disk.
