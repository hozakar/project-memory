---
name: project-memory-gates-full
description: Pre-Implementation Gate and Pre-Commit Gate for the full profile. No phase ceremony. Summary writes are commit-boundary-driven (not phase-boundary-driven).
---

# CRITICAL GATES (full profile)

```
BEFORE IMPLEMENTATION → Pre-Implementation Gate (GATE 0 + Steps 1–4)
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

Classify the work using the following table:

| Significance | Examples | Decision check |
|---|---|---|
| **Trivial** | rename, format, comment, import cleanup, single-line bugfix, dependency patch bump | Skip the decision check entirely |
| **Significant** | new feature, schema/type change, deployment-model change, auth introduction or removal, persistence layer change, new dependency, new module | Run the decision check |
| **Ambiguous** | test additions, config tweaks, small UI changes, doc updates with runtime effect | Run the decision check but only escalate on **directional** conflict |

**Discussion-triggered work:** When implementation is triggered by a prior DISCUSSION file, the discussion's frontmatter `outcome` block provides the rationale. The decision check (Step 2) still applies based on significance classification.

## Step 2 — Decision check (when required by Step 1)

1. List the concrete entities the work touches (e.g. `user_id`, `auth_token`, `deployment_target`). Be concrete — see `conventions/decisions.md` → Touches Field Guidance.

2. **Find candidate decisions and discussions** — branch on MCP availability:

   **If MCP available (see `mcp-integration.md`):**
   - Decisions: `search_memory(query, touches_filter=entities, scope_filter=[primary_scope], type_filter="decision")` — exact `touches` / `primary_scope` filter combined with semantic ranking. Superseded decisions are deterministically excluded by `search_memory` at the tool level — they never appear in gate results unless `include_superseded: true` is explicitly passed. The gate path never sets this flag, so superseded records are structurally invisible. See DECISION-2026-06-19-search-memory-superseded-exclusion.
   - **Globals (FS, always):** also read `decisions/index.md` Active section and surface every row where `Global` is `Yes`. Global rules are cross-cutting policies that bind every implementation regardless of touches overlap or semantic similarity — load them unconditionally. See `conventions/decisions.md` → Rule 0 (Global surface) and `DECISION-2026-06-17-global-scope-decisions`.
   - Discussions: `search_memory(task_description, top_k=8, type_filter="discussion")` — semantic catch for discussions whose conclusions might affect the proposed direction.

   **If MCP unavailable:**
   - Decisions: scan `decisions/index.md` Active section for rows where any `Touches` entry overlaps your list, `Scope` matches your primary scope, **OR `Global` is `Yes`**. The `Global = Yes` rows are cross-cutting policies — surface them on every gate evaluation.
   - Discussions: scan `discussions/index.md` for discussions with relevant outcome types.

3. For each candidate, apply the Decision Resolution Rules (`conventions/decisions.md`) and classify:
   - **Directional conflict** — candidate claim contradicts the proposed work in a way that would change its direction → add to batch question.
   - **Refinement / overlap without conflict** — candidate touches the same area but does not contradict → emit a one-line silent note, continue.
   - **Unrelated** — overlap is incidental → ignore.

4. If the batch has at least one entry, surface ALL candidates in a single `AskUserQuestion` call. Do NOT issue sequential questions per candidate. Wait for the user's response before implementing.

## Step 3 — Capture missing decisions

If the proposed work is a significant architectural move (deployment, auth, persistence, schema, public API) and the Step 2 candidate set is empty (no decisions returned by `search_memory` or no matching index rows), ask once: "No prior decision covers this. Want to record one now?" — then proceed.

## Step 4 — Broader semantic context (MCP-only, awareness load)

If `search_memory` is in available tools, call `search_memory(task_description, top_k=8)` without `type_filter` to catch related phases, discussions, or decisions Step 2 didn't filter for. For each result with similarity ≥ 0.6 not already loaded, load the corresponding `.project-memory/` file for awareness. This is **context-loading only** — does NOT add to the Step 2 batch question. Conflicts are gated by Step 2; Step 4 broadens the picture.

### Session override

If the user says "skip decision questions for now" (or similar phrasing — "skip", "skip for now", "speed mode"), suspend Step 2 questions for the rest of the session. Decisions are still **written** when made — only the pre-implementation question is bypassed. Override resets on the next session.

---

# Pre-Commit Gate

> **Write trigger (T6 contract):** The Pre-Commit Gate fires before every significant commit. It updates `.project-memory/summaries/current-state.md` unconditionally, and also updates `.project-memory/summaries/roadmap.md` when the commit changes scope (new area of work, new area retired, new external constraint). These writes are the only automated summary-update path — there is no phase-close or phase-open trigger for summary files. Decision capture also occurs at this gate when a decision-moment happened during the work (per DECISION-2026-06-25-decision-moment-awareness).

Before executing ANY commit, run these steps in order.

## Step 1 — Classify significance

| Significance | Examples | Action |
|---|---|---|
| **Trivial** | unused import/var removal, typo fix, formatting, `console.log` cleanup | Skip Steps 2–3. No summary update, no decision capture. |
| **Significant** | feature, bugfix, refactor, schema/type change, config with runtime effect, security fix, perf optimization, new dependency | Proceed to Step 2. |
| **Ambiguous** | test additions, config tweaks, dependency upgrades, doc updates | Treat as Significant (proceed to Step 2). |

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
