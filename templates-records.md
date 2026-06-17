---
name: project-memory-templates-records
description: Record-type templates for project-memory. Covers DECISION, DISCUSSION, INSTRUCTION, ASSIGNMENT files and their indexes (decisions/index.md, discussions/index.md, assignments/index.yml). Also contains the shared Author Attribution fields.
---

# Decision Templates

## decisions/index.md

One-row-per-decision summary table. Loaded by Claude at session start and consulted during the Pre-Implementation Gate. Each row mirrors the frontmatter of its DECISION file.

The index has two sections: **Active** (scanned during Pre-Implementation Gate) and **Superseded** (historical context only, loaded on demand).

```md
# Decisions Index

One row per decision. Loaded at session start by Memory Loading Strategy step 8. Primary input to the Pre-Implementation Gate's decision check.

Rows sorted newest first. `Status: superseded` rows remain in the Superseded section for historical context but are not active constraints. `Touches` column lists concrete entities — match against an implementation's affected entities to find candidates. `Global` column is `Yes` when the decision's frontmatter has `applies_globally: true` (cross-cutting policy surfaced at every Pre-Implementation Gate); `-` otherwise.

| Date | ID | Scope | Status | Global | Touches | Claim |
|---|---|---|---|---|---|---|
| 2026-06-08 | DECISION-2026-06-08-decision-cross-reference-mechanism | skill | active | Yes | decisions, pre-impl-gate, touches | Decision cross-reference is mandatory pre-implementation step; supersedes is primary, recency is fallback |

## Superseded

| Date | ID | Scope | Status | Global | Touches | Claim | Superseded By |
|---|---|---|---|---|---|---|---|
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

See `conventions.md` for the required frontmatter schema (`id`, `status`, `provenance`, `primary_scope`, `touches`, `supersedes`, `superseded_by`, `adr_id`) and Decision Resolution Rules.

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

# Discussion Templates

## DISCUSSION-YYYY-MM-DD-slug.md

**Frontmatter (required):**
```yaml
---
id: DISCUSSION-YYYY-MM-DD-short-slug
title: Human readable title
date: YYYY-MM-DD
status: open | concluded
provenance: directive | collaborative  # directive = user-imposed; collaborative = joint design
summary: Brief summary of the discussion
conclusion: What was decided or resolved
outcome:
  type: phase | decision | issue | roadmap | none
  id: phase-YYYYMMDD-... | DECISION-YYYY-... | ISSUE-YYYY-... | null
  summary: ""               # free-text for roadmap entries; null otherwise
tags: []
created_by:                 # required — see Author Attribution below
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

---

# Instruction Templates

## INSTRUCTION-YYYY-MM-DD-slug.md

Instruction records capture user workflow preferences as short prompts injected into LLM context at session start and re-injected at every gate checkpoint (Pre-Implementation Gate, Pre-Close Gate, Discussion trigger, Topic Shift). User-scoped via `created_by`, stored in `.project-memory/instructions/`.

**Frontmatter (required):**
```yaml
---
id: INSTRUCTION-YYYY-MM-DD-short-slug
state: active              # active | dropped
created_by:                # required — see Author Attribution below
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
mode: prompt               # always prompt — re-injected at every gate, no per-instruction trigger needed
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

# Assignment Templates

## ASSIGNMENT-YYYY-MM-DD-slug.md

Assignment records capture cross-user task delegation with persistent session-start notifications. Stored in `.project-memory/assignments/`.

**Frontmatter (required):**
```yaml
---
id: ASSIGNMENT-YYYY-MM-DD-short-slug
status: pending | accepted | rejected | ongoing | completed
type: direct | freeform

assigned_to:
  name: "Mehmet Yilmaz"
  email: "mehmet@example.com"
assigned_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
assigned_at: YYYY-MM-DD

# Direct assignment — linked to existing record
target_type: issue | phase | discussion | roadmap_item | null
target_id: ISSUE-YYYY-MM-DD-slug | null

# Freeform assignment — standalone task
description: null            # required for freeform, optional for direct

# Rejection
rejected_at: null
rejection_reason: null

# Completion
completed_at: null
completion_note: null
completed_phase_id: null
completed_decision_id: null
completed_discussion_id: null

# Reminder tracking
remind_count: 0
last_reminded_at: null

# Attribution
created_by:
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
---
```

**Body:**
```md
# Task Description
<For direct: summary of the target record>
<For freeform: the full task description, context, and expectations>

# Target
<For direct: link and key details from the target file>
<For freeform: "Freeform assignment — no linked record.">
```

**Naming:** `ASSIGNMENT-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the task topic (e.g. `mehmet-review-auth`, `ahmet-payment-research`)
- Use kebab-case
- Example: `ASSIGNMENT-2026-06-14-mehmet-review-auth-bug.md`

**State machine:**
```
pending → accepted → ongoing → completed
pending → rejected → (assigner loop: assign to another / do it yourself / remind me later)
pending → remind me later → pending (remind_count incremented)
rejected → assign to another → new ASSIGNMENT (new ID)
rejected → do it yourself → completed (by assigner)
rejected → remind me later → pending (remind_count++)
```

**Completion rules:**
- Only the assignee can mark `completed` (assigner uses "Do It Yourself" to close from their side)
- At least one evidence field required: `completion_note`, `completed_phase_id`, `completed_decision_id`, or `completed_discussion_id`
- `completed_at` set when status transitions to `completed`

**Session-start discovery:**
- MCP: `search_memory` with `assigned_to_email` filter for pending/accepted/ongoing assignments; `assigned_by_email` filter for rejected/completed notifications
- Fallback: directory scan of `.project-memory/assignments/` filtered by frontmatter `assigned_to.email` / `assigned_by.email`

**Author attribution:** Set `created_by` (assigned_by identity) and seed `contributors` on creation. Append current git identity to `contributors` on status change and on completion (dedup by email). Full rules: `conventions.md` → Author Attribution.

## assignments/index.yml

One-row-per-assignment summary table. Loaded at session start. Rows sorted newest first.

```yaml
# Assignments Index
# Rows sorted newest first.

assignments:
  - id: ASSIGNMENT-2026-06-14-mehmet-review-auth
    status: pending
    type: direct
    assigned_to: "Mehmet Yilmaz <mehmet@example.com>"
    assigned_by: "Hakan Ozakar <hozakar@gmail.com>"
    target: "ISSUE-2026-06-14-auth-bug"
    assigned_at: 2026-06-14
    completed_at: null
```

**Maintenance rules:**
- Every new `ASSIGNMENT-*.md` file gets a row added at the top (newest first).
- Status updated on every state transition.
- Rows never deleted — completed and rejected assignments remain for history.

---

# Author Attribution Fields

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
