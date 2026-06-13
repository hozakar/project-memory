---
name: project-memory-templates
description: Document templates for project-memory phases and summaries. Read when creating new phase files or summary stubs.
---

# Document Templates

## phase.yml

```yaml
id: phase-YYYYMMDD-short-title
title: Human Readable Title
created_at: YYYY-MM-DD
status: planning
summary: null                # written at Pre-Close Gate: 2-3 sentences — what was done and why
branch: null                 # set if a dedicated branch exists; null for direct commits
related_phases: []
commits: []                  # list of commit hashes; orphaned entries annotated as: abc1234 [orphaned YYYY-MM-DD]
merge_commit: null           # set only if branch was merged; null for direct-commit phases; orphaned form: abc1234 [orphaned YYYY-MM-DD]
closed_at: null              # set to YYYY-MM-DD when phase completes or is abandoned (non-merge)
abandoned_reason: null       # set only when status: abandoned
issues_created: []
issues_resolved: []
decisions_referenced: []
tags: []
created_by:                  # required — see "Author Attribution Fields" below
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:                # required — list grows on status-changing writes
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
```

**Orphan annotation format:** When a commit hash stored in `commits:` or `merge_commit` no longer exists in git (due to rebase, squash, or force-push), the drift audit (Category 7) annotates it in place: `<hash> [orphaned YYYY-MM-DD]`. Do NOT delete orphaned entries — the annotation preserves the historical record while making the broken linkage explicit. Annotated hashes are skipped in subsequent audit passes.

**Sorting rule:** Phases are sorted newest first in `index.yml`. When a new phase is created, prepend it to the `phases` array. This matches the convention in `decisions/index.md` and ensures the Memory Loading Strategy can truncate safely.

Status values: `planning` / `implementation` / `review` / `completed` / `abandoned`

Status transitions:
- `planning â†’ implementation`: first significant commit lands
- `implementation â†’ review`: user requests review, or pre-close gate is triggered
- `review â†’ completed`: pre-close gate passes (all three files complete and non-stub)
- `any â†’ abandoned`: user declares work cancelled, branch deleted without merge, or work superseded by a new phase

When setting `abandoned`: add `abandoned_reason: <brief description>` field and set `closed_at` to today.

---

## plan.md

```md
# Goal
# Context
# Historical Context
  Relevant phases (from index.yml tags)
  Relevant decisions
  Relevant issues
# Existing Constraints
  Architecture constraints / dependencies / technical debt
  Active tensions that affect this plan
# Planned Changes
# Risk Analysis
  Potential side effects / known anti-patterns to avoid
# Success Criteria
```

---

## implementation.md

Do not copy diffs from git. Summarize engineering intent.

```md
# Summary
# Related Commits
# Architectural Impact
# Deviations From Plan
# Notes
# Lessons Learned
```

---

## review-and-fixes.md

```md
# Review & Fix Log

## Round 1
### Findings
(Critical / High / Medium / Low)
### Actions Taken
```

---

## followup.md

```md
# Remaining Open Issues
# Technical Debt Introduced
# Recommended Next Phases
# Refactoring Opportunities
# Testing Improvements
# Architectural Improvements
```

---

## decisions/index.md

One-row-per-decision summary table. Loaded by Claude at session start and consulted during the Pre-Implementation Gate. Each row mirrors the frontmatter of its DECISION file.

The index has two sections: **Active** (scanned during Pre-Implementation Gate) and **Superseded** (historical context only, loaded on demand).

```md
# Decisions Index

One row per decision. Loaded at session start by Memory Loading Strategy step 8. Primary input to the Pre-Implementation Gate's decision check.

Rows sorted newest first. `Status: superseded` rows remain in the Superseded section for historical context but are not active constraints. `Touches` column lists concrete entities — match against an implementation's affected entities to find candidates.

| Date | ID | Scope | Status | Touches | Claim |
|---|---|---|---|---|---|
| 2026-06-08 | DECISION-2026-06-08-decision-cross-reference-mechanism | skill | active | decisions, pre-impl-gate, touches | Decision cross-reference is mandatory pre-implementation step; supersedes is primary, recency is fallback |

## Superseded

| Date | ID | Scope | Status | Touches | Claim | Superseded By |
|---|---|---|---|---|---|---|
```

Maintenance rules:
- Every new `DECISION-*.md` file gets a row added to the Active section in the same write batch.
- When a decision is superseded, move its row from the Active section to the **Superseded** section; update Status to `superseded`; add the Superseded By entry.
- Do not delete rows — historical context is preserved in the Superseded section.
- Claim column is one short sentence — the testable assertion the decision makes. Not a description of the topic.
- Rows sorted newest first within each section.
- Pre-Implementation Gate scans ONLY the Active section. Superseded section is loaded on explicit historical lookup only.

---

## DECISION-YYYY-MM-DD-slug.md

See `conventions.md` for the required frontmatter schema (`id`, `status`, `primary_scope`, `touches`, `supersedes`, `superseded_by`, `adr_id`) and Decision Resolution Rules.

