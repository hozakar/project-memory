---
name: project-memory-conventions-records
description: Issue, instruction, and assignment record lifecycles — creation, state machines, session-start UX, completion rules.
---

# Issues

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

---

# Instructions

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

# Assignments

**Purpose:** ASSIGNMENT is a **continuity and handoff mechanism** — not a task management system. Primary use case: a developer departs or becomes unavailable with unfinished work; their context is transferred to a named teammate so nothing is lost between sessions. Secondary use case: intentional, rare domain handoffs ("this area is yours"). Assignments are created rarely. project-memory is not Jira.

Assignment records are independent records stored in `.project-memory/assignments/` with their own `index.yml` summary table.

**Naming:** `ASSIGNMENT-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the task topic (e.g. `mehmet-review-auth`, `ahmet-payment-research`)
- Use kebab-case
- Example: `ASSIGNMENT-2026-06-14-mehmet-review-auth-bug.md`

**Frontmatter (required):**
See `templates.md` for the full schema. Key fields:
- `id`: unique identifier
- `status`: `pending` | `accepted` | `rejected` | `ongoing` | `completed`
- `type`: `direct` (linked to existing record) or `freeform` (standalone task)
- `assigned_to` / `assigned_by`: `{ name, email }` objects
- `target_type` / `target_id`: link to existing record (null for freeform)
- `remind_count`: incremented on each `remind me later` action

**State machine:**
```
pending → accepted → ongoing → completed
pending → rejected → (assigner loop)
pending → remind me later → pending (remind_count++)

After rejection — assigner options:
- Assign to Another → creates new ASSIGNMENT (new ID, new assigned_to)
- Do It Yourself → marks original as completed (by assigner)
- Remind Me Later → resets to pending (remind_count++)
```

**Session-start UX (assignee — pending assignments):**
Every session, pending/ongoing assignments for the current user are loaded via `assigned_to.email` filter. A single passive line is shown — no interaction expected:
```
📋 2 pending assignments — "bana atanan görevler" dersen listelerim
```
When the user asks to see their assignments, full details are shown and actions (accept / reject / remind me later) become available at that point.

**Session-start UX (assigner — rejected assignments):**
Every session, rejected assignments made by the current user are shown as a passive line:
```
📋 1 rejected assignment — "reddettiğim assignment'lar" dersen listelerim
```
When the user asks, full details and actions (assign to another / do it yourself / remind me later) are shown.

**Session-start UX (assigner — completed notifications):**
Completed assignments are shown ONCE (not persistent). Options:
- `[View Details]` — opens completion note and any linked artifacts
- `[Dismiss]` — clears the notification

**Completion rules:**
- Only the assignee can mark `completed` (assigner uses "Do It Yourself" for their side)
- At least one evidence field required: `completion_note`, `completed_phase_id`, `completed_decision_id`, or `completed_discussion_id`

**Permission model:**
Open — anyone can assign to anyone. Maintainer role is not extended (scope remains era creation gating). Rejection mechanism is the safety net against misuse.

**Expiry:**
No automatic expiry. Assignments persist until explicitly resolved (completed or rejected + resolved by assigner). Cat 14b (stale pending >30d) serves as the backstop for abandoned assignments.

**Author attribution:**
On creation: `created_by` is set to `assigned_by` identity (run `git config user.name` + `git config user.email`; missing → `unknown`). `contributors` is seeded with the same identity.
On status change (accepted, rejected, ongoing, completed): append the current git identity to `contributors` (dedup by email). See Author Attribution section above.

**Pre-Implementation Gate integration:**
Assignments are NOT scanned during the Pre-Implementation Gate. They are user-scoped workflow artifacts, not architectural constraints.

**Vector DB:** Assignments are indexed via `index_assignment` MCP tool. File system is source of truth; DB is derived read-optimized index.
