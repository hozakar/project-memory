---
name: project-memory-gates-lite
description: Pre-Implementation Gate and Pre-Commit Gate for the lite profile. No phase ceremony. Summary writes are commit-boundary-driven.
---

# CRITICAL GATES (lite profile)

```
BEFORE IMPLEMENTATION → Pre-Implementation Gate (GATE 0 + Steps 1–3)
BEFORE COMMIT         → Pre-Commit Gate (significance → update summaries → capture decision)
```

> **Commit-boundary-driven writes (T6 contract):** The Pre-Commit Gate below is the sole trigger for summary file updates. Every significant commit fires the gate, which updates `current-state.md` (always) and `roadmap.md` (on scope change). No phase-close or phase-open step triggers these writes — they are now entirely commit-boundary-driven. T6 (audit re-anchor) may quote this paragraph as the authoritative trigger definition.

---

# Pre-Implementation Gate

Before dispatching ANY significant implementation work — including direct file edits, junior pipeline submissions, agent tool calls for code changes.

Run these steps in order. None may be skipped.

## ⚠️ GATE 0 — INSTRUCTION LOAD

**THIS GATE EXECUTES BEFORE STEP 1. IT IS NOT OPTIONAL. Implementation is BLOCKED until active instructions are loaded and verified.**

### EXECUTE — Load active instructions

**If MCP available:**
```
search_memory(
  query: "<describe the planned implementation work>",
  type_filter: "instruction",
  created_by_email: "<run: git config user.email>"
)
```
Each result carries a `body` field prefixed with "THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION:". This is the binding content — no additional file read needed.

**If MCP unavailable (fallback):**
Scan `.project-memory/instructions/` for `INSTRUCTION-*.md` files. Filter by `created_by.email` matching current git identity. Read each matching file; extract the `# Prompt` section.

### VERIFY — Compliance check

For each loaded instruction, verify the planned implementation complies. **Instructions are BINDING USER REQUIREMENTS. Non-compliance BLOCKS implementation.** If any instruction is violated, report the conflict to the user and STOP. Do not proceed to Step 1.

---

## Step 1 — Implementation significance?

Classify the work using the binary table below. Lite collapses the 3-way classification into a binary check:

| Class | Examples | Action |
|---|---|---|
| **Trivial** | rename, format, comment, import cleanup, single-line bugfix, dependency patch bump, single-line comment edit | Skip the decision check entirely (Step 2) |
| **Everything else** | features, bugfixes, refactors, schema/type changes, dependency upgrades, test additions, config tweaks, doc updates with runtime effect | Run the decision check (Step 2) |

The `Ambiguous` category from full collapses into "everything else" — lite optimizes for simplicity over fine-grained gating.

## Step 2 — Decision check (when required by Step 1)

1. List the concrete entities the work touches (e.g. `user_id`, `auth_token`, `deployment_target`). Be concrete — see `conventions/decisions.md` → Touches Field Guidance.

2. **Find candidate decisions and discussions** — branch on MCP availability:

   **If MCP available:**
   - Decisions: `search_memory(query, touches_filter=entities, scope_filter=[primary_scope], type_filter="decision")`. Superseded decisions are deterministically excluded by `search_memory` at the tool level — they never appear in gate results unless `include_superseded: true` is explicitly passed. The gate path never sets this flag, so superseded records are structurally invisible. See DECISION-2026-06-19-search-memory-superseded-exclusion.
   - **Globals (FS, always):** also read `decisions/index.md` Active section and surface every row where `Global` is `Yes`. Cross-cutting policies bind every implementation — load them unconditionally. See `conventions/decisions.md` → Rule 0 (Global surface).
   - Discussions: `search_memory(task_description, top_k=8, type_filter="discussion")`.

   **If MCP unavailable:**
   - Decisions: scan `decisions/index.md` Active section for `Touches` overlap, `Scope` match, **OR `Global` is `Yes`**.
   - Discussions: scan `discussions/index.md` for relevant outcome types.

