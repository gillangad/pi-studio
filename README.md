# pi-studio

Desktop Pi client with a chat-first GUI, hosted TUI, Pi-native built-ins, and session-scoped artifacts.

## Experimental Artifacts

Pi Studio can surface session artifacts directly inside the chat timeline.

- Artifacts are session-scoped.
- Each artifact appears inline at the message where Pi created or updated it.
- Clicking an inline artifact card opens the latest revision in the right sidebar.
- The workspace header includes an `Artifacts` button for browsing every artifact created in the current session.

Pi Studio ships a built-in `pi-session-artifacts` extension and skill that teach Pi how to emit fenced `pi-artifact` blocks in assistant markdown. The inline card always resolves to the latest artifact revision with the same artifact id.
