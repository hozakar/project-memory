---
name: project-memory
version: 0.0.1
description: Project memory and phase management system. Loads at every session start to provide engineering context → history, decisions, active tensions, anti-patterns. Use when planning, implementing, reviewing, or closing phases. Always active in this project.
---

# On Load

When this skill activates:

1. Output exactly this line:
   🧠 PROJECT MEMORY LOADED

2. Check whether `.project-memory/` exists in the project root.
   - If it **does not exist**: read `init.md` and follow its instructions.
   - If it **exists**: read `protocol.md` for the Memory Loading Strategy and follow it. Load `.project-memory/summaries/project-memory.md`. If an active phase exists (check `phases/index.yml` for any phase with `status` not equal to `completed`), read that phase directory too.

   After loading summaries and active phase, determine role:
   - Read `.project-memory/maintainers.md` if it exists
   - Run `git config user.email`
   - If the email is in the maintainers list → role is `maintainer`
   - If not (or file doesn't exist) → role is `developer`
   - Store role for the session

   If `.project-memory/instructions/` exists:
     - If MCP is available: call `search_memory("instruction", top_k=20, created_by_email=<current git user email>, type_filter="instruction")` to load current user's active instructions. Inject each instruction's prompt into context.
     - If MCP is unavailable: scan `.project-memory/instructions/` directory for files where frontmatter `created_by.email` matches current git user email AND `state: active`. Inject each instruction's `# Prompt` body into context.
      - If ≥5 active instructions are loaded, emit: "⚠️ N active instructions loaded. Consider dropping unused ones with 'drop instruction X'."
   - If the session role is `maintainer` and 10+ phases have accumulated since the last era: emit "📊 X phases accumulated since last era. Create era-NNN? I recommend running audit first."
   - If the session role is `developer`: suppress the era prompt.

3. Run Drift Audit (read `audit.md` for the full procedure).
   - Auto-fix all findings silently (all 12 non-Cat-4 categories auto-fix per the simplified severity model — Cat 4 heuristic auto-resolves same-user commits, escalating only on author mismatch or ambiguous matching).
   - Cat 1 informational notices (fresh orphan commits, ≤ 3 days, current user): present as a single informational notice — "ℹ️ N orphan commit(s) (last 3 days). Run `audit` to review." Do NOT enter interactive mode for these.
   - Interactive triage is rare: only Cat 4 edge cases (author mismatch or ambiguous file matching that heuristic can't resolve) enter interactive mode. Present in the format specified by `audit.md`.
   - If no findings at all (no interactive, no info, no auto-fix): replace the Step 1 line with 🧠 PROJECT MEMORY LOADED → drift audit clean.
   - If auto-fix or info findings exist but no interactive-triage findings: keep the Step 1 line as-is, emit the drift report block, and continue to step 4 (do NOT enter interactive mode).
   - If any interactive-triage findings exist after auto-fix, immediately enter Interactive Audit Mode (per `audit.md` Interactive Mode section) without waiting for the user to invoke `audit` manually. Apply user decisions, re-detect, loop until clean.

4. Continue with the session. Do not ask the user for anything at this step.

---

# Arguments

## audit

When invoked as `Skill project-memory audit`, enter **Interactive Audit Mode**:

1. Read `audit.md` and follow its `# Interactive Mode` procedure.
2. For each escalated finding, prompt the user via `AskUserQuestion` and apply their decision.
3. Re-run detection after all decisions are applied; loop until clean.
4. Do NOT re-run the on-load summary loading sequence.

## discuss

When invoked as `Skill project-memory discuss`, or when the user uses implicit discussion triggers (e.g. "tartışalım", "planlayalım", "let's discuss", "let's plan", "lets work on that"), enter **Discussion Mode**:

1. Read `conventions.md` Discussion Lifecycle section for the full procedure.
2. Load `discussions/index.md` to surface prior discussions relevant to the current topic.
3. Engage in structured discussion with the user → explore ideas, tradeoffs, alternatives, plans.
4. At discussion close, determine the outcome (Phase / Decision / Issue / Roadmap / None) and write a `DISCUSSION-YYYY-MM-DD-slug.md` file to `.project-memory/discussions/`.
5. Update `discussions/index.md` with the new row.
6. If outcome is `phase`, offer to create the phase immediately. If `decision`, offer to create the DECISION file. If `issue`, offer to create the ISSUE file. If `roadmap`, add the entry to `roadmap.md`.

**Implicit triggers:** Discussion mode activates automatically when the user uses phrases indicating collaborative planning or brainstorming. Detection is lenient → if the conversation's character is exploratory/planning, capture it. Both English and Turkish phrases are detected.

**Resume:** If the user says "continue this discussion" or references a specific topic, load the existing `DISCUSSION-*.md` file in full context and continue. Update the SAME file; do not create a new one.

---

# MCP Companion

The `mcp-server/` subdirectory contains an optional MCP server that accelerates project-memory with semantic search.

**Availability detection:** At session start, check if `search_memory`, `index_phase`, `index_decision`, and `index_instruction` are in your available MCP tools. If yes → MCP is active for this session. If no → all behavior is identical to standard file-based operation.

**Tools provided:**
- `search_memory(query, top_k?)` — semantic search over indexed phases and decisions; used at Pre-Implementation Gate and for ad-hoc user questions
- `index_phase(data)` — upsert a phase into the vector index; called on phase open and close
- `index_decision(data)` — upsert a decision; called on creation and status change
- `index_instruction(data)` — upsert an instruction; called on creation and state change (active ↔ dropped)
- `check_consistency(project_memory_dir)` — returns {missing, orphaned} for DB/filesystem sync; used in drift audit Cat 13 and proactive sync at session start
- `rebuild_index(entries[])` — full atomic rebuild of the index; called when DB is empty or on user request
- `index_era(data)` — upsert an era summary; called when a new era-NNN.md is written

**Graceful degradation:** File system is always source of truth. DB is a derived index. Write direction is files → DB only, never DB → files. MCP failure at any point does not affect skill functionality.

**Detailed integration rules:** See `protocol.md` → MCP Companion Integration section (includes proactive DB sync at session start and squash/rebase recovery via `find_similar_commit`); `gates.md` → Phase Creation and End-of-Phase Maintenance MCP steps; `audit.md` → Category 13.

---

# CRITICAL GATES (READ FIRST)

`
BEFORE IMPLEMENTATION → phase must exist → create it first
BEFORE MERGE/CLOSE    → Pre-Close Gate must pass (3 files complete)
BEFORE SESSION END    → if significant commits landed, phase must be updated
PIPELINE SUBMISSION   → counts as implementation → phase must exist before submit
`

**For detailed gate procedures, commit significance rules, topic shift criteria, and end-of-phase maintenance → read `gates.md`.**

**For agent thinking protocol and memory loading strategy → read `protocol.md`.**

**For the quick reference cheatsheet and event-based triggers → read `cheatsheet.md`.**

---

# Core Principles

Git answers: what changed, where, when, what is the diff.

Project Memory answers: why it was changed, what alternatives were considered and rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, what should happen next.

Git is the source of truth for code changes. `.project-memory/` is the source of truth for engineering reasoning. Never duplicate information already available in git unless summarization provides additional value.

Phase / decision / discussion / issue records carry author attribution via `created_by` and `contributors` frontmatter fields, populated from `git config user.name` + `user.email` at every status-changing write. Missing git identity falls back silently to `unknown`. Full rules: `conventions.md` → Author Attribution.

---

# Project Structure

## `.project-memory/` (per-project data)
`	ext
.project-memory/
```
├── phases/
│   ├── index.yml
│   └── phase-YYYYMMDD-short-title/
│       ├── phase.yml
│       ├── plan.md
│       ├── implementation.md
│       ├── review-and-fixes.md
│       └── followup.md
├── decisions/
│   ├── index.md
│   └── DECISION-YYYY-MM-DD-slug.md
├── discussions/
│   ├── index.md
│   └── DISCUSSION-YYYY-MM-DD-slug.md
├── issues/
│   ├── open/
│   └── closed/
├── instructions/
│   └── INSTRUCTION-YYYY-MM-DD-slug.md
└── summaries/
    ├── project-memory.md
    ├── current-state.md
    ├── architecture.md
    ├── active-issues.md
    └── roadmap.md
```
`

## Skill Files (read-only reference)
`	ext
.claude/skills/project-memory/
├── SKILL.md          ← Entry point, arguments, core concepts (this file)
├── gates.md          ← Implementation gates, commit rules, phase lifecycle
├── protocol.md       ← Agent thinking protocol, memory loading, knowledge preservation
├── cheatsheet.md     ← Quick reference, event-based triggers
├── audit.md          ← Drift detection and repair (13 categories): single escalation gate (Cat 4 — same-user heuristic with auto-assignment, escalates only on author mismatch or ambiguous matching). All other 12 categories auto-fix silently.
├── init.md           ← First-run initialization
├── templates.md      ← All document schemas (phases, decisions, issues, discussions)
├── conventions.md    ← Naming and lifecycle rules, decision resolution
└── README.md         ← Human-readable overview
`

---

# Phase Lifecycle

A phase represents a **logical unit of work**, not a branch. Branches are optional reinforcement → not the trigger.

`
Significant work begins → Phase created (status: planning)
          ↓
Commits accumulate → phase.yml updated with commit hashes
          ↓
Work unit complete → Phase closes (status: completed)
                     followup.md → roadmap.md transfer (mandatory)
          ↓
Next significant work begins → New phase created
`

**Key rules:**
- Phase is created BEFORE the first significant commit → read `gates.md` for commit significance and topic shift criteria.
- Required files: `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`. Templates in `templates.md`.
- Phase status transitions and close criteria are in `gates.md`.
- Phases are sorted newest first in `index.yml`. Prepend on creation.
- Tags are the primary navigation mechanism for finding prior work in a specific area.

---

# Phase Index

`yaml
phases:
  - id: phase-20260807-auth-refactor
    title: Auth Refactor
    status: completed
    branch: feature/auth-refactor
    merge_commit: ff3a891
    commits:
      - abc1234
    issues:
      - ISSUE-2026-08-07-auth-session-leak
    decisions:
      - DECISION-2026-08-07-no-session-storage
    discussions: []
    tags:
      - auth
      - session
`

---

# Decisions, Issues, and Discussions

For naming conventions, file templates, lifecycle rules, and the Decision Resolution Rules → read `conventions.md`.

For discussion lifecycle, implicit triggers, resume, and outcome types → read `conventions.md` Discussion Lifecycle section.

For index maintenance (adding/updating rows in `decisions/index.md` and `discussions/index.md`) → read `conventions.md` and `templates.md`.

---

# Quick Reference

`
About to commit?          → Classify significance, check phase exists
About to open a phase?    → phase.yml + plan.md stub + index.yml entry
About to close a phase?   → Verify 3 files: implementation + review + followup
About to close discussion?→ Determine outcome, write file, update index
About to implement?       → Pre-Implementation Gate (gates.md): phase open → classify → decision check → batch conflicts
`

For the full quick reference cheatsheet and event-based triggers → read `cheatsheet.md`.
