---
name: project-memory-protocol
description: Standard-profile agent thinking protocol, simplified memory loading strategy (2 summaries), instruction re-injection scope limited to Pre-Impl Gate.
---

# Agent Thinking Protocol (standard)

**At session start:**
- Is `summaries/current-state.md` accurate? Review it as the active session context.
- What commits have landed since the last session?
- Is `summaries/roadmap.md` or `summaries/current-state.md` stale relative to recent git commits?

**Before committing:**
- If the work is non-trivial (anything beyond typo/formatting/import cleanup): update `summaries/current-state.md` before the commit lands.
- If work scope changed during this session, update `summaries/roadmap.md`.
- Trivial commits (typo, formatting): commit silently, no summary updates.
- This is the Pre-Commit Gate — commit boundaries are the natural checkpoint for recording what changed and why.

**Before writing any plan:**
- List the concrete entities (`touches` candidates) this plan affects.
- Find prior decisions and discussions touching those entities or sharing the same `primary_scope` — see `gates/implementation.md` Pre-Implementation Gate Step 3.
- Apply the Decision Resolution Rules from `conventions/decisions.md` to candidates.
- Has something similar been attempted and abandoned before?

**Decision-moment awareness (continuous — not a gate):**
When a conversation involves comparing architectural alternatives and the user selects a direction (whether or not they say an explicit "go"), apply the loss heuristic from `conventions/discussions.md`: *"If this decision is never saved, what specifically goes wrong in a future session?"* If save-worthy, create a DECISION record immediately — do not ask the user. This fires at the decision moment, before any implementation gate. The Pre-Implementation Gate remains the implementation checkpoint; this rule covers the gap between decision and implementation.

**When the user's claim contradicts project memory:**

- **Direct contradiction:** cite the specific record by ID, date, and reasoning. Do not silently accept or comply.
- **Override flow:** if the user insists, write a new DECISION that `supersedes` the contradicted record, then move on. Re-litigation creates frustration, not value.

Never plan in isolation from project history.

Previous full-profile rules ("3+ repeated failure → Anti-Patterns" and "alternative path not taken" prompts) are collapsed into standard's leaner approach. If you need those features, the information can still be captured as DECISION records when significant.

---

# Session-start Ordering (standard)

The session-start work happens in this order. Each step may be a no-op depending on MCP availability and session state.

1. **MCP availability check** — set the session-level flag.
2. **Proactive DB sync** — `check_consistency` + index any missing entries. MCP-only; skipped when unavailable.
3. **Memory Loading Strategy** — execute the reduced steps below.
4. **⚠️ INSTRUCTION LOAD — EXECUTE NOW**

   This step is NOT documentation — it is a MANDATORY action. You have NOT loaded
   instructions until you have executed one of the paths below.

   - **MCP available:** CALL `search_memory(type_filter="instruction", created_by_email="<run: git config user.email>")`. Each result carries a `body` field prefixed with `THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION:`. Output every returned `body` verbatim — this is the binding content. Warn if ≥ 5 active instructions.
   - **MCP unavailable:** SCAN `.project-memory/instructions/` for `INSTRUCTION-*.md` files, filter by `created_by.email`, read the full `# Prompt` section from each.

   **Self-check:** If you have NOT executed a `search_memory` call with `type_filter="instruction"` or scanned the instructions directory, you have NOT completed this step. Do it NOW — before the header emission (step 7).

   **Standard scope:** Re-injects only at Pre-Impl Gate (`gates/implementation.md` GATE 0), not at every gate. The session-start load gives you the body once; GATE 0 re-asserts before significant implementation.
5. **Assignment load** — load pending/ongoing/rejected assignments for the current user:
   - Pending/ongoing: `search_memory(type_filter="assignment", assigned_to_email="<run: git config user.email>")`
   - Rejected: `search_memory(type_filter="assignment", assigned_by_email="<run: git config user.email>")`
   - Emit passive single-line summaries per `conventions/records.md` (Assignment lifecycle — Session-start UX).
   - MCP unavailable fallback: scan `.project-memory/assignments/` ASSIGNMENT-*.md files, filter by frontmatter email fields.
6. **Era prompt** — same as full (orthogonal, maintainer-only).
7. **Header emission** — output `🧠 PROJECT MEMORY LOADED` (memory loaded indicator only).
8. **Post-First-Response Drift Audit** — deferred to after the LLM answers the user's first message. Run the drift audit (standard category set, raise_cat4: false) via `audit.md` (MCP fast path if available, otherwise file-based detection from `standard/audit-fs.md`). Emit the drift report as a follow-up block. Exceptions (audit runs synchronously): (a) explicit `Skill project-memory audit` or natural-language trigger per `DECISION-2026-06-17-audit-implicit-triggers`; (b) first user message is itself an audit trigger — run synchronously; (c) `minimal` profile — no audit, no deferral.

---

# Memory Loading Strategy (standard)

