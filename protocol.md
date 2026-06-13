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
8. Current user's active instructions (via `search_memory` with `created_by_email` filter and `type_filter: "instruction"` if MCP available; directory scan fallback otherwise)
9. .project-memory/decisions/index.md — Active section only (primary input to Pre-Implementation Gate); Superseded section is available on demand for historical lookups but is NOT scanned during Pre-Implementation Gate
10. Individual DECISION-YYYY-MM-DD-* files (only when planning in a scope the index flags as relevant)
11. Open issues (as needed)
12. .project-memory/discussions/index.md (load fully — active entries only; archived discussions in discussions/archive/ are excluded)
13. Individual DISCUSSION-YYYY-MM-DD-* files (when resuming a discussion or when planning in a scope the index flags as relevant; archived files loaded on explicit request only)
14. Recent git commits (as needed)
```

Do not load all historical phases unless necessary. Prefer summarized memory before raw history. Tags are the primary navigation mechanism — tag-aware filtering applies at initial load, not only when diving deeper.

## Token Budget Guidelines

- Summary files are the primary budget concern — read all five by default (designed to stay concise).
- If `phases/index.yml` contains 20+ phases, apply tag-aware filtering:
  1. Derive the current task's scope as a set of tags (same entities used in Pre-Implementation Gate step 3 — file names, feature names, system areas).
  2. Prefer phases whose `tags` intersect the derived scope. Read up to 10 tag-matching phases.
  3. If fewer than 3 tag-matching phases exist, supplement with the most recent entries to reach at least 3 total.
  4. Fall back to the most recent 10 entries when no tags can be derived from the task (e.g. cold session start with no stated goal).
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

# MCP Companion Integration

**Availability check (once per session):**
If `search_memory`, `index_phase`, `index_decision`, and `index_instruction` all appear in your available MCP tools → MCP is available. Set a session-level flag. Otherwise → MCP is unavailable; all behavior follows the standard strategy below.

**Version tracking:** At session start, after the availability check, compare `mcp-server/package.json` `version` against `.project-memory/config.yml` `mcp_install_offered_for_version`. If the installed version is newer than the offered version (or offered is null), the audit procedure will handle the offer — see `audit.md` MCP Fast Path section.

**When MCP is available — modified Memory Loading Strategy:**

After loading the 5 summary files (steps 1–5), before loading `phases/index.yml`:
- If the session has a stated task or goal: call `search_memory(task_description, top_k=8)`
- For each result with similarity ≥ 0.6: load the corresponding file from `.project-memory/` (phase directory or DECISION file)
- These files supplement — do not replace — the standard steps 6–13

At Pre-Implementation Gate Step 3: additionally call `search_memory(natural language description of what you are implementing, top_k=8)` → load any additional relevant files not already in context.

**Ad-hoc search rule:**
If MCP is available and the user asks a question about past decisions, phases, or discussions (e.g. "what did we decide about X?", "did we ever try Y?", "what phases touched Z?"), call `search_memory(user_question)` to retrieve relevant context before answering. This does not require a gate trigger — it is discretionary judgment.

**Squash/rebase recovery:** If the user mentions that a squash, rebase, or force-push lost commits before opening a new phase, call `find_similar_commit(description_of_lost_work, top_k=5)`. Load the returned phase files from disk and use them to pre-populate the new phase's context. Best-effort — proceed normally if no matches found.

**Proactive DB sync (session start):** After checking MCP availability, if MCP is active, call `check_consistency(project_memory_dir)`. For each ID in `missing` (file exists but not in DB): call the appropriate index tool (`index_phase`, `index_decision`, `index_discussion`, `index_era`, or `index_instruction`) with the file's content.

   Additionally, count phases not yet covered by any era in `eras/index.yml`. If 10 or more have accumulated:
   - If session role is maintainer: emit "📊 X phases accumulated since last era. Create era-NNN? I recommend running audit first." and wait for user confirmation.
   - If session role is developer: suppress. Do NOT prompt.
   When user confirms, create the next `era-NNN.md` and call `index_era`.

   This supersedes Cat 13 for missing-entry detection when MCP is available at load time; Cat 13 remains a fallback for sessions where MCP was unavailable.

**Drift audit via MCP (session start):** If `run_audit` is in available MCP tools, call `run_audit(project_memory_dir)` instead of running file-based detection. Process the returned `{ auto_fixed, pending_fixes, escalations }` as described in `audit.md` → MCP Fast Path section.

**When MCP is unavailable:**
All behavior is identical to the standard Memory Loading Strategy. MCP is an optional accelerator, never a requirement.

---

# Skill Sub-Files Reference

| File | Purpose | When Loaded |
|------|---------|-------------|
| `SKILL.md` | Entry point, on-load flow, argument dispatch, core concepts, project structure | Every session start |
| `gates.md` | Pre-Implementation Gate, Pre-Close Gate, commit significance, topic shift, end-of-phase maintenance | Before implementation, merge, and phase close |
| `protocol.md` | This file — thinking protocol, memory loading, knowledge preservation | At session start (after SKILL.md) |
| `cheatsheet.md` | Quick reference cheatsheet, event-based triggers | On-demand for quick lookups |
| `audit.md` | Drift detection and repair (13 categories) | Every session start (auto) + on `audit` argument |
| `init.md` | First-run initialization | Only when `.project-memory/` does not exist |
| `templates.md` | File templates for all `.project-memory/` document types | When creating phases, decisions, issues, discussions |
| `conventions.md` | Naming conventions, lifecycle rules, decision resolution rules, discussion lifecycle | When creating/closing decisions, issues, or discussions |
