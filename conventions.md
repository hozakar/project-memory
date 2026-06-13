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

## Author Attribution

All phase / decision / discussion / issue records carry author attribution via two required frontmatter fields:

```yaml
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
```

**Capture.** At every record-creating or status-changing write, the LLM runs:

```
git config user.name
git config user.email
```

The pair becomes the current identity. If either command fails or returns an empty string, the current identity falls back to the sentinel `{ name: "unknown", email: "unknown" }`. **The user is NEVER prompted** — soft-fail is intentional, so the skill works during install, trial, or external contributor scenarios without git identity configured.

**`created_by`** is set once at record creation and never changed.

**`contributors`** is appended on **status-changing writes only** — not on re-indents, format fixes, or passive reads. Dedup by `email`: the same contributor is not added twice. Growth triggers per record type:

| Record     | Triggers that append the current identity to `contributors` |
|------------|-------------------------------------------------------------|
| phase      | first or substantive write of `implementation.md` / `review-and-fixes.md` / `followup.md`; phase close (status: completed) |
| decision   | initial write; status change (active → superseded / amended) |
| discussion | initial write; resume update; close (status: concluded) |
| issue      | initial write; status change (open → closed) |

**In scope:** `phase.yml`, `DECISION-YYYY-MM-DD-*.md`, `DISCUSSION-YYYY-MM-DD-*.md`, `ISSUE-YYYY-MM-DD-*.md`.

**Out of scope (do NOT add these fields):** `era-NNN.md` (project-wide), `summaries/*.md` (project-wide), `MEMORY.md` (single-user), `adr/NNNN-*.md` (MADR has no Author field — DECISION is canonical), index files (`phases/index.yml`, `decisions/index.md`, `discussions/index.md` — token economy).

**No audit category.** Soft-fall to `unknown` makes "missing field" impossible by construction; the drift audit does not check attribution.

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
provenance: directive | collaborative  # directive = user-imposed rule; collaborative = joint design
primary_scope: <category>           # auth, persistence, deployment, ui, schema, ...
touches: [entity1, entity2]         # concrete names â€” see Touches Field Guidance
supersedes: DECISION-YYYY-MM-DD-... # null if none
superseded_by: DECISION-YYYY-MM-DD-... # null if none; set when a later decision overrides this
adr_id: null                         # assigned integer (0001, 0002, ...) at write time; matches adr/ filename prefix
created_by:                          # required — see Author Attribution section below
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:                        # required — appended on status change
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
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
0. Set `created_by` and seed `contributors` from current git identity (see Author Attribution section above). On a status change (`active → superseded` / `amended`), append the current identity to `contributors` of BOTH the new decision and the affected superseded decision; dedup by email.
1. Add a one-liner per rejected alternative to `project-memory.md` â†’ Rejected Decisions. The DECISION file has the full reasoning; the summary entry is a one-line pointer (using the full DECISION-YYYY-MM-DD-slug identifier).
2. Add a row to `decisions/index.md` (see `templates.md`) â€” this is the file Claude loads at session start to surface active decisions during the Pre-Implementation Gate.
3. If `supersedes` is set, update the superseded file: change its `status` to `superseded` and set its `superseded_by` field. Move its row in `decisions/index.md` from the **Active** section to the **Superseded** section and update the Status cell. The index has two sections; only the Active section is scanned during the Pre-Implementation Gate.
4. **If `adr_enabled: true`** (or absent) in `.project-memory/config.yml`: create the corresponding `adr/` file — count existing `.md` files in `adr_dir` (from config, default `adr/`), assign next integer zero-padded to 4 digits, set `adr_id` in the DECISION frontmatter to that value, write `<adr_dir>/<adr_id>-<slug>.md` using the ADR file template from `templates.md`. **If `adr_enabled: false`**: skip this step; leave `adr_id: null` in the DECISION frontmatter.
5. If `supersedes` is set AND `adr_enabled: true`: also update the superseded DECISION's `adr/` counterpart — change its Status line to `Superseded by [NNNN-slug](NNNN-slug.md)`. If `adr_enabled: false`, skip.

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
created_by:                   # required — see Author Attribution section
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:                 # required — appended on close
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
---
```

**On close:** update `status` to `closed`, add `resolved` and `resolved_in` fields, append current git identity to `contributors` (dedup by email), then move the file from `issues/open/` to `issues/closed/`.

**On open:** set `created_by` and seed `contributors` with the current git identity (see Author Attribution section).

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
      -> Apply Relevancy Scoring Gate (see below)
          explicit user save -> skip scoring, always write
          score < 60        -> silent drop; proceed to phase/decision if applicable
          score 60–80       -> ask user: "Do you think we should save this discussion?" (yes/no)
          score >= 80       -> auto-save
          safety rule hit   -> escalate to user (overrides silent drop)
      -> If saving: determine outcome type:
          phase -> offer to create phase
          decision -> offer to create DECISION file
          issue -> offer to create ISSUE file
          roadmap -> add entry to roadmap.md
          none -> just save the discussion
      -> Write DISCUSSION-YYYY-MM-DD-slug.md
      -> Add row to discussions/index.md
```

