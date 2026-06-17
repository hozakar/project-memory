---
name: project-memory-cheatsheet
description: Quick reference cheatsheet and event-based trigger table for project-memory.
---

# Quick Reference Cheatsheet

**About to commit?**
```
Trivial (typo, formatting, import cleanup)
  → open phase exists? attach silently : skip entirely

Significant (feature, bugfix, refactor, schema change, config with runtime effect)
  → open phase exists? update phase.yml commits list
  → no open phase? CREATE PHASE FIRST, then commit

Ambiguous (test additions, dep upgrades, doc updates)
  → ask the user
```

**About to open a phase?**
→ Minimum required: `phase.yml` (status: planning) + `plan.md` stub + `phases/index.yml` entry

**About to close a phase?**
→ Verify all three: `implementation.md` ✓ + `review-and-fixes.md` ✓ + `followup.md` ✓

**Topic shifted mid-session?**
→ Close current phase (set `status: completed` or `abandoned`), open new one

**Work cancelled / superseded?**
→ Set `status: abandoned` in `phase.yml`, add `abandoned_reason` field

**About to implement something significant?**
→ Step 1: phase open? → Step 2: classify trivial/significant/ambiguous → Step 3: scan `decisions/index.md` and `discussions/index.md` for conflicts → batch any directional conflicts into one question → Step 4: if no candidate exists for an architectural move, offer to record one → Step 5: if MCP available, run context load per `gates.md` Step 5 and `mcp-integration.md`.

**About to route work to a teammate?**
→ Determine type: direct (linked to existing record) or freeform (standalone task)
→ Create `ASSIGNMENT-YYYY-MM-DD-slug.md` in `.project-memory/assignments/`
→ Add row to `assignments/index.yml` (newest first)
→ If MCP available, call `index_assignment` per `mcp-integration.md`

**About to close a discussion?**
→ Determine outcome type (phase / decision / issue / roadmap / none)
→ Write DISCUSSION-YYYY-MM-DD-slug.md to discussions/
→ Add row to discussions/index.md
→ If phase outcome: offer to create the phase. If decision: offer to create DECISION. If issue: offer to create ISSUE. If roadmap: add to roadmap.md.
→ If MCP available, call `index_discussion` per `mcp-integration.md`.

---

# Event-Based Triggers

| Event | Action required now |
|---|---|
| User requests significant implementation | Create phase BEFORE starting any work |
| `submit_implementation` about to be called | Phase must exist — create before the call |
| DECISION-* file created | Add row to `decisions/index.md`; add one-liner per rejected alternative to `project-memory.md` → Rejected Decisions; create `adr/NNNN-slug.md` (assign next integer ID, zero-pad to 4 digits, write ADR template from `templates.md`); set `adr_id` in DECISION frontmatter; if `supersedes` is set, update the superseded file's `status`, `superseded_by`, its index row, and its `adr/` Status line |
| Decision superseded | Update superseded DECISION frontmatter (`status: superseded`, `superseded_by`); move row in `decisions/index.md` to Superseded section; update superseded `adr/NNNN-slug.md` Status line to `Superseded by [NNNN-slug](NNNN-slug.md)` |
| New feature or component shipped | Update `current-state.md` → Current Features or Major Components |
| Technical debt introduced | Update `current-state.md` → Current Technical Debt |
| Architecture module added or changed | Update `architecture.md` |
| Issue opened | Add to `active-issues.md` + create file in `issues/open/` |
| Issue closed | Move file to `issues/closed/`, update frontmatter, update `active-issues.md` |
| Stub placeholder found when real data exists | Replace immediately — never defer |
| Status-changing write on phase / decision / discussion / issue | Append current git identity (`git config user.name` + `user.email`; missing → `unknown`) to `contributors` (dedup by email). See `conventions.md` → Author Attribution |
| Discussion concluded | Write `DISCUSSION-*.md` to `discussions/`; add row to `discussions/index.md`; if outcome references a phase/decision/issue/roadmap, create the referenced artifact; if `index_discussion` tool available: call `index_discussion` with id, title, status, outcome, tags, summary, bodyText (first 2000 chars), plus `created_by` + `contributors` from frontmatter |
| Discussion resumed | Load the existing DISCUSSION file; update it at close; do not create a new file |
| Discussion triggers a phase | Set `outcome.type: phase` and `outcome.id: <phase-id>` in the DISCUSSION file |
| Phase opened (status: planning written) | If MCP available, index phase per `mcp-integration.md` and `gates.md` Phase Creation |
| Phase closed (status: completed written) | If MCP available, index phase with full content per `mcp-integration.md` and `gates.md` End-of-Phase Maintenance |
| DECISION-* file created or status changed | If MCP available, index decision per `mcp-integration.md` and `gates.md` Decision Creation |
| User asks about past phases/decisions/discussions (MCP available) | Call `search_memory` per `mcp-integration.md`; combine exact and semantic filters for sharper results (see `protocol.md` Ad-hoc search rule) |
| Drift audit runs — `run_audit` available | Call `run_audit(project_memory_dir)` per `mcp-integration.md`; apply `pending_fixes` (Cat 7); log `auto_fixed`; triage `escalations` per `audit.md` MCP Fast Path |
| Drift audit runs — `run_audit` NOT available | Run file-based detection (14 categories); Cat 13: call `check_consistency`, auto-fix missing entries |
| User mentions lost commits after squash/rebase | Call `find_similar_commit` per `mcp-integration.md` → load matching phase files from disk |
| ~10 phases accumulated since last era | Prompt maintainer to create era (developers: silent), then create `era-NNN.md`, add entry to `eras/index.yml`, call `index_era` per `mcp-integration.md` |
| Assignment created | Add row to `assignments/index.yml` (newest first); if MCP available, call `index_assignment` per `mcp-integration.md` |
| Assignment status changed (accepted, rejected, ongoing, completed) | Update `assignments/index.yml` row; append current git identity to ASSIGNMENT file `contributors` (dedup by email); if MCP available: re-call `index_assignment` per `mcp-integration.md` |
| Session start — pending assignments exist for current user | Present interactively: `[Show Details] [Accept] [Reject] [Remind Me Later]`. After 3rd reminder: ask "Auto-reject?" |
| Session start — rejected assignments created by current user | Present interactively: `[Show Details] [Assign to Another] [Do It Yourself] [Remind Me Later]` |
| Session start — completed assignment notifications for current user | Present once: `[View Details] [Dismiss]`. Do NOT re-present on subsequent sessions |
| Assignment target (`type: direct`) becomes orphan (file deleted/moved) | Cat 14a detection; auto-annotate `target_id` with `[orphaned YYYY-MM-DD]` |
**Stub placeholders to clear on sight:** `"None recorded yet"`, `"TBD"`, `"system just initialized"`, `"first run detected"`, or any `*(none)*` in a section that now has content.