---
name: project-memory-conventions
description: Naming conventions and lifecycle rules for DECISION and ISSUE files. Read when creating or closing decisions or issues.
---

# Conventions

## Language

All skill files (`SKILL.md`, `init.md`, `audit.md`, `conventions.md`, `templates.md`) are written in English.

Rationale: skill files are LLM-facing rules — they never surface directly to the end user. English is the LLM's native register for instruction-following. User-facing communication (conversation, summaries shown to the user) may follow the user's preferred language; the rule files themselves do not.

This applies to all text inside the skill files: prose, comments, placeholder identifiers, headings, table cells, code-block strings used as examples. Memory data under `.project-memory/` (which the user authors and reads) is NOT subject to this rule.

---

## Architectural Decision Records

Create when architecture changes, major dependencies are introduced, important tradeoffs are made, or a significant alternative was rejected.

**Naming:** `DECISION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order in directory listings
- Slug describes the decision topic, not the outcome (e.g. `no-auth-profile-only`, `stop-failed-cancel-cancelled`)
- Use kebab-case
- Example: `DECISION-2026-06-06-no-auth-profile-only.md`

**Frontmatter (required):**
```yaml
---
id: DECISION-YYYY-MM-DD-short-slug
status: active | superseded | amended
primary_scope: <category>           # auth, persistence, deployment, ui, schema, ...
touches: [entity1, entity2]         # concrete names — see Touches Field Guidance
supersedes: DECISION-YYYY-MM-DD-... # null if none
superseded_by: DECISION-YYYY-MM-DD-... # null if none; set when a later decision overrides this
---
```

**Body:**
```md
# Decision
# Context
# Alternatives Considered
  Option A — why rejected
  Option B — why rejected
# Chosen Solution
# Reasoning
# Consequences
  Benefits / Tradeoffs / Future implications
```

Rejected alternatives are first-class content. Future agents need to know what was tried and why it didn't fit.

**After writing any DECISION file:**
1. Add a one-liner per rejected alternative to `project-memory.md` → Rejected Decisions. The DECISION file has the full reasoning; the summary entry is a one-line pointer (using the full DECISION-YYYY-MM-DD-slug identifier).
2. Add a row to `decisions/index.md` (see `templates.md`) — this is the file Claude loads at session start to surface active decisions during the Pre-Implementation Gate.
3. If `supersedes` is set, update the superseded file: change its `status` to `superseded` and set its `superseded_by` field. Also update its row in `decisions/index.md` to reflect the new status.

---

## Decision Resolution Rules

When more than one decision touches the same area, priority is determined in this order:

1. **Explicit supersession.** If decision B has `supersedes: A`, then A is `superseded` and B is the active record. Recency does not enter this case.
2. **Active conflict.** If two `active` decisions overlap (same `primary_scope` or intersecting `touches`) and their claims contradict, do NOT silently resolve. Surface both to the user and ask which holds, or whether one supersedes the other.
3. **Active refinement.** If two `active` decisions overlap but their claims do not contradict (one extends or details the other), both remain active. No question needed.
4. **Recency fallback.** Only used when no `supersedes` is set and no scope/touches overlap exists between candidates. This is the weakest signal — a recent unrelated decision must not override an older architectural one. Recency is a tiebreaker within the same active scope, never a rule that overrides explicit references.

`superseded` decisions remain in the index for historical context. Claude reads them as past state, not as active constraint.

---

## Touches Field Guidance

The `touches` field is the primary axis for detecting decision intersections during the Pre-Implementation Gate. It must list **concrete entities** that a decision affects — not abstract categories.

Good entries: `user_id`, `auth_token`, `session_store`, `deployment_target`, `db_schema_users`, `frontend_router`, `electron_main_process`.

Avoid: `user` (too abstract — use `user_id`, `user_profile`, etc.), `auth` (use the concrete artifact: `auth_token`, `auth_middleware`), `system` (meaningless).

Rule of thumb: if you can't grep for the entity in code or config, it's too abstract.

When implementing a new feature, Claude lists the concrete entities the feature touches, then cross-references `decisions/index.md` against that list. Overlap = candidate. Directional conflict among candidates = batch question. Overlap without conflict = silent note.

---

## Issues

Issues track bugs and problems that need fixing. Open issues live in `issues/open/`, resolved issues in `issues/closed/`.

**Naming:** `ISSUE-YYYY-MM-DD-<short-slug>.md`
- Date = discovery date
- Slug describes the problem
- Use kebab-case
- Example: `ISSUE-2026-06-07-nothing-to-commit-detection.md`

**Frontmatter:**
```yaml
---
id: ISSUE-YYYY-MM-DD-short-slug
title: Human readable title
severity: critical | high | medium | low
status: open | closed
area: pipeline | git | ui | config | ...
discovered: YYYY-MM-DD
resolved: YYYY-MM-DD          # set when closing
resolved_in: phase-id (commit hash)   # set when closing
---
```

**On close:** update `status` to `closed`, add `resolved` and `resolved_in` fields, then move the file from `issues/open/` to `issues/closed/`.
