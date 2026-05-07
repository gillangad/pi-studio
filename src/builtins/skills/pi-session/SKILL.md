---
name: pi-session
description: Use Pi Studio's controller-managed worker sessions through the single `session` tool.
---

# Pi Studio session control

Use this skill when the user wants to split work across multiple Pi Studio sessions, steer an existing worker, or inspect which worker should handle a task.

## Model

- There is one orchestration tool here: `session`.
- The current session is the controller session.
- Worker sessions are real Pi sessions with their own transcripts, tools, and context.
- Use the `session` tool to create workers, send them prompts, inspect them, or close them.

## Operating style

- Prefer one clear worker per distinct task.
- Use `session` with `action: "list"` or `action: "status"` before guessing which worker is active.
- When delegating, send a complete user-style prompt to the worker with `action: "send"`.
- Keep prompts specific about the task, constraints, and expected output.
## Tool map

- `list`
  Show visible worker sessions.

- `create`
  Open a new worker session. Optionally give it a short title.

- `send`
  Deliver a user-style prompt into a target worker session.

- `status`
  Inspect one worker or all visible workers.

- `close`
  Close a visible worker session without deleting its underlying Pi session file.

## Delegation pattern

When the user says something like "tell Session A to do task A":

1. Check the current workers with `session(action: "list")` if needed.
2. Pick the right worker or create one.
3. Call `session(action: "send", target_session_id: "...", prompt: "...")`.
## Safety

- Confirm before sending destructive or high-impact instructions to a worker if the user did not clearly ask for them.
- Do not close a worker if the user still appears to rely on its in-flight context.
