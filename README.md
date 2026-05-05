# pi-studio

Desktop Pi client with a chat-first GUI, a hosted TUI, Pi-native built-ins, and session-scoped artifacts.

## Built-in Pi Resources

Pi Studio ships first-party Pi-native built-ins through a simple directory convention:

- extensions live in `src/builtins/extensions/<name>/index.ts`
- skills live in `src/builtins/skills/<name>/SKILL.md`

Those resources are loaded for Pi Studio builtin-enabled sessions through the host resource loader, so built-in capabilities should be packaged as normal Pi extensions and skills rather than ad hoc desktop-only behavior.

Pi Studio now also ships a built-in `pi-browser` package:

- the `pi-browser` extension exposes a single `browser` tool to Pi
- the `pi-browser` skill teaches the agent how to use that tool
- the visible browser panel binds to the current thread so Pi acts on the same live surface the user sees

## Modes

Pi Studio currently has two main interaction modes:

- the GUI, which hosts the active Pi session directly inside the app
- the TUI, which runs Pi in a hosted terminal surface for the active project/thread

The project terminal utility remains a separate raw shell surface for terminal work.

## Experimental Artifacts

Pi Studio can surface session artifacts directly inside the active session workspace.

- Artifacts are session-scoped.
- Each thread keeps its own artifact list.
- Artifacts open in the right sidebar for the current session.
- The workspace header includes an `Artifacts` button for browsing every artifact created in the current session.

Pi Studio ships a built-in `pi-artifacts` extension and skill:

- the `pi-artifacts` extension exposes an `artifact` tool to Pi
- the `pi-artifacts` skill teaches the agent how to use that tool
- artifact revisions are carried in tool result details, so they stay branch-aware and chat-scoped

When a user asks Pi Studio to make an artifact, the intended deliverable is an `artifact` tool call with the full payload, not a standalone HTML/source file or a blob printed into the assistant message.
