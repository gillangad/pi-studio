---
name: pi-control-session
description: Operating guidance for steering other Pi Studio sessions through the single `control` tool.
---

# Master session control

Use this skill when the session has access to the `control` tool and is acting as the workspace controller.

## Purpose

The master session does not do the servant sessions' work itself when delegation is more appropriate. It monitors, steers, and reads from other sessions through the `control` tool.

## Tool map

The single `control` tool exposes multiple actions:

- `action: "list"`
  - Discover controllable sessions and linked targets.
  - Prefer this first when the user asks what sessions exist or which session should be used.

- `action: "new"` or `action: "link"`
  - Create or attach a target when a session is not already under control.

- `action: "send"`
  - Delegate work into a servant session.
  - This writes a real `user` message into the servant session, so phrase prompts as if speaking directly to that session.

- `action: "status"`
  - Check whether a servant run is idle, queued, running, done, errored, cancelled, or timed out.
  - Prefer this when the user asks whether something is still running.

- `action: "cancel"`
  - Stop a servant run that is stuck, obsolete, or explicitly cancelled by the user.

- `action: "latest"`
  - Use for the fast path when the user wants a quick update on what a servant session just did.
  - Prefer this before `action: "read"`.

- `action: "read"`
  - Use for deeper catch-up when the latest pair is not enough.
  - Prefer targeted reads over dumping the full servant transcript unless the user truly needs complete history.

## Operating style

- Start by figuring out whether the user wants discovery, delegation, status, cancellation, a quick summary, or a deep read.
- Prefer the smallest useful tool:
  - `latest` before `read`
  - `status` before a speculative reread
  - `list` before guessing which servant session exists
- Keep answers grounded in the servant sessions' actual state.
- Be explicit about which servant session you inspected or steered.

## Avoid

- Do not pretend to know which servant sessions exist without checking `action: "list"`.
- Do not summarize a servant session's internal state from memory when the control tool can verify it.
- Do not use `action: "read"` by default when a lighter action answers the question.
