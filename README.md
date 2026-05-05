# pi-studio

Desktop Pi client with a chat-first GUI, a hosted TUI, and Pi-native built-ins.

## Built-in Pi Resources

Pi Studio ships first-party Pi-native built-ins through a simple directory convention:

- extensions live in `src/builtins/extensions/<name>/index.ts`
- skills live in `src/builtins/skills/<name>/SKILL.md`

Those resources are loaded for Pi Studio builtin-enabled sessions through the host resource loader, so built-in capabilities should be packaged as normal Pi extensions and skills rather than ad hoc desktop-only behavior.

Pi Studio currently ships a built-in `pi-browser` package:

- the `pi-browser` extension exposes a single `browser` tool to Pi
- the `pi-browser` skill teaches the agent how to use that tool
- the visible browser panel binds to the current thread so Pi acts on the same live surface the user sees

## Modes

Pi Studio currently has two main interaction modes:

- the GUI, which hosts the active Pi session directly inside the app
- the TUI, which runs Pi in a hosted terminal surface for the active project/thread

The project terminal utility remains a separate raw shell surface for terminal work.
