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

**Frontmatter:** See templates for the frontmatter schema. Naming: ISSUE-YYYY-MM-DD-slug.md. On close: update status, add resolved/resolved_in, append git identity to contributors, move file from open/ to closed/. On open: set created_by and seed contributors with the current git identity (see Author Attribution section).

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
mode: prompt              # always prompt — re-injected at every gate, no per-instruction config needed
origin: null              # INSTRUCTION-ID if forked
origin_updated: false     # true when origin modified since fork
---
```

**On creation:** set `created_by` from current git identity. No `contributors` field — single-owner.

**On state change (`active` → `dropped`):** update frontmatter. Retained but not loaded.

**Session loading:** Instructions are loaded at session start and re-injected at gate checkpoints — see `standard/gates.md` GATE 0 and `standard/protocol.md` Session-start Ordering. Cross-user fork model and scope limits are described below.

**Cross-user sharing (fork model):**
- User requests "I want to use instruction X" → new INSTRUCTION with `created_by` set to current user, `origin: X`
- If origin instruction is modified → `origin_updated: true` set on fork; user prompted to review at session start
- Other users' instructions listed via explicit search ("show me X's instructions")

**What instructions are NOT:**
- NOT architectural decisions — no ADR counterpart, no Pre-Implementation Gate scanning
- NOT a deterministic rule engine — `mode` is always `prompt`
- NOT in decisions/index.md or discussions/index.md

**Vector DB:** Instructions are indexed via `index_instruction` MCP tool. File system is source of truth; DB is derived read-optimized index.

---

# Assignments

**Purpose:** ASSIGNMENT is a **continuity and handoff mechanism** — not a task management system. Primary use case: a developer departs or becomes unavailable with unfinished work; context is transferred to a named teammate so nothing is lost between sessions. Secondary use case: intentional, rare domain handoffs. Assignments are created rarely.

Assignment records are stored in `.project-memory/assignments/` with their own `index.yml` summary table.

**Naming:** `ASSIGNMENT-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order
- Slug describes the task topic (e.g. `mehmet-review-auth`, `ahmet-payment-research`)
- Use kebab-case
- Example: `ASSIGNMENT-2026-06-14-mehmet-review-auth-bug.md`

**Frontmatter:** See `templates/assignments.md` for the full schema. Key fields: `id`, `status` (pending | accepted | rejected | ongoing | completed), `type` (direct | freeform), `assigned_to` / `assigned_by` ({ name, email }), `target_type` / `target_id` (link to existing record), `reminded` (set to true on remind me later).

**State machine:**
pending → accepted → ongoing → completed
pending → rejected → (assigner loop)
pending → remind me later → pending (reminded: true)

After rejection: assign to another (new ASSIGNMENT), do it yourself (completed by assigner), or remind me later (reset to pending, reminded: true).

**Session-start UX:** Pending/ongoing assignments loaded via `assigned_to.email` filter. A single passive line shown at session start — no interaction expected. Rejected assignments for the assigner shown similarly. Completed notifications shown once with View Details / Dismiss options.

**Completion rules:** Only the assignee can mark `completed`. At least one evidence field required: `completion_note`, `completed_decision_id`, or `completed_discussion_id`.

**Permission model:** Open — anyone can assign to anyone. Rejection mechanism is the safety net.

**Expiry:** No automatic expiry. Cat 14b (stale pending >30d) serves as the backstop for abandoned assignments.

**Author attribution:** On creation: `created_by` set to `assigned_by` identity. On status change: append current git identity to `contributors` (dedup by email). See Author Attribution section above.

**Pre-Implementation Gate integration:** Not scanned.

**Vector DB:** Assignments are indexed via `index_assignment` MCP tool. File system is source of truth; DB is derived read-optimized index.

---

# Notes

See `templates/notes.md` for the note template and naming. Notes are user-scoped, private, search-only (no session loading, no gate re-injection, no audit). Lifecycle: create -> optional update -> optional delete.

**What notes are NOT:**
- NOT project decisions — no ADR counterpart, no Pre-Implementation Gate scanning
- NOT collaborative — no sharing, no fork model, no assignment
- NOT in discussions/index.md or decisions/index.md
- NOT session-persistent — passive, search-only

**Vector DB:** Notes are indexed via `index_note` MCP tool. File system is source of truth; DB is derived read-optimized index.