---

## adr/NNNN-slug.md

ADR file created alongside each `DECISION-*.md`. Human-readable, ADR tooling compatible, no frontmatter. Body content mirrors the DECISION file formatted as MADR.

**`adr_id` assignment:** count `.md` files in `adr_dir` (from `.project-memory/config.yml`, default `adr/`), increment by 1, zero-pad to 4 digits (e.g. `0001`, `0042`).

**Slug:** derived from the DECISION slug (drop the `DECISION-YYYY-MM-DD-` prefix).

```md
# <Decision Title>

Date: YYYY-MM-DD
Status: Accepted | Superseded by [NNNN-slug](NNNN-slug.md) | Amended by [NNNN-slug](NNNN-slug.md)

## Context and Problem Statement

<Content from # Context in the DECISION file>

## Considered Options

- Option A
- Option B
- Option C

## Decision Outcome

Chosen option: "<option name>", because <brief rationale from # Decision and # Chosen Solution>.

### Positive Consequences

<Benefits from # Consequences>

### Negative Consequences

<Tradeoffs from # Consequences>

## Pros and Cons of the Options

### Option A

<Rejection reasoning from # Alternatives Considered>

### Option B

<Rejection reasoning from # Alternatives Considered>
```

---

## .project-memory/config.yml

Project-level configuration for project-memory. Created during first-run initialization if ADR support is desired. All fields are optional — defaults apply when file is absent.

```yaml
# .project-memory/config.yml

adr_dir: adr          # directory for ADR files relative to project root (default: adr)

audit_ignore: []      # permanently suppressed audit findings (see audit.md Permanent Skip section)
# Each entry:
#   category: <integer>          # audit category number (1–12)
#   key: "<fingerprint>"         # format is category-specific — see audit.md fingerprint table
#   reason: "<why ignored>"      # human-readable note
#   ignored_at: YYYY-MM-DD       # date the ignore was added
```

Example with entries:
```yaml
adr_dir: adr

audit_ignore:
  - category: 12
    key: "phase-20260611-skill-md-refactor:skil-md"
    reason: "legacy typo in completed phase, accepted as-is"
    ignored_at: 2026-06-12
  - category: 10
    key: "phase-20260608-initial-setup:review-and-fixes.md"
    reason: "initial setup phase pre-dates review discipline"
    ignored_at: 2026-06-12
```

---

## DISCUSSION-YYYY-MM-DD-slug.md

**Frontmatter (required):**
```yaml
---
id: DISCUSSION-YYYY-MM-DD-short-slug
title: Human readable title
date: YYYY-MM-DD
status: open | concluded
summary: Brief summary of the discussion
conclusion: What was decided or resolved
outcome:
  type: phase | decision | issue | roadmap | none
  id: phase-YYYYMMDD-... | DECISION-YYYY-... | ISSUE-YYYY-... | null
  summary: ""               # free-text for roadmap entries; null otherwise
tags: []
created_by:                 # required — see "Author Attribution Fields"
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:               # required — appended on resume / close
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
---
```

**Body:**
```md
# Context
Why this discussion started.

# Discussion Points
What was debated. Key questions and answers. Alternatives floated.

# Conclusions
What was decided. What was ruled out and why.

# Follow-up Actions
What should happen next as a result of this discussion.
```

**Outcome types:**

| type | id field | summary field | Behavior |
|------|----------|---------------|----------|
| phase | phase-YYYYMMDD-slug | null | Discussion triggered a new phase |
| decision | DECISION-YYYY-MM-DD-slug | null | Discussion resulted in a formal decision |
| issue | ISSUE-YYYY-MM-DD-slug | null | Discussion identified a bug or problem |
| roadmap | null | free-text entry | Discussion produced a roadmap item (no immediate phase) |
| `none` | null | null | Discussion was exploratory; no concrete artifact produced |

**Resume rule:** When the user says "continue this discussion", load the existing file, continue, and UPDATE it at close. Do NOT create a new DISCUSSION file for the same topic.

---

## discussions/index.md

One-row-per-discussion summary table. Loaded at session start by SKILL.md Memory Loading Strategy. Consulted during the Pre-Implementation Gate alongside decisions/index.md.

```md
# Discussions Index

| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|
| 2026-06-11 | DISCUSSION-2026-06-11-slug | concluded | phase-20260611-... | feature, discussion | Brief one-line summary |
```

Maintenance rules:
- Every new DISCUSSION-*.md file gets a row added in the same write batch.
- When a discussion is concluded, update its Status to `concluded`.
- Outcome column shows the linked artifact ID or `none`.
- Rows sorted newest first.
- Expired discussions (`outcome: none` AND older than 30 days) are removed from this index and moved to `discussions/archive/`. See `conventions.md` Expiry rule.

## project-memory.md

Target size: 500—1500 words.

