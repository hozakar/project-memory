# 16. ASSIGNMENT Soft Notifications — Passive UX & Purpose Reframe

Date: 2026-06-14

Status: Active

## Context

DECISION-2026-06-14-assignment-feature shipped ASSIGNMENT as a cross-user task delegation system with persistent, interactive session-start notifications (accept / reject / remind). Real-world testing showed this was frustrating: an engineering memory tool that forces task management interactions every session conflicts with its own purpose.

The design had confused "tasks must not be lost" (a valid concern) with "force the user to act on every task at every session start" (the wrong solution).

## Decision

ASSIGNMENT notifications follow model C: passive single-line summary at session start, full detail and actions available on demand. The 3-reminder auto-reject mechanic is dropped.

The primary purpose of ASSIGNMENT is **handoff on departure** — transferring an absent developer's unfinished context to a specific teammate — not daily task routing.

## Consequences

- Session start is less cluttered and less stressful
- Tool stays in its lane (memory, not task management)
- Rejection mechanism is preserved without creating friction at session start
- Users could defer indefinitely — Cat 14b (stale pending >30d) is the backstop

## Alternatives Considered

- **Completely silent (on-demand only):** Loses ambient awareness. Assignee could forget pending handoffs for weeks.
- **Notify once (first session only):** Schema complexity for marginal benefit.
- **Model C — passive per-session line (chosen):** Preserves ambient awareness without forcing interaction.

## Links

- DECISION-2026-06-14-assignment-soft-notifications
- Amends DECISION-2026-06-14-assignment-feature (Notification Persistence section)
