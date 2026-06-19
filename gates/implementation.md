---
name: project-memory-gates-implementation
description: Pre-Implementation Gate for both full and lite profiles. Step 0 is a mandatory blocking guard clause.
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

## Full Profile — Steps 1–5

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

2. **Find candidate decisions and discussions** — branch on MCP availability:

   **If MCP available (see `mcp-integration.md`):**
   - Decisions: `search_memory(query, touches_filter=entities, scope_filter=[primary_scope], type_filter="decision")` — exact `touches` / `primary_scope` filter combined with semantic ranking. Superseded decisions are now deterministically excluded by `search_memory` at the tool level (`WHERE status IS NULL OR status != 'superseded'`) — they never appear in gate results unless `include_superseded: true` is explicitly passed. The gate path never sets this flag, so superseded records are structurally invisible. See DECISION-2026-06-19-search-memory-superseded-exclusion.
   - **Globals (FS, always):** also read `decisions/index.md` Active section and surface every row where `Global` is `Yes`. Global rules are cross-cutting policies that bind every implementation regardless of touches overlap or semantic similarity — load them unconditionally. See `conventions-decisions.md` → Rule 0 (Global surface) and `DECISION-2026-06-17-global-scope-decisions`.
   - Discussions: `search_memory(task_description, top_k=8, type_filter="discussion")` — semantic catch for discussions whose conclusions might affect the proposed direction.

   **If MCP unavailable:**
   - Decisions: scan `decisions/index.md` Active section for rows where any `Touches` entry overlaps your list, `Scope` matches your primary scope, **OR `Global` is `Yes`**. The `Global = Yes` rows are cross-cutting policies — surface them on every gate evaluation.
   - Discussions: scan `discussions/index.md` for discussions with relevant outcome types.

3. For each candidate, apply the Decision Resolution Rules (`conventions.md`) and classify:
   - **Directional conflict** — candidate claim contradicts the proposed work in a way that would change its direction → add to batch question.
   - **Refinement / overlap without conflict** — candidate touches the same area but does not contradict → emit a one-line silent note, continue.
   - **Unrelated** — overlap is incidental → ignore.

4. If the batch has at least one entry, surface ALL candidates in a single `AskUserQuestion` call. Do NOT issue sequential questions per candidate. Wait for the user's response before implementing.

**Step 4 — Capture missing decisions:**
If the proposed work is a significant architectural move (deployment, auth, persistence, schema, public API) and the Step 3 candidate set is empty (no decisions returned by `search_memory` or no matching index rows), ask once: "No prior decision covers this. Want to record one now?" — then proceed.

**Step 5 — Broader semantic context (MCP-only, awareness load):**
If `search_memory` is in available tools, call `search_memory(task_description, top_k=8)` without `type_filter` to catch related phases or discussions Step 3 didn't filter for. For each result with similarity ≥ 0.6 not already loaded, load the corresponding `.project-memory/` file for awareness. This is **context-loading only** — does NOT add to the Step 3 batch question. Conflicts are gated by Step 3; Step 5 broadens the picture.

**Session override:**
If the user says "skip decision questions for now" (or similar phrasing — "skip", "skip for now", "speed mode"), suspend Step 3 questions for the rest of the session. Decisions are still **written** when made — only the pre-implementation question is bypassed. Override resets on the next session.

## Lite Profile — Steps 1–4

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

**Lite-specific:** instruction re-injection occurs at GATE 0 above. Instructions are NOT re-loaded at Pre-Close, and topic-shift is disabled. If you need re-injection at every gate, upgrade to full.

**Session override:** If the user says "skip decision questions for now", suspend Step 3 questions for the session. Decisions are still **written** when made — only the pre-implementation question is bypassed. Resets next session.
