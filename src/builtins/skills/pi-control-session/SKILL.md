---
name: pi-control-session
description: Operating guidance for the built-in `control` tool, which inspects and steers other Pi Studio sessions.
---

# Session control

This skill describes the built-in `control` tool.

- If the current session has the `control` tool, you may use it.
- Treat `control` as a normal built-in Pi Studio tool in this session, alongside the other active tools.
- When the user asks what tools are available, include `control` if this session has it.

## Purpose

The `control` tool helps Pi Studio inspect, monitor, create, and steer other sessions. Use it when the user wants to work across sessions instead of only inside the current one.

## Tool map

The single `control` tool exposes multiple actions:

- `action: "list"`
  - Discover controllable sessions and linked targets.
  - Prefer this first when the user asks what sessions exist or which session should be used.

- `action: "new"` or `action: "link"`
  - Create or attach a target when a session is not already under control.

- `action: "send"`
  - Delegate work into another session.
  - This writes a real `user` message into that session, so phrase prompts as if speaking directly to it.

- `action: "status"`
  - Check whether a target run is idle, queued, running, done, errored, cancelled, or timed out.
  - Prefer this when the user asks whether something is still running.

- `action: "cancel"`
  - Stop a servant run that is stuck, obsolete, or explicitly cancelled by the user.

- `action: "latest"`
  - Use for the fast path when the user wants a quick update on what another session just did.
  - Prefer this before `action: "read"`.

- `action: "read"`
  - Use for deeper catch-up when the latest pair is not enough.
  - Prefer targeted reads over dumping the full target transcript unless the user truly needs complete history.

## Operating style

- Start by figuring out whether the user wants discovery, delegation, status, cancellation, a quick summary, or a deep read.
- Prefer the smallest useful tool:
  - `latest` before `read`
  - `status` before a speculative reread
  - `list` before guessing which session exists
- Keep answers grounded in the target sessions' actual state.
- Be explicit about which session you inspected or steered.

## Avoid

- Do not pretend to know which sessions exist without checking `action: "list"`.
- Do not summarize another session's internal state from memory when the control tool can verify it.
- Do not use `action: "read"` by default when a lighter action answers the question.
