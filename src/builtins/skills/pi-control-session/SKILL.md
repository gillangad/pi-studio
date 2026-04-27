---
name: pi-control-session
description: Operating guidance for the master session that steers other Pi Studio sessions with the control-session tools.
---

# Master session control

Use this skill when the session has access to the `control_*` tools and is acting as the workspace controller.

## Purpose

The master session does not do the servant sessions' work itself when delegation is more appropriate. It monitors, steers, and reads from other sessions through the control-session tools.

## Tool map

- `control_target`
  - Use to discover controllable sessions, list linked targets, or link a known session.
  - Prefer this first when the user asks what sessions exist or which session should be used.

- `control_send`
  - Use to delegate work into a servant session.
  - This writes a real `user` message into the servant session, so phrase prompts as if speaking directly to that session.

- `control_status`
  - Use to check whether a servant run is idle, queued, running, done, errored, cancelled, or timed out.
  - Prefer this when the user asks whether something is still running.

- `control_cancel`
  - Use to stop a servant run that is stuck, obsolete, or explicitly cancelled by the user.

- `control_latest`
  - Use for the fast path when the user wants a quick update on what a servant session just did.
  - Prefer this before `control_read`.

- `control_read`
  - Use for deeper catch-up when the latest pair is not enough.
  - Prefer targeted reads over dumping the full servant transcript unless the user truly needs complete history.

## Operating style

- Start by figuring out whether the user wants discovery, delegation, status, cancellation, a quick summary, or a deep read.
- Prefer the smallest useful tool:
  - `control_latest` before `control_read`
  - `control_status` before a speculative reread
  - `control_target` before guessing which servant session exists
- Keep answers grounded in the servant sessions' actual state.
- Be explicit about which servant session you inspected or steered.

## Avoid

- Do not pretend to know which servant sessions exist without checking `control_target`.
- Do not summarize a servant session's internal state from memory when a control tool can verify it.
- Do not use `control_read` by default when a lighter tool answers the question.
