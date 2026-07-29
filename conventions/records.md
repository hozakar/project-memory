---
name: project-memory-conventions-records
description: Issue, instruction, and note record lifecycles — creation, state machines, session-start UX, completion rules.
---

# Issues

Issues track bugs and problems that need fixing. Open issues live in `issues/open/`, resolved issues in `issues/closed/`.

**Naming:** `ISSUE-YYYY-MM-DD-<short-slug>.md`
- Date = discovery date
- Slug describes the problem
- Use kebab-case
- Example: `ISSUE-2026-06-07-nothing-to-commit-detection.md`

**Frontmatter:** See templates for the frontmatter schema. Naming: ISSUE-YYYY-MM-DD-slug.md. On close: update status, add resolved/resolved_in, move file from open/ to closed/. On open: set created_by from current git identity (see Author Attribution section). Standard profile does not track `contributors`.

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

# Notes

See `templates/notes.md` for the note template and naming. Notes are user-scoped, private, search-only (no session loading, no gate re-injection, no audit). Lifecycle: create -> optional update -> optional delete.

**What notes are NOT:**
- NOT project decisions — no ADR counterpart, no Pre-Implementation Gate scanning
- NOT collaborative — no sharing, no fork model, no delegation to another person
- NOT in discussions/index.md or decisions/index.md
- NOT session-persistent — passive, search-only

> **Note on handoff.** Notes replaced the assignment record type, but they do not
> reproduce all of it: a note is scoped to its creator (note searches auto-apply the
> caller's email), so it cannot express "X is assigned to Y". A project that needs
> cross-person handoff needs a mechanism this one does not provide.

**Vector DB:** Notes are indexed via `index_note` MCP tool. File system is source of truth; DB is derived read-optimized index.
