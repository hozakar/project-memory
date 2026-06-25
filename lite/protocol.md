---
name: project-memory-protocol-lite
description: Lite-profile agent thinking protocol, reduced memory loading strategy (2 summaries instead of 5), instruction re-injection scope limited to Pre-Impl Gate Step 0.
---

# Agent Thinking Protocol (lite)

**At session start:**
- Is there an open phase? (any phase in `phases/index.yml` with `status != completed`)
- What commits have landed since the last recorded commit in the active phase?
- Is `summaries/roadmap.md` or `summaries/current-state.md` stale relative to recent git commits?

**Before committing:**
- If the work is non-trivial (anything beyond typo/formatting/import cleanup): update `phase.yml.commits` with the commit hash before the commit lands.
- If `plan.md` exists and the plan evolved during this work, update it incrementally.
- Trivial commits (typo, formatting): attach silently, no updates.
- This is the lite Pre-Commit Gate — commit boundaries are the natural checkpoint for recording what changed and why.

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

Lite drops the "3+ repeated failure → Anti-Patterns" rule and the "alternative path not taken" prompts. Both require denser summary infrastructure (`project-memory.md`) that lite does not maintain. If your project has enough cross-session learning to need these, upgrade to `full`.

---

# Session-start Ordering (lite)

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

   **Lite scope:** Re-injects only at Pre-Impl Gate (`gates/implementation.md` GATE 0), NOT at every gate. The session-start load gives you the body once; GATE 0 re-asserts before significant implementation.
5. **Assignment load** — load pending/ongoing/rejected assignments for the current user:
   - Pending/ongoing: `search_memory(type_filter="assignment", assigned_to_email="<run: git config user.email>")`
   - Rejected: `search_memory(type_filter="assignment", assigned_by_email="<run: git config user.email>")`
   - Emit passive single-line summaries per `conventions/records.md` (Assignment lifecycle — Session-start UX).
   - MCP unavailable fallback: scan `.project-memory/assignments/` ASSIGNMENT-*.md files, filter by frontmatter email fields.
6. **Era prompt** — same as full (orthogonal, maintainer-only).
7. **Header emission** — output `🧠 PROJECT MEMORY LOADED` (memory loaded indicator only).
8. **Post-First-Response Drift Audit** — deferred to after the LLM answers the user's first message. Run the drift audit (lite category set, raise_cat4: false) via `audit.md` (MCP fast path if available, otherwise file-based detection from `lite/audit-fs.md`). Emit the drift report as a follow-up block. Exceptions (audit runs synchronously): (a) explicit `Skill project-memory audit` or natural-language trigger per `DECISION-2026-06-17-audit-implicit-triggers`; (b) first user message is itself an audit trigger — run synchronously; (c) `minimal` profile — no audit, no deferral.

---

# Memory Loading Strategy (lite)

```
1. .project-memory/summaries/current-state.md
2. .project-memory/summaries/roadmap.md
3. .project-memory/phases/index.yml
4. Active phase directory (if open) — phase.yml (always); plan.md (if present)
5. User-scoped session items (current user — derived from git identity):
   - **Instructions (global):**
     - MCP available: `search_memory(query="instructions applies globally", type="instruction", top_k=10)` — filter `applies_globally: true`.
     - MCP unavailable: scan `.project-memory/instructions/` for `INSTRUCTION-*.md`; filter `applies_globally: true`.
   - Active instructions (EXECUTE — see Step 4 above)
   - Pending/ongoing assignments (EXECUTE — see Step 5 above)
   - Notification format etc. defined in conventions/records.md
6. .project-memory/decisions/index.md — Active section (primary input to Pre-Impl Gate Step 3)
7. .project-memory/discussions/index.md (active entries only)
8. Recent git commits (as needed)
```

**On context compaction:** Memory Loading Strategy is NOT re-run on compaction. Active instructions survive via Pre-Impl Gate Step 0 re-injection. The rest is best-effort.

