---
name: project-memory-conventions
description: Naming conventions and lifecycle rules for DECISION and ISSUE files. Read when creating or closing decisions or issues.
---

# Conventions

## Language

All skill files (`SKILL.md`, `init.md`, `audit.md`, `conventions.md`, `templates.md`) are written in English.

Rationale: skill files are LLM-facing rules â€” they never surface directly to the end user. English is the LLM's native register for instruction-following. User-facing communication (conversation, summaries shown to the user) may follow the user's preferred language; the rule files themselves do not.

This applies to all text inside the skill files: prose, comments, placeholder identifiers, headings, table cells, code-block strings used as examples. Memory data under `.project-memory/` (which the user authors and reads) is NOT subject to this rule.

---

## Architectural Decision Records

Create when architecture changes, major dependencies are introduced, important tradeoffs are made, or a significant alternative was rejected.

**Naming:** `DECISION-YYYY-MM-DD-<short-slug>.md`
- Date first â€” chronological sort order in directory listings
- Slug describes the decision topic, not the outcome (e.g. `no-auth-profile-only`, `stop-failed-cancel-cancelled`)
- Use kebab-case
- Example: `DECISION-2026-06-06-no-auth-profile-only.md`

**Frontmatter (required):**
```yaml
---
id: DECISION-YYYY-MM-DD-short-slug
status: active | superseded | amended
primary_scope: <category>           # auth, persistence, deployment, ui, schema, ...
touches: [entity1, entity2]         # concrete names â€” see Touches Field Guidance
supersedes: DECISION-YYYY-MM-DD-... # null if none
superseded_by: DECISION-YYYY-MM-DD-... # null if none; set when a later decision overrides this
adr_id: null                         # assigned integer (0001, 0002, ...) at write time; matches adr/ filename prefix
---
```

**Body:**
```md
# Context
# Alternatives Considered
  Option A â€” why rejected
  Option B â€” why rejected
# Decision
# Chosen Solution
# Reasoning
# Consequences
  Benefits / Tradeoffs / Future implications
```

Rejected alternatives are first-class content. Future agents need to know what was tried and why it didn't fit.

**After writing any DECISION file:**
1. Add a one-liner per rejected alternative to `project-memory.md` â†’ Rejected Decisions. The DECISION file has the full reasoning; the summary entry is a one-line pointer (using the full DECISION-YYYY-MM-DD-slug identifier).
2. Add a row to `decisions/index.md` (see `templates.md`) â€” this is the file Claude loads at session start to surface active decisions during the Pre-Implementation Gate.
3. If `supersedes` is set, update the superseded file: change its `status` to `superseded` and set its `superseded_by` field. Move its row in `decisions/index.md` from the **Active** section to the **Superseded** section and update the Status cell. The index has two sections; only the Active section is scanned during the Pre-Implementation Gate.
4. Create the corresponding `adr/` file: count existing `.md` files in `adr_dir` (from `.project-memory/config.yml`, default `adr/`), assign next integer zero-padded to 4 digits, set `adr_id` in the DECISION frontmatter to that value, write `<adr_dir>/<adr_id>-<slug>.md` using the ADR file template from `templates.md`.
5. If `supersedes` is set, also update the superseded DECISION's `adr/` counterpart: change its Status line to `Superseded by [NNNN-slug](NNNN-slug.md)`.

**ADR Status mapping:**

| DECISION `status` | ADR file Status line |
|---|---|
| `active` | `Accepted` |
| `superseded` | `Superseded by [NNNN-slug](NNNN-slug.md)` |
| `amended` | `Amended by [NNNN-slug](NNNN-slug.md)` |

---

## Decision Resolution Rules

When more than one decision touches the same area, priority is determined in this order:

1. **Explicit supersession.** If decision B has `supersedes: A`, then A is `superseded` and B is the active record. Recency does not enter this case.
2. **Active conflict.** If two `active` decisions overlap (same `primary_scope` or intersecting `touches`) and their claims contradict, do NOT silently resolve. Surface both to the user and ask which holds, or whether one supersedes the other.
3. **Active refinement.** If two `active` decisions overlap but their claims do not contradict (one extends or details the other), both remain active. No question needed.
4. **Recency fallback.** Only used when no `supersedes` is set and no scope/touches overlap exists between candidates. This is the weakest signal â€” a recent unrelated decision must not override an older architectural one. Recency is a tiebreaker within the same active scope, never a rule that overrides explicit references.

`superseded` decisions remain in the index's **Superseded** section for historical context. Claude reads them as past state, not as active constraint. They are NOT loaded during Pre-Implementation Gate scanning — only on explicit historical lookup.

---

## Touches Field Guidance

The `touches` field is the primary axis for detecting decision intersections during the Pre-Implementation Gate. It must list **concrete entities** that a decision affects â€” not abstract categories.

Good entries: `user_id`, `auth_token`, `session_store`, `deployment_target`, `db_schema_users`, `frontend_router`, `electron_main_process`.

Avoid: `user` (too abstract â€” use `user_id`, `user_profile`, etc.), `auth` (use the concrete artifact: `auth_token`, `auth_middleware`), `system` (meaningless).

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

## Discussions

Discussions capture exploratory conversations between the user and the LLM that may lead to decisions, phases, issues, or roadmap entries.

**Naming:** `DISCUSSION-YYYY-MM-DD-<short-slug>.md`
- Date first -- chronological sort order
- Slug describes the topic (e.g. `discussion-feature-design`, `auth-approach-debate`)
- Use kebab-case
- Example: `DISCUSSION-2026-06-11-discussion-feature-design.md`

**Frontmatter (required):**
See `templates.md` for the full schema. Key fields:
- `id`: unique identifier
- `status`: `open` (still active / can be resumed) or `concluded` (finished)
- `outcome.type`: `phase`, `decision`, `issue`, `roadmap`, or `none`
- `outcome.id`: the ID of the linked artifact (null for roadmap and none)

**Lifecycle:**
```
Trigger (explicit or implicit)
  -> Discussion Mode engages
      -> LLM loads discussions/index.md for prior context
      -> Conversation proceeds
  -> Close discussion
      -> Determine outcome type:
          phase -> offer to create phase
          decision -> offer to create DECISION file
          issue -> offer to create ISSUE file
          roadmap -> add entry to roadmap.md
          none -> just save the discussion
      -> Write DISCUSSION-YYYY-MM-DD-slug.md
      -> Add row to discussions/index.md
```

**Resume:**
User says "continue discussion X" -> load the full DISCUSSION file -> continue conversation -> UPDATE the same file at close. Status remains `open` until conclusively finished. If the outcome changes on resume, update the frontmatter accordingly.

**Expiry:**
Discussions with `outcome.type: none` AND `date` older than 30 days are expired:
1. Move the file from `discussions/` to `discussions/archive/`.
2. Remove its row from `discussions/index.md`.
3. Archived discussions are excluded from session-start loading and Pre-Implementation Gate scanning — accessible on explicit request only.

Discussions with any other outcome type (`phase`, `decision`, `issue`, `roadmap`) are never expired automatically regardless of age. The 30-day threshold is intentionally lenient; tighten in conventions.md if noise accumulates faster than expected.

**Pre-Implementation Gate integration:**
When the gate scans `decisions/index.md` for `touches` overlap, also scan `discussions/index.md` for discussions with outcome types that relate to the proposed implementation. If a past discussion explicitly concluded against the current direction, surface it as a directional conflict alongside decision conflicts.

**Discussion index maintenance:**
Same rules as `decisions/index.md`: add row on creation, update on conclusion, rows sorted newest first.
