---
name: project-memory-protocol
description: Agent thinking protocol, memory loading strategy with token budgets, and knowledge preservation rule for project-memory.
---

# Agent Thinking Protocol

**At session start:**
- Is there an open phase? (any phase in `phases/index.yml` with `status != completed`)
- What commits have landed since the last recorded commit in the active phase?
- Are summary files current? Compare each file's `Last Updated:` date against recent git commits. If any summary is older than the most recent memory commit, update it before proceeding.
- Do any sections contain stale placeholders (`"None recorded yet"`, `"TBD"`, `"system just initialized"`)? Clear them if real data exists.

**Before writing any plan:**
- List the concrete entities (`touches` candidates) this plan affects.
- Scan `decisions/index.md` for active decisions touching any of those entities or sharing the same `primary_scope`.
- Scan `discussions/index.md` for discussions with relevant outcomes.
- Apply the Decision Resolution Rules from `conventions.md` to candidates.
- Has something similar been attempted and abandoned before?
- Do any active tensions constrain this approach?
- Are there open issues this plan must account for?

**When you notice a repeated failure or fix:**
- High confidence it's a pattern → write to `project-memory.md` under Anti-Patterns (no user escalation)
- Uncertain → wait for more evidence

**When an alternative path was not taken:**
- If you don't know why, ask: "We didn't go with [X] — do you remember why?"
- Record the answer in the relevant DECISION file or `project-memory.md` → Rejected Decisions

Never plan in isolation from project history.

---

# Memory Loading Strategy

At session start and after any context compaction:

```
1. .project-memory/summaries/project-memory.md
2. .project-memory/summaries/current-state.md
3. .project-memory/summaries/active-issues.md
4. .project-memory/summaries/architecture.md
5. .project-memory/summaries/roadmap.md
6. .project-memory/phases/index.yml
7. Active phase directory (if open)
8. .project-memory/decisions/index.md (load fully — primary input to the Pre-Implementation Gate)
9. Individual DECISION-YYYY-MM-DD-* files (only when planning in a scope the index flags as relevant)
10. Open issues (as needed)
11. .project-memory/discussions/index.md (load fully — surfaces prior discussions relevant to current scope)
12. Individual DISCUSSION-YYYY-MM-DD-* files (when resuming a discussion or when planning in a scope the index flags as relevant)
13. Recent git commits (as needed)
```

Do not load all historical phases unless necessary. Prefer summarized memory before raw history. When diving deeper into a specific area, filter `phases/index.yml` by tags to find relevant phases.

## Token Budget Guidelines

- Summary files are the primary budget concern — read all five by default (designed to stay concise).
- If `phases/index.yml` contains 20+ phases, read only the most recent 10 entries unless searching a specific tag.
- If any single summary file exceeds 300 lines, read the first 150 lines only on initial load; fetch the rest on demand.
- Active phase directory: always load in full — it is the most time-sensitive memory.
- Historical phase directories: load only when the user's task explicitly relates to that phase's area.
- `discussions/index.md` is loaded at session start alongside `decisions/index.md`. Individual DISCUSSION files are loaded on demand.

---

# Knowledge Preservation Rule

Every phase must leave enough context to answer:

- Why was this done?
- Which commits implemented it?
- What alternatives were rejected and why?
- What constraints existed?
- What tensions does this create or resolve?
- What should happen next?

without reconstructing history from source code.

---

# Skill Sub-Files Reference

| File | Purpose | When Loaded |
|------|---------|-------------|
| `SKILL.md` | Entry point, on-load flow, argument dispatch, core concepts, project structure | Every session start |
| `gates.md` | Pre-Implementation Gate, Pre-Close Gate, commit significance, topic shift, end-of-phase maintenance | Before implementation, merge, and phase close |
| `protocol.md` | This file — thinking protocol, memory loading, knowledge preservation | At session start (after SKILL.md) |
| `cheatsheet.md` | Quick reference cheatsheet, event-based triggers | On-demand for quick lookups |
| `audit.md` | Drift detection and repair (6 categories) | Every session start (auto) + on `audit` argument |
| `init.md` | First-run initialization | Only when `.project-memory/` does not exist |
| `templates.md` | File templates for all `.project-memory/` document types | When creating phases, decisions, issues, discussions |
| `conventions.md` | Naming conventions, lifecycle rules, decision resolution rules, discussion lifecycle | When creating/closing decisions, issues, or discussions |
