---
name: project-memory-cheatsheet
description: Quick reference cheatsheet and event-based trigger table for project-memory standard profile.
---

> **Profile:** `standard` — This cheatsheet covers standard behavior. For tier differences and minimal alternatives, see `profiles.md`.

# Quick Reference Cheatsheet (standard)

**Turn ending with commits?**

```
Did this turn include a commit? (check via git log --since=<turn-start>)
  No  → move on, no memory writes
  Yes → update summaries/current-state.md once (covering the turn's commits)
       → if scope changed: also update summaries/roadmap.md
       → THEN move to next turn
```

One judgment per turn, not N per commit. Decision-moment awareness (DECISION-2026-06-25) handles decisions independently, captured when made, mid-turn.

**About to implement something non-trivial?**
→ GATE 0: load active instructions (EXECUTE search_memory — standard re-injects here only, not at every gate).
→ Step 1: review `summaries/current-state.md` for context.
→ Step 2: scan `decisions/index.md` (and `discussions/index.md` if discussions feature is used) for `touches` overlap or `scope` match; batch directional conflicts into one `AskUserQuestion`.
→ Step 3: if architectural move with no candidate, offer to record a DECISION.
→ NO Step 4 (broad awareness load) — legacy removed.

**Topic shifted mid-session?**
→ Update `current-state.md` and `roadmap.md` to reflect the new direction at the next significant commit.

**Work cancelled / superseded?**
→ Capture in a DECISION record with the cancellation rationale.

**About to route work to a teammate?**
→ `assignments/` directory is created on first use. Use ASSIGNMENT template.

**About to close a discussion?**
→ Discussions are orthogonal to profile. `discussions/` directory is created on first close.

---

# Event-Based Triggers (standard)

| Event | Action required now |
|---|---|
| User requests significant implementation | Load `current-state.md` for context; ensure Pre-Impl Gate (instruction re-injection + decision cross-reference) fires before starting work |
| `submit_implementation` about to be called | Turn-boundary sweep runs at turn end: update `current-state.md` (once, covering the turn's commits), update `roadmap.md` if scope changed |
| DECISION-* file created | Add row to `decisions/index.md`. ADR mirror NOT created (default `adr_enabled: false`). |
| Decision superseded | Update superseded DECISION frontmatter; move row to Superseded section of `decisions/index.md`. |
| New feature or component shipped | Update `current-state.md` → What Exists. |
| Technical debt introduced | Update `current-state.md` → Known Debt / Risks. |
| Architecture module added or changed | Note significant changes in `current-state.md` or write a DECISION. |
| Issue opened | Add to `issues/open/` (create dir on first use). Update `current-state.md → Known Debt / Risks` line if relevant. |
| Issue closed | Move file to `issues/closed/`, update frontmatter. |
| Stub placeholder found in `roadmap.md` or `current-state.md` | Replace immediately. |
| Status-changing write on decision / discussion / issue | Standard does NOT track `contributors`. Skip this step. |
| Discussion concluded | Write `DISCUSSION-*.md` to `discussions/` (create dir on first use); add row to `discussions/index.md`. If MCP: call `index_discussion`. |
| Discussion resumed | Load existing file, update at close. |
| Turn with a commit | Turn-boundary sweep: update `summaries/current-state.md` (once, covering the turn's commits); also update `summaries/roadmap.md` on scope change. |
| User asks about past decisions/discussions (MCP available) | `search_memory` per `mcp-integration.md`. Pass `include_superseded: true` only when explicitly researching past/superseded decisions. |
| Drift audit (post-first-response) — `run_audit` available | Default: deferred. Call `run_audit(project_memory_dir, { profile: "standard" })`. Apply pending_fixes; triage escalations. |
| Drift audit (post-first-response) — `run_audit` NOT available | Default: deferred. Run file-based detection (5 active categories). |
| User mentions lost commits after squash/rebase | `find_similar_commit` per `mcp-integration.md`. |
| ~6 weeks since last era OR ~30 significant commits since last era | Maintainer-only prompt. |
| Assignment created / status changed | Update `assignments/index.yml`, re-call `index_assignment` if MCP. |
| Session start | Load `summaries/current-state.md`, `summaries/roadmap.md`, `decisions/index.md`, `discussions/index.md`, instructions, and assignments. |
| Session start — pending/rejected/completed assignment notifications | Same as legacy. |
| User says "switch project-memory to &lt;profile&gt;" | SKILL.md → change-profile flow: append `profile_history` entry, switch active `profile`, handle minimal ↔ structured shape transitions per `profiles.md` → Migration mechanism. |

**Clear on sight:** any `*(none)*` in a section that now has content (replace the `*(none)*` with the real content).

**Standard reminders (often forgotten):**
- `current-state.md` Last Updated MUST be bumped after every turn that includes commits.
- Roadmap items go into `roadmap.md` as you discover them, not batched at arbitrary boundaries.