```
1. .project-memory/summaries/current-state.md
2. .project-memory/summaries/roadmap.md
3. .project-memory/decisions/index.md — Active section (primary input to Pre-Impl Gate Step 3)
4. .project-memory/discussions/index.md (active entries only)
5. .project-memory/instructions/index.md (if present)
6. .project-memory/assignments/index.yml (if present)
7. User-scoped session items (current user — derived from git identity):
   - **Instructions (global):**
     - MCP available: `search_memory(query="instructions applies globally", type="instruction", top_k=10)` — filter `applies_globally: true`.
     - MCP unavailable: scan `.project-memory/instructions/` for `INSTRUCTION-*.md`; filter `applies_globally: true`.
   - Active instructions (EXECUTE — see Step 4 above)
   - Pending/ongoing assignments (EXECUTE — see Step 5 above)
   - Notification format etc. defined in conventions/records.md
8. Recent git commits (as needed)
```

**On context compaction:** Memory Loading Strategy is NOT re-run on compaction. Active instructions survive via Pre-Impl Gate Step 0 re-injection. The rest is best-effort.

**Standard reductions vs legacy full:**
- Reads 2 summaries (`current-state.md`, `roadmap.md`) instead of 5 — `project-memory.md`, `active-issues.md`, `architecture.md` are not present in standard scaffolding.
- No individual DECISION/DISCUSSION file pre-load — gates handle those lazily.
- No "rejected assignments" or "completed assignment notifications" loading — assignments are still loadable on demand, but the noisy session-start surface is trimmed.

## Token Budget Guidelines (standard)

- 2 summary files instead of 5 — token cost is already low.
- `decisions/index.md` and `discussions/index.md` are loaded at session start. Individual DECISION/DISCUSSION files are loaded on demand.
- `instructions/index.md` and `assignments/index.yml` are loaded at session start (when present).

## Staleness — standard

| Criterion | Threshold | Purpose |
|---|---|---|
| Tier 3 contradiction detection | ≥ 30 days since closure | Offer the user an override path on old decisions |

Standard does NOT use the era-back threshold (eras are an orthogonal maintainer feature). Discussion expiry is handled by Cat 11 audit — which is OFF in standard (see `standard/audit-fs.md`), so discussion expiry is on the user to manage manually.

---

# Knowledge Preservation Rule (standard — relaxed)

Every DECISION and significant change must leave enough context to answer:

- Why was this done? (captured in the DECISION record or `summaries/current-state.md`)
- Which commits implemented it? (referenced in the DECISION record or commit message)
- What should happen next? (a row in `summaries/roadmap.md`)

Legacy full's "what alternatives were rejected, what constraints existed, what tensions does this create or resolve" can still be captured via DECISION files when significant, but standard does not require them for every change. If you find yourself frequently writing DECISIONs, that's normal — standard optimizes for lean ceremony while keeping the value carriers intact.

---

# MCP Companion Integration

See `mcp-integration.md` for the full tool catalog. MCP behavior in standard is unchanged from the previous profile behavior — MCP is an orthogonal accelerator.

- **Availability check:** same. If `search_memory`, `index_decision`, `index_instruction` are all present → MCP available.
- **Proactive DB sync:** same — call `check_consistency` and index any missing entries on session start.
- **Memory Loading Strategy overlay:**
  - **Hook A — between step 6 and step 7:** if the session has a stated task, call `search_memory(task_description, top_k=8)` for similarity ≥ 0.6 files. Does NOT set `include_superseded` — superseded decisions are excluded from awareness load. For each result with similarity ≥ 0.6, load the corresponding file from `.project-memory/` (DECISION or DISCUSSION file). These files are *in addition to* steps 7–8, not a substitute.
  - **Hook B — at Pre-Impl Gate Step 3:** same as full. Does NOT set `include_superseded` — superseded decisions excluded from gate awareness load.
  - **No Hook C** — the broad awareness load (Step 5 of legacy full's gate) does not exist in standard.
- **Ad-hoc search rule:** same — call `search_memory` when the user asks about past decisions/phases/discussions. When the question is explicitly historical (researching superseded/past decisions), pass `include_superseded: true` to surface those records. Ordinary lookup queries do NOT set this flag. See DECISION-2026-06-19-search-memory-superseded-exclusion.
- **Constraint search rule** (Discussion Mode trigger): same — call `search_memory("engineering constraints and principles", scope_filter=["constraint"], type_filter="decision")` when discussion mode engages. Does NOT set `include_superseded` — only active constraints shape design direction.
- **Assignment search:** same (orthogonal feature).
- **Squash/rebase recovery:** same (`find_similar_commit`).
- **Drift audit via MCP:** same — `run_audit` if available. The standard category set is enforced by `standard/audit-mcp.md` (Cat 9, 11 dropped from the returned findings).
- **Era creation prompt:** same (maintainer-only, orthogonal).

When MCP is unavailable: identical behavior using the file-based fallbacks. MCP is an accelerator, never a requirement.

---

For the canonical inventory of skill sub-files (including which files are profile-specific vs shared), see `SKILL.md` → Project Structure.
