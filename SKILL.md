---
name: project-memory
description: Project memory and phase management system. Loads at every session start to provide engineering context — history, decisions, active tensions, anti-patterns. Use when planning, implementing, reviewing, or closing phases. Always active in this project.
---

# On Load

When this skill activates:

1. Output exactly this line:
   ```
   [🧠] PROJECT MEMORY LOADED
   ```

2. Check whether `.project-memory/` exists in the project root.
   - If it **does not exist**: read `.claude/skills/project-memory/init.md` and follow its instructions.
   - If it **exists**: read `.project-memory/summaries/project-memory.md`. If an active phase exists (check `phases/index.yml` for any phase with `status` not equal to `completed`), read that phase directory too.

3. Run Drift Audit (read `.claude/skills/project-memory/audit.md` for the full procedure).
   - Auto-fix any findings in the auto-fix category silently.
   - Report all findings in the escalation category in a single block, in the format specified by `audit.md`.
   - If no findings at all: replace the Step 1 line with `[🧠] PROJECT MEMORY LOADED — drift audit clean`.
   - If findings exist: keep the Step 1 line as-is and emit the drift report block after it.
   - If any escalation findings exist after auto-fix, immediately enter Interactive Audit Mode (per `audit.md` Interactive Mode section) without waiting for the user to invoke `audit` manually. Apply user decisions, re-detect, loop until clean.

4. Continue with the session. Do not ask the user for anything at this step.

---

# Argument: audit

When this skill is invoked with the argument `audit` (e.g. `Skill project-memory audit`), enter **Interactive Audit Mode** instead of the on-load flow:

1. Read `.claude/skills/project-memory/audit.md` and follow its `# Interactive Mode` procedure.
2. For each escalated finding, prompt the user via `AskUserQuestion` and apply their decision.
3. Re-run detection after all decisions are applied; loop until clean.
4. Do NOT re-run the on-load summary loading sequence — the user already has a loaded session.

---

# CRITICAL GATES (READ FIRST)

```
BEFORE IMPLEMENTATION → phase must exist → create it first
BEFORE MERGE/CLOSE    → Pre-Close Gate must pass (3 files complete)
BEFORE SESSION END    → if significant commits landed, phase must be updated
PIPELINE SUBMISSION   → counts as implementation → phase must exist before submit
```

---

# Core Principles

Git answers: what changed, where, when, what is the diff.

Project Memory answers: why it was changed, what alternatives were considered and rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, what should happen next.

Git is the source of truth for code changes. `.project-memory/` is the source of truth for engineering reasoning. Never duplicate information already available in git unless summarization provides additional value.

---

# Project Structure

```text
.project-memory/
├── phases/
│   ├── index.yml
│   └── YYYY-MM-DD-short-title/
│       ├── phase.yml
│       ├── plan.md
│       ├── implementation.md
│       ├── review-and-fixes.md
│       └── followup.md
├── decisions/
│   └── DECISION-YYYY-MM-DD-slug.md
├── issues/
│   ├── open/
│   └── closed/
└── summaries/
    ├── project-memory.md
    ├── current-state.md
    ├── architecture.md
    ├── active-issues.md
    └── roadmap.md
```

---

# Phase Lifecycle (Logical Work Unit)

A phase represents a **logical unit of work**, not a branch. Branches are optional reinforcement — not the trigger.

```
Significant work begins → Phase created (status: planning)
          ↓
Commits accumulate → phase.yml updated with commit hashes
          ↓
Work unit complete → Phase closes (status: completed)
                     followup.md → roadmap.md transfer (mandatory)
          ↓
Next significant work begins → New phase created
```

**Branch behavior:**
- Branch opened → note `branch` in phase.yml, but branch existence does NOT open a phase on its own
- Branch merged → set `merge_commit` in phase.yml and close the phase if it was tracking that branch's work
- No branch (direct to staging/main) → phase still opens and closes based on significance; `branch` and `merge_commit` remain null

**Commit significance evaluation — runs before every commit:**

| Significance | Examples | Action |
|---|---|---|
| **Trivial** | unused import/var removal, typo fix, formatting, `console.log` cleanup | Attach to open phase silently, or skip if no open phase |
| **Significant** | feature, bugfix, refactor, schema/type change, config with runtime effect, security fix, perf optimization | Open a phase if none is open; attach to open phase |
| **Ambiguous** | test additions, config tweaks, dependency upgrades, doc updates | Ask the user before deciding |

**Grouping rule:** commits in the same session on the same topic belong to the same phase. If the topic shifts substantially mid-session, close the current phase and open a new one.

**Topic shift criteria — a shift is substantial when ANY of the following is true:**
- Different system layer (e.g. frontend → backend, app → infra)
- Different user-facing feature or capability
- Commits are 2+ calendar days apart from the last commit in the current phase
- User opens a new branch for the new work
- The changed files are in a completely different module or top-level directory than the current phase's commits
- User explicitly declares "new topic", "new feature", or similar

When uncertain whether a shift is substantial, ask the user before opening a new phase.

