---
name: project-memory-gates-lite
description: Lite-profile gates — Pre-Implementation Gate steps 0+1+2+3+4 (Step 5 skipped), simplified commit significance (trivial vs everything else), no topic-shift detection, lightweight Pre-Close (sanity + TODO warn).
---

# CRITICAL GATES (lite)

```
BEFORE IMPLEMENTATION → phase must exist → create it first
BEFORE COMMIT         → classify → update phase.yml if non-trivial (see Pre-Commit Gate)
BEFORE MERGE/CLOSE    → Pre-Close Gate (sanity + TODO warn + status update)
PIPELINE SUBMISSION   → counts as implementation → phase must exist before submit
```

---

# Commit Significance (lite — trivial-filter only)

Lite collapses the 3-way classification into a binary check:

| Class | Examples | Action |
|---|---|---|
| **Trivial** | unused import/var removal, typo fix, formatting, `console.log` cleanup, single-line comment edit | Attach to open phase silently, or skip if no open phase. Skip the decision check. |
| **Everything else** | features, bugfixes, refactors, schema/type changes, dependency upgrades, test additions, config tweaks, doc updates with runtime effect | Open a phase if none is open; run the decision check at the gate. |

The `Ambiguous` category from `full` collapses into "everything else" — lite optimizes for simplicity over fine-grained gating.

**Trivial-only session:** if the entire session produces only trivial commits and no open phase exists, no phase is created.

---

# Topic Shift — disabled

Lite does NOT do automatic topic-shift detection. If you start a new topic mid-conversation, **manually** open a new phase. The gate still enforces "phase must exist before significant commit" — you just don't get a proactive prompt.

If a single phase ends up scoping two unrelated topics, that's an accepted tradeoff in lite. Upgrade to `full` if topic discipline matters for your project.

---

# Pre-Commit Gate (lite) — MANDATORY

Before executing ANY commit, classify using the lite binary check and update `phase.yml` if non-trivial.

**Lite collapses full's Pre-Commit Gate into one action: update `phase.yml`.**

| Class | Action |
|---|---|
| **Trivial** (typo, formatting, import cleanup, single-line comment edit) | Attach to open phase silently. No file updates. |
| **Everything else** (features, bugfixes, refactors, schema/type changes, dependency upgrades, test additions, config tweaks) | 1) Append commit hash to `phase.yml.commits`. 2) If `plan.md` exists and the plan evolved during this commit, update it. 3) Then commit. |

**Rules:**
- **No instruction injection at this gate.** This is an operational gate. Lite re-injects instructions only at Pre-Impl Gate Step 0 — not here.
- **No user questions.** The lite binary check is deterministic; there is no ambiguous category to escalate.
- **Incremental.** `plan.md` updates are append-only when the plan evolves. `phase.yml.commits` grows by one hash per significant commit.
- **Multi-session safe.** When a phase spans sessions, each session appends its own commit hashes and plan updates.
- **Full profile has more ceremony** — see `full/gates.md` Pre-Commit Gate for the 5-file version.

---

# Phase Lifecycle (lite)

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

# Phase Creation (lite)

Create when **significant work begins**. Create the phase directory and files **before** the first significant commit.

```
.project-memory/phases/phase-YYYYMMDD-short-title/
```

**Required files:** `phase.yml` only. `plan.md` is optional — write it when there's actual planning to record; skip it for short refactors or single-purpose fixes. `phase.yml.summary` must be filled (1-2 sentences) regardless.

For `phase.yml` schema, read `lite/templates-phase.md`.

**Author attribution:** Set `created_by` from the current git identity. Lite does NOT use the `contributors` field. See `conventions-maintainer.md` → Author Attribution (lite scope).

**MCP index on phase open (if available):** same as full — call `index_phase` with what's available (`planText` empty if no plan.md). Best-effort.

---

# Pre-Implementation Gate (lite) — MANDATORY

Before dispatching ANY significant implementation work — direct file edits, junior pipeline submissions, agent calls for code changes.

Run these steps in order. **Step 5 from full is skipped in lite.**

**Step 0 — Load active instructions:**
Load active instructions for the current user: call `search_memory` with `created_by_email` filter and `type_filter: "instruction"` matching current git identity (see `mcp-integration.md`). Each MCP result carries a `body` field — this is the binding content. **MCP unavailable fallback:** scan `.project-memory/instructions/` and filter by `created_by.email`; read each instruction file to get the `# Prompt` section.

**Instructions are BINDING USER REQUIREMENTS. Verify the planned work complies with each instruction before proceeding. Non-compliance blocks implementation.**

**Lite-specific:** this is the ONLY place instructions are re-injected. They are NOT re-loaded at Pre-Close, and topic-shift is disabled. If you need re-injection at every gate, upgrade to `full`.

**Step 1 — Phase open?**
A phase MUST be open. If no phase is open, **CREATE IT FIRST** (lite shape: `phase.yml` + index entry; `plan.md` optional). Implementation work is BLOCKED until the phase exists.

**Step 2 — Implementation significance?**
Classify using the lite binary table above. Trivial → skip Step 3. Everything else → run Step 3.

**Discussion-triggered work:** When a prior DISCUSSION file triggers implementation, its `outcome` block provides rationale. Step 3 still applies based on classification.

