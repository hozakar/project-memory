---
name: project-memory-gates
description: Pre-Implementation Gate and turn-boundary sweep for the standard profile. No phase ceremony. Summary writes are turn-boundary-driven. Instruction re-injection at both gates (Pre-Impl GATE 0 + Turn-Boundary GATE 0).
---

# CRITICAL GATES (standard profile)

```
BEFORE IMPLEMENTATION → Pre-Implementation Gate (GATE 0 + Steps 1–3)
TURN END             → turn-boundary sweep (GATE 0 re-injection + did this turn include a commit? yes → update current-state + roadmap)
```

> **Turn-boundary-driven writes (T6 contract):** The turn-boundary sweep below is the sole trigger for summary file updates. At turn end, the sweep asks "did this turn include a commit?" — if yes, it updates `current-state.md` (always) and `roadmap.md` (on scope change). One judgment per turn, not N per commit. No per-commit gate fires. Decision-moment awareness (DECISION-2026-06-25-decision-moment-awareness) is independent — decisions are captured when made, mid-turn. T6 (audit re-anchor) may quote this paragraph as the authoritative trigger definition.

> **Instruction re-injection (DECISION-2026-06-14-instruction-gate-injection):** Active instructions are re-injected at two gate checkpoints: Pre-Implementation Gate GATE 0 (before any significant implementation) and Turn-Boundary Sweep GATE 0 (at turn end). This ensures instructions survive context compaction and long contexts. See each gate's GATE 0 section below.

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

Classify the work using the binary table below. Standard collapses the previously 3-way classification into a binary check:

| Class | Examples | Action |
|---|---|---|
| **Trivial** | rename, format, comment, import cleanup, single-line bugfix, dependency patch bump, single-line comment edit | Skip the decision check entirely (Step 2) |
| **Everything else** | features, bugfixes, refactors, schema/type changes, dependency upgrades, test additions, config tweaks, doc updates with runtime effect | Run the decision check (Step 2) |

The `Ambiguous` category from the legacy full profile collapses into "everything else" — standard optimizes for simplicity over fine-grained gating.

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

**Step 4 — SKIPPED in standard.** The broader awareness load (`search_memory` without filters at top_k=8) does not run in standard. Conflict gating is fully handled by Step 2. This was previously a legacy full-only feature.

### Session override

If the user says "skip decision questions for now" (or similar phrasing), suspend Step 2 questions for the session. Decisions are still **written** when made — only the pre-implementation question is bypassed. Resets next session.

---

# Turn-Boundary Sweep (replaces Pre-Commit Gate)

> **Write trigger (T6 contract):** The turn-boundary sweep fires at the end of each turn (after the user's turn is handled / before responding to the next user prompt). It is the sole trigger for automated summary file updates. The exact hook timing is tool-dependent: where turn/session hooks exist, the sweep is hook-enforced; otherwise it is an LLM-enforced turn-end self-check.

One judgment per turn — not N per commit.

## ⚠️ GATE 0 — INSTRUCTION RE-INJECTION

**THIS GATE EXECUTES BEFORE STEP 1. IT IS NOT OPTIONAL.**

Re-load active instructions to ensure they survive context compaction and long contexts. This is the same procedure as Pre-Implementation Gate GATE 0.

**If MCP available:**
```
search_memory(
  query: "active instructions for this session",
  type_filter: "instruction",
  created_by_email: "<run: git config user.email>"
)
```

**If MCP unavailable (fallback):**
Scan `.project-memory/instructions/` for `INSTRUCTION-*.md` files with `state: active`. Filter by `created_by.email` matching current git identity.

Re-inject each instruction's `body` (MCP) or `# Prompt` section (FS) into context. If no active instructions exist, this is a no-op — proceed to Step 1.

---

## Step 1 — Did this turn include a commit?

Check mechanically via `git log --since=<turn-start>` or equivalent. A commit existing during this turn is the only significance signal — no per-commit significant/trivial classification is needed.

- **No commit this turn** → move on. No memory writes.
- **Yes, at least one commit this turn** → proceed to Step 2.

## Step 2 — Update summaries

Write `summaries/current-state.md` **once**, covering all the turn's commits (with all of them in context). Cover at minimum:
- What changed across the turn's commits (features, components affected)
- Any new debt or risks discovered
- Updated recommended next actions

**On scope change — roadmap.md:**
Also update `summaries/roadmap.md` if the turn:
- Introduced a new area of work (new module, new capability not previously planned)
- Retired an area of work (module removed, feature completed and decommissioned)
- Introduced a new external constraint (new dependency, new platform requirement, new compliance boundary)

Update the relevant section (`### Short-term` / `### Medium-term` / `### Later`) to reflect the change. Add new entries for new work areas; strike through or remove retired entries.

**Significance definition reference** (what counts as scope-change for roadmap):
- New area of work: module, capability, or feature not previously represented in the roadmap.
- Retired area: module removed, feature completed and decommissioned, or explicitly abandoned.
- New external constraint: dependency, platform requirement, or compliance boundary that was not previously a factor.

If unsure whether a scope change occurred, err on the side of updating roadmap.md — a minor duplication is better than a stale roadmap.

## Decision capture is NOT part of this sweep

Decision-moment awareness (DECISION-2026-06-25-decision-moment-awareness) is independent of the turn boundary. Decisions are captured **when made** (mid-turn), not batched at the sweep. The sweep carries instruction re-injection (GATE 0) and rolling summaries (current-state + roadmap) — not decision capture.

---

# What was removed

- **Pre-Commit Gate** — replaced by the turn-boundary sweep above. The per-commit significance classifier (trivial vs everything else) and per-commit summary writes are retired in favor of one judgment per turn: "did this turn include a commit?" — yes/no — and a single summary write covering the turn's commits.
- **Pre-Close Gate** — removed. Phase lifecycle and phase-close ceremony no longer exist as gate concepts. Summary writes are turn-boundary-driven (see Turn-Boundary Sweep).
- **Topic-shift-to-new-phase logic** — removed. Topic tracking no longer gates on phase creation. The turn-boundary sweep's scope-change detection handles roadmap updates when work shifts areas.
- **Phase-close write triggers** — removed. All automated summary updates are now turn-boundary-driven via the sweep above.

---

# Discussion trigger (orthogonal gate)

When Discussion Mode engages (explicit `Skill project-memory discuss` or implicit trigger per `conventions/discussions.md`), active instructions are re-injected before the discussion proceeds. This is the same procedure as Pre-Implementation Gate GATE 0 — load active instructions filtered by current git user, prepend their body to discussion context.

See `conventions/discussions.md` → Lifecycle for the full discussion flow.