3. For each candidate, apply the Decision Resolution Rules (`conventions/decisions.md`):
   - **Directional conflict** → add to batch question.
   - **Refinement / overlap without conflict** → silent one-line note, continue.
   - **Unrelated** → ignore.

4. If the batch has at least one entry, surface ALL candidates in a single `AskUserQuestion` call. Wait for response before implementing.

## Step 3 — Capture missing decisions

If the proposed work is a significant architectural move (deployment, auth, persistence, schema, public API) and Step 2 returned no candidates, ask once: "No prior decision covers this. Want to record one now?" — then proceed.

**Step 4 — SKIPPED in lite.** The broader awareness load (`search_memory` without filters at top_k=8) does not run in lite. Conflict gating is fully handled by Step 2. If you need the broader context, upgrade to `full`.

### Session override

If the user says "skip decision questions for now" (or similar phrasing), suspend Step 2 questions for the session. Decisions are still **written** when made — only the pre-implementation question is bypassed. Resets next session.

---

# Pre-Commit Gate

> **Write trigger (T6 contract):** The Pre-Commit Gate fires before every significant commit. It updates `.project-memory/summaries/current-state.md` unconditionally, and also updates `.project-memory/summaries/roadmap.md` when the commit changes scope (new area of work, new area retired, new external constraint). These writes are the only automated summary-update path — there is no phase-close or phase-open trigger for summary files. Decision capture also occurs at this gate when a decision-moment happened during the work (per DECISION-2026-06-25-decision-moment-awareness).

Before executing ANY commit, run these steps in order.

## Step 1 — Classify significance

| Class | Examples | Action |
|---|---|---|
| **Trivial** | unused import/var removal, typo fix, formatting, `console.log` cleanup, single-line comment edit | Skip Steps 2–3. No summary update, no decision capture. |
| **Everything else** | features, bugfixes, refactors, schema/type changes, dependency upgrades, test additions, config tweaks, doc updates with runtime effect | Proceed to Step 2. |

## Step 2 — Update summaries

**Always — current-state.md:**
Update `.project-memory/summaries/current-state.md` to reflect the new state after this commit. Cover at minimum:
- What changed (the commit's effect on features, components)
- Any new debt or risks discovered
- Updated recommended next actions

**On scope change — roadmap.md:**
Also update `.project-memory/summaries/roadmap.md` if the commit:
- Introduces a new area of work (new module, new capability not previously planned)
- Retires an area of work (module removed, feature completed and decommissioned)
- Introduces a new external constraint (new dependency, new platform requirement, new compliance boundary)

Update the relevant section (`### Short-term` / `### Medium-term` / `### Later`) to reflect the change. Add new entries for new work areas; strike through or remove retired entries.

## Step 3 — Capture DECISION at decision-moment

If during this commit's work a decision-moment occurred — i.e. the conversation involved comparing architectural alternatives and the user selected a direction — apply the loss heuristic from `conventions/discussions.md`:

> *"If this decision is never saved, what specifically goes wrong in a future session?"*

If save-worthy, create a DECISION record immediately (write `DECISION-YYYY-MM-DD-slug.md` + update `decisions/index.md`). Do NOT ask — this is a silent capture. See `DECISION-2026-06-25-decision-moment-awareness` for the full rule.

If no decision-moment occurred, skip this step silently.

## Commit grouping

- Multiple significant commits in the same session on related work: update summaries incrementally with each commit.
- If unsure whether a scope change occurred, err on the side of updating roadmap.md — a minor duplication is better than a stale roadmap.

---

# What was removed

- **Pre-Close Gate** — removed. Phase lifecycle and phase-close ceremony no longer exist as gate concepts. Summary writes are commit-boundary-driven (see Pre-Commit Gate).
- **Topic-shift-to-new-phase logic** — removed. Topic tracking no longer gates on phase creation. The Pre-Commit Gate's scope-change detection in Step 2 handles roadmap updates when work shifts areas.
- **Phase-close write triggers** — removed. All automated summary updates are now commit-boundary-driven via the Pre-Commit Gate above.