**Step 3 — Decision check:**

1. List concrete entities the work touches (e.g. `user_id`, `auth_token`, `deployment_target`). See `conventions-decisions.md` → Touches Field Guidance.

2. **Find candidate decisions and discussions** — branch on MCP availability:

   **If MCP available:**
   - Decisions: `search_memory(query, touches_filter=entities, scope_filter=[primary_scope], type_filter="decision")`. Superseded decisions are now deterministically excluded by `search_memory` at the tool level (`WHERE status IS NULL OR status != 'superseded'`) — they never appear in gate results unless `include_superseded: true` is explicitly passed. The gate path never sets this flag, so superseded records are structurally invisible. See DECISION-2026-06-19-search-memory-superseded-exclusion.
   - **Globals (FS, always):** also read `decisions/index.md` Active section and surface every row where `Global` is `Yes`. Cross-cutting policies bind every implementation — load them unconditionally. See `conventions-decisions.md` → Rule 0 (Global surface).
   - Discussions: `search_memory(task_description, top_k=8, type_filter="discussion")`.

   **If MCP unavailable:**
   - Decisions: scan `decisions/index.md` Active section for `Touches` overlap, `Scope` match, **OR `Global` is `Yes`**.
   - Discussions: scan `discussions/index.md` for relevant outcome types.

3. For each candidate, apply the Decision Resolution Rules (`conventions-decisions.md`):
   - **Directional conflict** → add to batch question.
   - **Refinement / overlap without conflict** → silent one-line note, continue.
   - **Unrelated** → ignore.

4. If the batch has at least one entry, surface ALL candidates in a single `AskUserQuestion` call. Wait for response before implementing.

**Step 4 — Capture missing decisions:**
If the proposed work is a significant architectural move (deployment, auth, persistence, schema, public API) and Step 3 returned no candidates, ask once: "No prior decision covers this. Want to record one now?" — then proceed.

**Step 5 — SKIPPED in lite.**
The broad awareness load (`search_memory` without filters at top_k=8) does not run in lite. Conflict gating is fully handled by Step 3. If you want the broader context, upgrade to `full`.

**Session override:** If the user says "skip decision questions for now", suspend Step 3 questions for the session. Decisions are still **written** when made — only the pre-implementation question is bypassed. Resets next session.

---

# Decision Creation — MCP Index Trigger

Same as full. When a `DECISION-*.md` is created or status changes:

**Author attribution:** set `created_by` (lite does not track `contributors`).

**ADR file creation:** if `adr_enabled: true` in `config.yml`, create the `adr/` file — same procedure as full. ADR mirror is orthogonal to profile; `adr_enabled` governs it, not the profile setting.

**If `index_decision` is in available tools:** call `index_decision({ id, title, status, context, decisionBody, touches, created_by })`. Best-effort.

Re-call on every status change.

---

# Discussion Close — MCP Index Trigger

Same as full. Discussions are an orthogonal user-triggered feature, identical behavior across profiles.

**Author attribution:** set `created_by` (lite does not track `contributors`).

**If `index_discussion` is in available tools:** call `index_discussion({ id, title, status, outcome, tags, summary, bodyText, created_by })`. Best-effort.

---

# Pre-Close Gate (lite) — MANDATORY

**Before closing any phase**, verify the following. The lite version is much lighter than full — there is no 3-file verify and no instruction re-injection.

1. **`phase.yml.commits` non-empty.** If empty, ask once: "This phase has no commits recorded. Close anyway?" (sanity check).
2. **`plan.md` TODO scan** (if `plan.md` exists). Count unchecked `- [ ]` lines. If > 0, emit a one-line warning: "N TODO items remain in plan.md — proceeding anyway." Do NOT block.
3. **`phase.yml.summary` non-empty** — fill if missing (1-2 sentences).
4. **Set `status: completed` and `closed_at: today`** (or `merge_commit` if branch merged).

Lite does NOT:
- Verify `implementation.md` / `review-and-fixes.md` / `followup.md` (these files don't exist in lite phases).
- Transfer `followup.md` content to `roadmap.md` (roadmap entries are added incrementally during work in lite).
- Re-inject active instructions (this happens at Pre-Impl Gate Step 0 only).

---

# End-of-Phase Maintenance (lite)

At phase completion:

**Always update:**
```
1. phase.yml — set status: completed, set merge_commit if branch merged, closed_at if direct close
2. phases/index.yml — update phase entry
3. summaries/current-state.md — update current state if the work changed it (features, components, debt, risks)
4. MCP index on close (if available) — call `index_phase` with whatever exists: planText (or empty), implementationText empty, commitDiffs for recorded commits, status "completed"
```

**Update if applicable:**
```
5. summaries/roadmap.md — confirm any roadmap entries added during the phase are still relevant
```

Lite does NOT auto-update `project-memory.md`, `architecture.md`, `active-issues.md` — those files don't exist in the lite scaffolding (see `lite/templates-config.md`).

---

# Era Creation

Era creation is a maintainer-only feature, orthogonal to profile. If the maintainer role is opted into (`maintainers.md` exists), the gate fires at 10+ phases since the last era. See `full/gates.md` → Era Creation for the procedure — the steps are identical under lite, just operating on the lite phase shape.

If no `maintainers.md` exists (default), this gate never fires.