**Trivial-only session:** if the entire session produces only trivial commits and no open phase exists, no phase is created. Memory is not polluted with noise.

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
8. Relevant decision records (when planning in a specific area)
9. Open issues (as needed)
10. Recent git commits (as needed)
```

Do not load all historical phases unless necessary. Prefer summarized memory before raw history. When diving deeper into a specific area, filter `phases/index.yml` by tags to find relevant phases.

**Token budget guidelines:**
- Summary files are the primary budget concern — read all five by default (designed to stay concise).
- If `phases/index.yml` contains 20+ phases, read only the most recent 10 entries unless searching a specific tag.
- If any single summary file exceeds 300 lines, read the first 150 lines only on initial load; fetch the rest on demand.
- Active phase directory: always load in full — it is the most time-sensitive memory.
- Historical phase directories: load only when the user's task explicitly relates to that phase's area.

---

# Agent Thinking Protocol

**At session start:**
- Is there an open phase? (any phase in `phases/index.yml` with `status != completed`)
- What commits have landed since the last recorded commit in the active phase?
- Are summary files current? Compare each file's `Last Updated:` date against recent git commits. If any summary is older than the most recent memory commit, update it before proceeding.
- Do any sections contain stale placeholders (`"None recorded yet"`, `"TBD"`, `"system just initialized"`)? Clear them if real data exists.

**Before writing any plan:**
- Is there a prior decision (DECISION-YYYY-MM-DD-*) affecting this area?
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

# Phase Creation

A phase is created when **significant work begins** — regardless of whether a branch is opened. Create the phase directory and files **before** making the first significant commit.

```
.project-memory/phases/YYYY-MM-DD-short-title/
```

Required files: `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`

For file formats and templates, read `.claude/skills/project-memory/templates.md`.

**Phase close criteria (any one is sufficient):**
- Branch merged into target → set `merge_commit`, `status: completed`
- Logical work unit finished with no branch → set `closed_at`, `status: completed`
- Explicit user declaration ("this work is done") → same as above
- Work cancelled or superseded → set `closed_at`, `status: abandoned`, `abandoned_reason: <brief note>`

**Phase status transitions:**
- `planning → implementation`: first significant commit lands
- `implementation → review`: user requests review or pre-close gate is triggered
- `review → completed`: pre-close gate passes (all three files non-stub)
- `any → abandoned`: work cancelled, branch deleted without merge, or superseded by new phase

---

# Phase Index

```yaml
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
    tags:
      - auth
      - session
```

Tags are the primary navigation mechanism for finding prior work in a specific area.

---

# Decisions and Issues

For naming conventions, file templates, and lifecycle rules, read `.claude/skills/project-memory/conventions.md` when creating or closing a DECISION or ISSUE file.

---

# Pre-Implementation Gate — MANDATORY

Before dispatching ANY significant implementation work — including:
- Direct file edits
- Junior pipeline submissions (`submit_implementation`)
- Agent tool calls for code changes

A phase **MUST** be open. If no phase is open, **CREATE IT FIRST**. Implementation work is BLOCKED until the phase exists.

Phase minimum to unblock: `phase.yml` (status: planning) + `plan.md` stub + `phases/index.yml` entry.

---

# Pre-Close Gate — MANDATORY

**Before closing any phase** (merge, logical completion, or explicit user declaration), verify and complete the following. Phase may not close until all three are done:

1. `implementation.md` — written and reflects the actual implementation (not a stub)
2. `review-and-fixes.md` — all review rounds closed; findings and actions recorded
3. `followup.md` — debt, open issues, and recommended next phases captured

If any of these are missing or stub-only, write them first, then close.

**MANDATORY:** Update `implementation.md` after each significant commit. Do NOT defer to close time. A phase closed without incremental updates is a memory failure — retroactive writing is always incomplete.

---

# End-of-Phase Maintenance

At phase completion (merge OR logical completion):

**Always update — no exceptions:**
```
1. implementation.md — finalize (must not be a stub)
2. review-and-fixes.md — close final round
3. followup.md → roadmap.md — transfer all items
4. phase.yml — set status: completed; set merge_commit if branch merged, closed_at if direct close
5. phases/index.yml — update phase entry
6. current-state.md — always update: features, components, debt, risks, recommended next actions
7. project-memory.md — always update Recent Completed Work; also update Active Tensions, Anti-Patterns, Current Priorities if changed
```

**Update only if changed this phase:**
```
8. active-issues.md — if issues were opened or closed
9. roadmap.md — confirm followup.md items are integrated
10. architecture.md — if any module was added, removed, or structurally changed
```

`current-state.md` and `project-memory.md` are **always** updated. Skipping them is the most common source of stale memory.

---

# Event-Based Triggers

| Event | Action required now |
|---|---|
| User requests significant implementation | Create phase BEFORE starting any work |
| `submit_implementation` about to be called | Phase must exist — create before the call |
| DECISION-* file created | Add one-liner per rejected alternative to `project-memory.md` → Rejected Decisions |
| New feature or component shipped | Update `current-state.md` → Current Features or Major Components |
| Technical debt introduced | Update `current-state.md` → Current Technical Debt |
| Architecture module added or changed | Update `architecture.md` |
| Issue opened | Add to `active-issues.md` + create file in `issues/open/` |
| Issue closed | Move file to `issues/closed/`, update frontmatter, update `active-issues.md` |
| Stub placeholder found when real data exists | Replace immediately — never defer |

**Stub placeholders to clear on sight:** `"None recorded yet"`, `"TBD"`, `"system just initialized"`, `"first run detected"`, or any `*(none)*` in a section that now has content.

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