**Lite-specific reductions vs full:**
- Reads 2 summaries (`current-state.md`, `roadmap.md`) instead of 5 — `project-memory.md`, `active-issues.md`, `architecture.md` are not present in lite scaffolding.
- No "rejected assignments" or "completed assignment notifications" loading — assignments are still loadable on demand, but the noisy session-start surface is trimmed.
- No "individual DECISION file pre-load on scope match" — the gate handles that lazily.

## Token Budget Guidelines (lite)

- 2 summary files instead of 5 — token cost is already low.
- `phases/index.yml` with 20+ phases: apply tag-aware filtering. Read up to 10 tag-matching phases. Fall back to most recent 10 when no tags can be derived.
- Active phase directory: always load in full (phase.yml + plan.md if present).
- Historical phase directories: load only on direct relevance.

## Staleness — two criteria in lite

| Criterion | Threshold | Purpose |
|---|---|---|
| Tier 3 contradiction detection | ≥ 30 days since closure | Offer the user an override path on old decisions |
| Token Budget Guidelines | ≥ 20 phases in `phases/index.yml` | Switch to tag-aware filtering at load time |

Lite does NOT use the era-back threshold (eras are an orthogonal maintainer feature). Discussion expiry is handled by Cat 11 audit — but Cat 11 is OFF in lite (see `lite/audit-fs.md`), so discussion expiry is on the user to manage manually when working under lite.

---

# Knowledge Preservation Rule (lite — relaxed)

Lite phases must leave enough context to answer:

- Why was this done? (one line in `phase.yml.summary`, or in `plan.md` if present)
- Which commits implemented it? (`phase.yml.commits`)
- What should happen next? (a row in `summaries/roadmap.md`)

Full's "what alternatives were rejected, what constraints existed, what tensions does this create or resolve" can still be captured via DECISION files when significant, but lite does not require them for every phase. If you find yourself frequently writing DECISIONs in a lite project, consider upgrading — lite is optimized for projects where the "why" is mostly self-evident from the code.

---

# MCP Companion Integration

See `mcp-integration.md` for the full tool catalog. MCP behavior in lite is mostly unchanged — MCP is an orthogonal accelerator. Key differences:

- **Availability check:** same. If `search_memory`, `index_phase`, `index_decision`, `index_instruction` are all present → MCP available.
- **Proactive DB sync:** same — call `check_consistency` and index any missing entries on session start.
- **Memory Loading Strategy overlay:**
   - **Hook A — between step 4 and step 5:** if the session has a stated task, call `search_memory(task_description, top_k=8)` for similarity ≥ 0.6 files. Does NOT set `include_superseded` — superseded decisions are excluded from awareness load. Same as full.
   - **Hook B — at Pre-Impl Gate Step 3:** same as full. Does NOT set `include_superseded` — superseded decisions excluded from gate awareness load.
   - **No Hook C** — the broad awareness load (Step 5 of full's gate) does not exist in lite.
- **Ad-hoc search rule:** same as full — call `search_memory` when the user asks about past decisions/phases/discussions. When the question is explicitly historical (researching superseded/past decisions), pass `include_superseded: true` to surface those records. Ordinary lookup queries do NOT set this flag. See DECISION-2026-06-19-search-memory-superseded-exclusion.
- **Constraint search rule** (Discussion Mode trigger): same as full — call `search_memory("engineering constraints and principles", scope_filter=["constraint"], type_filter="decision")` when discussion mode engages. Does NOT set `include_superseded` — only active constraints shape design direction.
- **Assignment search:** same as full (orthogonal feature).
- **Squash/rebase recovery:** same as full (`find_similar_commit`).
- **Drift audit via MCP:** same — `run_audit` if available. The lite category set is enforced by `lite/audit-mcp.md` (Cat 9, 11 dropped from the returned findings).
- **Era creation prompt:** same as full (maintainer-only, orthogonal).

When MCP is unavailable: identical lite behavior using the file-based fallbacks. MCP is an accelerator, never a requirement.

---

For the canonical inventory of skill sub-files (including which files are profile-specific vs shared), see `SKILL.md` → Project Structure.
