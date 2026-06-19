---
name: project-memory-gates-lifecycle
description: Phase lifecycle, phase creation, and topic shift criteria for both full and lite profiles.
---

# Phase Lifecycle

## Full Profile

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

## Lite Profile

A phase represents a **logical unit of work**, not a branch.

```
Significant work begins → Phase created (status: planning)
          ↓
Commits accumulate → phase.yml.commits updated
          ↓
Work unit complete → Phase closes (status: completed)
                     Roadmap items added incrementally during work,
                     not transferred at close.
```

**Branch behavior:** same as full — `branch` and `merge_commit` in `phase.yml` are optional; phase opens/closes based on logical work units.

**Rebase/squash hygiene:** If you rewrite recorded commits, update `phase.yml.commits` with the new hashes. Audit Cat 7 auto-annotates orphaned references but cannot recover the lost link.

**Phase close criteria** (any one is sufficient):
- Branch merged → set `merge_commit`, `status: completed`
- Logical work unit finished → set `closed_at`, `status: completed`
- Explicit user declaration → same as above
- Work cancelled or superseded → `status: abandoned`, `abandoned_reason: <brief note>`

---

# Phase Creation

## Full Profile

Create when **significant work begins** — regardless of whether a branch is opened. Create the phase directory and files **before** making the first significant commit.

```
.project-memory/phases/phase-YYYYMMDD-short-title/
```

Required files: `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`

For file formats and templates, read `templates.md`.

**Author attribution:** Set `created_by` and seed `contributors` in `phase.yml` from the current git identity (run `git config user.name` + `git config user.email`; missing → `{ name: "unknown", email: "unknown" }`). Full rules: `conventions.md` → Author Attribution.

**MCP index on phase open (if available):**
After writing `phase.yml` and `plan.md`, if `index_phase` is in available tools (see `mcp-integration.md`):
- Call `index_phase({ id, title, tags, planText: plan.md content truncated to 2000 chars, implementationText: "", commitDiffs: [], status: "planning", created_by, contributors })` (pass the `created_by` + `contributors` from `phase.yml`)
- Best-effort: if the call fails, continue — file writes already completed.

## Lite Profile

Create when **significant work begins**. Create the phase directory and files **before** the first significant commit.

```
.project-memory/phases/phase-YYYYMMDD-short-title/
```

**Required files:** `phase.yml` only. `plan.md` is optional — write it when there's actual planning to record; skip it for short refactors or single-purpose fixes. `phase.yml.summary` must be filled (1-2 sentences) regardless.

For `phase.yml` schema, read `lite/templates-phase.md`.

**Author attribution:** Set `created_by` from the current git identity. Lite does NOT use the `contributors` field. See `conventions-maintainer.md` → Author Attribution (lite scope).

**MCP index on phase open (if available):** same as full — call `index_phase` with what's available (`planText` empty if no plan.md). Best-effort.

---

# Topic Shift

## Full Profile

A shift is substantial when ANY of the following is true:

- Different system layer (e.g. frontend → backend, app → infra)
- Different user-facing feature or capability
- Commits are 2+ calendar days apart from the last commit in the current phase
- User opens a new branch for the new work
- The changed files are in a completely different module or top-level directory than the current phase's commits
- User explicitly declares "new topic", "new feature", or similar

When uncertain whether a shift is substantial, ask the user before opening a new phase.

**On topic shift:** Reload active instructions (same as Pre-Implementation Gate Step 0) before opening the new phase.

## Lite Profile

Lite does NOT do automatic topic-shift detection. If you start a new topic mid-conversation, **manually** open a new phase. The gate still enforces "phase must exist before significant commit" — you just don't get a proactive prompt.

If a single phase ends up scoping two unrelated topics, that's an accepted tradeoff in lite. Upgrade to `full` if topic discipline matters for your project.

---

# Era Creation

## Full Profile

**Gate:** When 10+ phases accumulate since the last era (tracked via `eras/index.yml`), only maintainers receive the creation prompt. Developers are not disturbed. The maintainer should run audit before creating the era (recommended, not enforced).

**Creation steps:**
1. Run `Skill project-memory audit` to ensure clean state.
2. Create `eras/era-NNN.md` using the template in `templates.md`. List all covered phases in the frontmatter `phases:` field.
3. Update `eras/index.yml` with the new era entry.
4. **Audit ignore cleanup:** Open `.project-memory/config.yml`. For each entry in `audit_ignore`, check whether its `key` references any phase ID now covered by the new era. Remove matching entries — archived phases no longer need ignore suppressions. See `audit.md` → Era-Based Auto-Clean for the full procedure.
5. Optionally update `summaries/project-memory.md` Historical Milestones with the era.

## Lite Profile

Era creation is a maintainer-only feature, orthogonal to profile. If the maintainer role is opted into (`maintainers.md` exists), the gate fires at 10+ phases since the last era. See `gates/lifecycle.md` → Era Creation → Full Profile for the procedure — the steps are identical under lite, just operating on the lite phase shape.

If no `maintainers.md` exists (default), this gate never fires.