**Relevancy Scoring Gate:**

Score is computed at discussion close using four weighted criteria (100-point total):

| # | Criterion | Weight |
|---|-----------|--------|
| 1 | Conclusion reached (explicit rejection with reasoning counts) | 25 |
| 2 | Long-term impact on future decisions | 55 |
| 3 | Enough material to fill a discussion file | 10 |
| 4 | Enough material to fill a decision file | 10 |

**Thresholds:**

| Score | Action |
|-------|--------|
| < 60 | Silent drop — no file written |
| 60–80 | Escalate to user: "Do you think we should save this discussion?" (yes/no) |
| ≥ 80 | Auto-save — write file immediately |

**Safety rule:** If the long-term impact subscore (criterion 2) exceeds 75% of its maximum (i.e., > ~41/55), the discussion is always escalated to the user regardless of total score. This prevents silently dropping systemically important conversations that lack a formal conclusion.

**Long-term impact rubric** (for LLM scoring consistency):

| Score | Level | Examples |
|-------|-------|---------|
| 0–10 | Trivial/cosmetic | Separator line color, minor naming tweak |
| 10–25 | Local | Approach choice within a single module |
| 25–40 | Significant | Architectural decision affecting one domain |
| 40–55 | Systemic | Shapes how future decisions are made; cross-cutting concerns |

**Outcome chain** (when a discussion is saved, it must link to its downstream artifact):

```
discussion → decision (if conclusion without immediate implementation)
                └→ phase    (when decision is implemented later)
                └→ roadmap  (if decision is pending / no phase yet)

discussion → phase (if conversation leads directly to implementation)
```

**Resume:**
User says "continue discussion X" -> load the full DISCUSSION file -> continue conversation -> UPDATE the same file at close. Status remains `open` until conclusively finished. If the outcome changes on resume, update the frontmatter accordingly. On every resume update AND on close, append the current git identity to `contributors` (dedup by email).

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

---

## Instructions

Instruction records capture user workflow preferences as short prompts. They are user-scoped, stored in `.project-memory/instructions/`, and loaded at session start for the current user only.

**Naming:** `INSTRUCTION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the instruction topic, not the state
- Use kebab-case
- Example: `INSTRUCTION-2026-06-13-branch-per-phase.md`

**Frontmatter (required):**
```yaml
---
id: INSTRUCTION-YYYY-MM-DD-short-slug
state: active | dropped
created_by:               # required — see Author Attribution
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
mode: prompt              # always prompt
trigger: null             # always null for prompt mode
origin: null              # INSTRUCTION-ID if forked
origin_updated: false     # true when origin modified since fork
---
```

**On creation:** set `created_by` from current git identity (see Author Attribution section). No `contributors` field — instructions are single-owner.

**On state change (`active` → `dropped`):** update frontmatter. Instruction is retained but not loaded at session start.

**Session loading:**
- At session start, current user's active instructions are loaded via MCP `search_memory` with `created_by_email` filter (fallback: directory scan filtered by `created_by.email`)
- ≥5 active instructions triggers a warning
- Other users' instructions are never loaded without explicit request

**Cross-user sharing (fork model):**
- User requests "I want to use instruction X" → LLM creates new INSTRUCTION with `created_by` set to current user, `origin: X`
- If origin instruction is modified → `origin_updated: true` set on fork; user is prompted to review at session start
- Instructions from other users can be listed via explicit search ("show me X's instructions")

**What instructions are NOT:**
- NOT architectural decisions — no ADR counterpart, no Pre-Implementation Gate scanning
- NOT a deterministic rule engine — `mode` is always `prompt`
- NOT in decisions/index.md or discussions/index.md

**Vector DB:** Instructions are indexed via `index_instruction` MCP tool. File system is source of truth; DB is derived read-optimized index.

---

## Maintainer Role

Project-memory uses a lightweight two-role system for era creation gating only. All other operations are unrestricted.

**Roles:**
- **Maintainer** — receives era creation prompts when ~10 phases accumulate. Can decide to create an era.
- **Developer** — default role. No era prompts. Everything else is identical to maintainer.

**Source of truth:** `.project-memory/maintainers.md` — a flat YAML file:

```yaml
maintainers:
  - email: "alice@example.com"
  - email: "bob@example.com"
```

**Role determination (session start):**
1. Read `maintainers.md`
2. Run `git config user.email`
3. If email is in the list → maintainer
4. Otherwise → developer

**Editing rules:**
- Anyone can edit `maintainers.md` (no restrictions — git controls push permissions)
- Add or remove emails to promote/demote
- Changes take effect next session

**Gated actions:**
| Action | Developer | Maintainer |
|--------|-----------|------------|
| Audit | ✅ | ✅ |
| Phase management | ✅ | ✅ |
| Era creation decision | ❌ (silent) | ✅ (prompted) |

**What this is NOT:**
- NOT a security boundary (git handles that)
- NOT tamper-proof
- NOT a general access-control system