```md
# Project Memory

## Project Purpose
## Current Architecture
## Active Tensions
  Unresolved tradeoffs the project is navigating.
## Anti-Patterns
  Agent adds entries autonomously when pattern observed with high confidence.
## Rejected Decisions
  Alternatives not taken. One-liner per entry pointing to the full DECISION-YYYY-MM-DD-slug.md file.
  Agent asks user “why did we not go with X?” when reason is unknown.
## Open Problems
## Technical Debt
## Important Constraints
## Recent Completed Work
## Historical Milestones
## Current Priorities
## Recommended Next Phase
## Navigation Map
  - Architectural questions → architecture.md + DECISION-YYYY-MM-DD-* files
  - Active work → current-state.md + open phase directory
  - History in a specific area → filter phases/index.yml by tag
  - Known issues → active-issues.md → issues/open/ (open) or issues/closed/ (resolved)
  - Past tradeoffs → decisions/
  - Project philosophy → project-memory.md
```

**Rolling summaries rule (Recent Completed Work):**
- Cap: Recent Completed Work holds at most **20 entries**. When a 21st entry is added, the oldest entry is moved out.
- Overflow destination: moved entries are condensed into one-liners and appended to **Historical Milestones**, grouped by era (e.g. `2026-06 early`, `2026-Q3`). One era line covers multiple phases.
- Do not delete overflowed entries — they move, never disappear.
- Historical Milestones is append-only. It is not capped. Its one-liners are intentionally terse; full detail remains in the phase directory.

---

## Author Attribution Fields

The `created_by` and `contributors` fields are **required** on phase / decision / discussion / issue records. Full rules are in `conventions.md` → Author Attribution. This subsection covers the schema only.

**Shape:**
```yaml
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
```

**Sentinel for missing git identity:** `{ name: "unknown", email: "unknown" }`. Used when `git config user.name` or `git config user.email` is empty. No user escalation.

**Dedup rule:** Same email is never added twice to `contributors`.

**`contributors` growth triggers (per record type):**

| Record     | Triggers that append the current identity to `contributors` |
|------------|-------------------------------------------------------------|
| phase      | first or substantive write of `implementation.md` / `review-and-fixes.md` / `followup.md`; phase close (status: completed) |
| decision   | initial write; status change (active → superseded / amended) |
| discussion | initial write; resume update; close (status: concluded) |
| issue      | initial write; status change (open → closed) |

**Out of scope (do NOT add these fields):** `era-*.md`, `summaries/*.md`, `MEMORY.md`, `adr/NNNN-*.md`, all index files (`phases/index.yml`, `decisions/index.md`, `discussions/index.md`).

---

## Era Summary (era-NNN.md)

Stored in `.project-memory/eras/era-NNN.md`. Created manually when a cohort of ~10 phases forms a natural narrative arc. Indexed into the vector DB via `index_era`.

```markdown
---
id: era-NNN
title: "Era N — Short Descriptive Title (phases X–Y)"
phases:
  - phase-YYYYMMDD-slug
date_range: "YYYY-MM-DD to YYYY-MM-DD"
---

# Era N — Title

Narrative summary (~500 words) of the era's arc: what motivated the work, the key decisions made, how the project evolved, and what the era left behind for the next cohort.
```

---

## INSTRUCTION-YYYY-MM-DD-slug.md

Instruction records capture user workflow preferences as short prompts injected into LLM context at session start. User-scoped via `created_by`, stored in `.project-memory/instructions/`.

**Frontmatter (required):**
```yaml
---
id: INSTRUCTION-YYYY-MM-DD-short-slug
state: active              # active | dropped
created_by:                # required — see Author Attribution
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
mode: prompt               # always prompt (reserved for future rule mode)
trigger: null              # always null for prompt mode
origin: null               # INSTRUCTION-ID if forked from another user
origin_updated: false      # true when origin instruction has been modified since fork
---
```

**Body:**
```md
# Prompt
<Short, direct instruction injected into LLM context at session start>
```

**Naming:** `INSTRUCTION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the instruction topic
- Use kebab-case
- Example: `INSTRUCTION-2026-06-13-branch-per-phase.md`

**Lifecycle:**
- `active` → loaded at session start for the matching user
- `dropped` → retained but not loaded
- No auto-expiry; user explicitly drops via "drop instruction X"

**Cross-user sharing (fork model):**
- User adopts another's instruction → new INSTRUCTION created with `created_by` set to current user, `origin` set to source ID
- If original is updated → `origin_updated: true` set on fork; user prompted at session start

**Scope limits:**
- NOT architectural decisions — no ADR counterpart
- NOT scanned during Pre-Implementation Gate
- NOT a deterministic rule engine — mode is always `prompt`
- Filesystem is source of truth; vector DB is derived read-optimized index

---

## maintainers.md

```yaml
maintainers:
  - email: "first-maintainer@example.com"
```

Flat list of maintainer emails. Anyone can edit. No owner role. Read at session start to determine whether the current user receives era creation prompts.

