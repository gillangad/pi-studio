# pi-studio

Desktop Pi client with a chat-first GUI, a hosted TUI, and Pi-native built-ins.

## Built-in Pi Resources

Pi Studio ships first-party Pi-native built-ins through a simple directory convention:

- extensions live in `src/builtins/extensions/<name>/index.ts`
- skills live in `src/builtins/skills/<name>/SKILL.md`

Those resources are loaded for Pi Studio builtin-enabled sessions through the host resource loader, so built-in capabilities should be packaged as normal Pi extensions and skills rather than ad hoc desktop-only behavior.

Pi Studio currently ships two built-in Pi-native packages:

- the `pi-browser` extension exposes a single `browser` tool to Pi
- the `pi-browser` skill teaches the agent how to use that tool
- the visible browser panel binds to the current thread so Pi acts on the same live surface the user sees
- the `pi-session` extension exposes a single `session` tool to the controller session
- the `pi-session` skill teaches the controller session how to create, inspect, message, and close worker sessions

## Modes

Pi Studio currently has two main interaction modes:

- the GUI, which hosts one controller session plus multiple visible worker sessions directly inside the app
- the TUI, which runs Pi in a hosted terminal surface for the active project/thread

The project terminal utility remains a separate raw shell surface for terminal work.

## GUI Shape

The current GUI is centered on:

- a multi-session canvas of live worker session cards
- a bottom master composer backed by a dedicated controller session
- a right-side utility panel for browser, files, and terminal surfaces
