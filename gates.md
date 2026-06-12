---
name: project-memory-gates
description: Implementation gates, commit significance rules, topic shift criteria, and end-of-phase maintenance procedures for project-memory.
---

# CRITICAL GATES

```
BEFORE IMPLEMENTATION → phase must exist → create it first
BEFORE MERGE/CLOSE    → Pre-Close Gate must pass (3 files complete)
BEFORE SESSION END    → if significant commits landed, phase must be updated
PIPELINE SUBMISSION   → counts as implementation → phase must exist before submit
```

---

# Commit Significance

Runs before every commit. Classify the work:

| Significance | Examples | Action |
|---|---|---|
| **Trivial** | unused import/var removal, typo fix, formatting, `console.log` cleanup | Attach to open phase silently, or skip if no open phase |
| **Significant** | feature, bugfix, refactor, schema/type change, config with runtime effect, security fix, perf optimization | Open a phase if none is open; attach to open phase |
| **Ambiguous** | test additions, config tweaks, dependency upgrades, doc updates | Ask the user before deciding |

**Grouping rule:** commits in the same session on the same topic belong to the same phase. If the topic shifts substantially mid-session, close the current phase and open a new one.

**Trivial-only session:** if the entire session produces only trivial commits and no open phase exists, no phase is created. Memory is not polluted with noise.

---

# Topic Shift Criteria

A shift is substantial when ANY of the following is true:

- Different system layer (e.g. frontend → backend, app → infra)
- Different user-facing feature or capability
- Commits are 2+ calendar days apart from the last commit in the current phase
- User opens a new branch for the new work
- The changed files are in a completely different module or top-level directory than the current phase's commits
- User explicitly declares "new topic", "new feature", or similar

When uncertain whether a shift is substantial, ask the user before opening a new phase.

---

# Phase Lifecycle

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

**Rebase/squash hygiene:** If you intentionally rebase or squash commits that are already recorded in `phase.yml`, update `commits:` with the new hashes after the rewrite. Do not leave old hashes in place — they become orphan references (detected and auto-annotated by audit Category 7, but cannot be recovered automatically).

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

# Phase Creation

Create when **significant work begins** — regardless of whether a branch is opened. Create the phase directory and files **before** making the first significant commit.

```
.project-memory/phases/phase-YYYYMMDD-short-title/
```

Required files: `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`

For file formats and templates, read `templates.md`.

**MCP index on phase open (if available):**
After writing `phase.yml` and `plan.md`, if `index_phase` is in available tools:
- Call `index_phase({ id, title, tags, planText: plan.md content truncated to 2000 chars, implementationText: "", commitDiffs: [], status: "planning" })`
- Best-effort: if the call fails, continue — file writes already completed.

---

# Pre-Implementation Gate — MANDATORY

Before dispatching ANY significant implementation work — including:
- Direct file edits
- Junior pipeline submissions (`submit_implementation`)
- Agent tool calls for code changes

Run these steps in order. None may be skipped.

**Step 1 — Phase open?**
A phase **MUST** be open. If no phase is open, **CREATE IT FIRST**. Implementation work is BLOCKED until the phase exists. Minimum: `phase.yml` (status: planning) + `plan.md` stub + `phases/index.yml` entry.

**Step 2 — Implementation significance?**
Classify the work using the commit significance table above.

| Significance | Examples | Decision check |
|---|---|---|
| **Trivial** | rename, format, comment, import cleanup, single-line bugfix, dependency patch bump | Skip the decision check entirely |
| **Significant** | new feature, schema/type change, deployment-model change, auth introduction or removal, persistence layer change, new dependency, new module | Run the decision check |
| **Ambiguous** | test additions, config tweaks, small UI changes, doc updates with runtime effect | Run the decision check but only escalate on **directional** conflict |

**Discussion-triggered work:** When implementation is triggered by a prior DISCUSSION file, the discussion's frontmatter `outcome` block provides the rationale. The decision check (Step 3) still applies based on significance classification.

**Step 3 — Decision check (when required by Step 2):**

1. List the concrete entities the work touches (e.g. `user_id`, `auth_token`, `deployment_target`). Be concrete — see `conventions.md` → Touches Field Guidance.
2. Scan `decisions/index.md` for active rows where any `Touches` entry overlaps your list OR `Scope` matches your primary scope.
3. Scan `discussions/index.md` for discussions with relevant outcome types. If a past discussion explicitly concluded against the current direction, surface it as a directional conflict alongside decision conflicts.
4. For each candidate, apply the Decision Resolution Rules (`conventions.md`) and classify:
   - **Directional conflict** — candidate claim contradicts the proposed work in a way that would change its direction → add to batch question.
   - **Refinement / overlap without conflict** — candidate touches the same area but does not contradict → emit a one-line silent note, continue.
   - **Unrelated** — overlap is incidental → ignore.
5. If the batch has at least one entry, surface ALL candidates in a single `AskUserQuestion` call. Do NOT issue sequential questions per candidate. Wait for the user's response before implementing.

**Step 4 — Capture missing decisions:**
If the proposed work is a significant architectural move (deployment, auth, persistence, schema, public API) and `decisions/index.md` has no candidate at all for it, ask once: "No prior decision covers this. Want to record one now?" — then proceed.

**Step 5 — MCP context load (if available):**
If `search_memory` is in available tools: call `search_memory(natural language description of what you are about to implement, top_k=8)`. For each result with similarity ≥ 0.6 not already loaded, load the corresponding `.project-memory/` file. Append any newly found directional conflicts to the Step 3 batch question (do not issue a separate question).

**Session override:**
If the user says "skip decision questions for now" (or similar phrasing — "skip", "skip for now", "speed mode"), suspend Step 3 questions for the rest of the session. Decisions are still **written** when made — only the pre-implementation question is bypassed. Override resets on the next session.

---

# Decision Creation — MCP Index Trigger

When a `DECISION-*.md` file is created or its `status` field changes (e.g. `active → superseded`):

**If `index_decision` is in available tools:**
Call `index_decision({ id, title, status, context: context_section[:1000], decisionBody: combined_decision_and_chosen_solution_sections[:1000], touches })`.
This is best-effort — if the call fails, continue. The file write already completed.

Re-call on every status change. The tool upserts by ID, so repeated calls are safe.

---

# Pre-Close Gate — MANDATORY

**Before closing any phase** (merge, logical completion, or explicit user declaration), verify and complete the following. Phase may not close until all four are done:

1. `implementation.md` — written and reflects the actual implementation (not a stub)
2. `review-and-fixes.md` — all review rounds closed; findings and actions recorded
3. `followup.md` — debt, open issues, and recommended next phases captured
4. **`summary` field in `phase.yml`** — write a 2-3 sentence summary of what was done and why. This enables informed tag-aware filtering without loading the full phase directory.

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
5a. **MCP index on phase close (if available):** If `index_phase` is in available tools, call `index_phase` with the full phase data: `{ id, title, tags, planText: plan.md[:2000], implementationText: implementation.md[:2000], commitDiffs: [for each commit hash in phase.yml commits: { hash, message, files: list of changed files, diffSnippet: first 2000 chars of git show output }], status: "completed" }`. Best-effort.
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
