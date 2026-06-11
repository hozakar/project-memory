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
→ Step 1: phase open? → Step 2: classify trivial/significant/ambiguous → Step 3: scan `decisions/index.md` and `discussions/index.md` for conflicts → batch any directional conflicts into one question → Step 4: if no candidate exists for an architectural move, offer to record one.

**About to close a discussion?**
→ Determine outcome type (phase / decision / issue / roadmap / none)
→ Write DISCUSSION-YYYY-MM-DD-slug.md to discussions/
→ Add row to discussions/index.md
→ If phase outcome: offer to create the phase. If decision: offer to create DECISION. If issue: offer to create ISSUE. If roadmap: add to roadmap.md.

---

# Event-Based Triggers

| Event | Action required now |
|---|---|
| User requests significant implementation | Create phase BEFORE starting any work |
| `submit_implementation` about to be called | Phase must exist — create before the call |
| DECISION-* file created | Add row to `decisions/index.md`; add one-liner per rejected alternative to `project-memory.md` → Rejected Decisions; if `supersedes` is set, update the superseded file's `status` and `superseded_by` and its index row |
| New feature or component shipped | Update `current-state.md` → Current Features or Major Components |
| Technical debt introduced | Update `current-state.md` → Current Technical Debt |
| Architecture module added or changed | Update `architecture.md` |
| Issue opened | Add to `active-issues.md` + create file in `issues/open/` |
| Issue closed | Move file to `issues/closed/`, update frontmatter, update `active-issues.md` |
| Stub placeholder found when real data exists | Replace immediately — never defer |
| Discussion concluded | Write `DISCUSSION-*.md` to `discussions/`; add row to `discussions/index.md`; if outcome references a phase/decision/issue/roadmap, create the referenced artifact |
| Discussion resumed | Load the existing DISCUSSION file; update it at close; do not create a new file |
| Discussion triggers a phase | Set `outcome.type: phase` and `outcome.id: <phase-id>` in the DISCUSSION file |

**Stub placeholders to clear on sight:** `"None recorded yet"`, `"TBD"`, `"system just initialized"`, `"first run detected"`, or any `*(none)*` in a section that now has content.
