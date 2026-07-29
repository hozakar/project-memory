---
name: project-memory-protocol
description: Standard-profile agent thinking protocol, simplified memory loading strategy (2 summaries), instruction re-injection at Pre-Impl Gate GATE 0.
---

# Agent Thinking Protocol (standard)

**At session start:**
- Is `summaries/current-state.md` accurate?
- What commits have landed since last session?
- Is `summaries/roadmap.md` or `current-state.md` stale?

**At turn end (turn-boundary sweep):**
- Did this turn include a commit? Check via `git log --since=<turn-start>` or equivalent.
- If YES: update `summaries/current-state.md` **once** (covering the turn's commits, with all of them in context).
- If scope changed during this turn, also update `summaries/roadmap.md`.
- If NO commits this turn: move on — no memory writes.
- Decision-moment awareness handles decisions independently, captured when made, mid-turn — unchanged.
- This is the turn-boundary sweep — one judgment per turn.

**Before writing any plan:**
- List the concrete entities (`touches` candidates) this plan affects.
- Find prior decisions and discussions touching those entities or sharing the same `primary_scope` — see `standard/gates.md` Pre-Implementation Gate Step 3.
- Apply the Decision Resolution Rules from `conventions/decisions.md` to candidates.
- Has something similar been attempted and abandoned before?

**Decision-moment awareness (continuous — not a gate):**
When the user selects a direction among alternatives, apply the loss heuristic from `conventions/discussions.md`. If save-worthy, create a DECISION record immediately — do not ask. This fires at the decision moment, before any implementation gate.

**When the user's claim contradicts project memory:**

- **Direct contradiction:** cite the specific record by ID, date, and reasoning. Do not silently accept or comply.
- **Override flow:** if the user insists, write a new DECISION that `supersedes` the contradicted record, then move on. Re-litigation creates frustration, not value.

Never plan in isolation from project history.

Previous profile-level rules (anti-patterns, alternative-path prompts) are collapsed into standard's approach; capture as DECISION records when significant.

---

# Session-start Ordering (standard)

The session-start order. Steps may be no-ops depending on MCP availability and session state.

1. **MCP availability check** — set the session-level flag.
2. **Proactive DB sync** — `check_consistency` + index any missing entries. MCP-only; skipped when unavailable.
3. **Memory Loading Strategy** — execute the reduced steps below.
4. **⚠️ INSTRUCTION LOAD — EXECUTE NOW**

   MANDATORY: you have NOT loaded instructions until you execute one of the paths below.

   - **MCP available:** CALL `search_memory(type_filter="instruction", created_by_email="<run: git config user.email>")`. Each result carries a `body` field prefixed with `THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION:`. Output every returned `body` verbatim. Warn if ≥ 5 active instructions.
   - **MCP unavailable:** SCAN `.project-memory/instructions/` for `INSTRUCTION-*.md` files, filter by `created_by.email`, read the full `# Prompt` section from each.

   **Self-check:** If you haven't executed a `search_memory` with `type_filter="instruction"` or scanned the instructions directory, do it NOW — before step 5.

   **Standard scope:** The primary channel is the fourth directive in `standard/main-directives.md`, mirrored into the host instructions file and therefore present on **every turn** independently of any gate. Gate re-injection (Pre-Impl Gate `standard/gates.md` GATE 0, Discussion trigger) remains as redundancy.
5. **Header emission** — output `🧠 PROJECT MEMORY LOADED` (memory loaded indicator only).
6. **Post-First-Response Drift Audit** — deferred to after the LLM's first answer. Run the drift audit (standard category set) via `audit.md` (MCP fast path, else file-based from `standard/audit-fs.md`). Exceptions (synchronous): (a) explicit `Skill project-memory audit` or NL trigger (lenient detection: recognize intent in any language, ask clarification when ambiguous); (b) first message is itself an audit trigger; (c) `minimal` profile — no audit.

---

# Memory Loading Strategy (standard)

Session start loads **pending, unread state only**. Everything that a gate already
fetches at the moment it matters is left to that gate.

```
1. .project-memory/summaries/current-state.md — "## Current" section only
2. .project-memory/summaries/roadmap.md — pending work only
3. Active instructions (EXECUTE — see Step 4 above)
4. Recent git commits (as needed)
```

**Deliberately NOT loaded at session start:**

| Not loaded | Why | Who loads it instead |
|---|---|---|
| `decisions/index.md` | Pre-Impl Gate Step 2 already re-reads it from the filesystem on every significant implementation, unconditionally, to surface `Global: Yes` rows. Loading it here duplicates that read for sessions that implement, and wastes it entirely for sessions that don't. | Pre-Implementation Gate (`standard/gates.md` Step 2) |
| `discussions/index.md` | The same gate already issues `search_memory(type_filter="discussion")`. | Pre-Implementation Gate (`standard/gates.md` Step 2) |
| `current-state.md` archive tail | Only the `## Current` section describes present state; the dated archive below it is historical. | Read on demand when history is asked for |
| Completed roadmap items | They live in the roadmap archive, not in `roadmap.md`. | Read on demand |

**Global instructions** stay eager — an instruction is binding from the first turn by
definition, and `applies_globally` records bind regardless of what the session turns out
to be about, so no lazy trigger can be relied on to fetch them in time:
- MCP available: `search_memory(query="instructions applies globally", type_filter="instruction", top_k=10)` — filter `applies_globally: true`.
- MCP unavailable: scan `.project-memory/instructions/` for `INSTRUCTION-*.md`; filter `applies_globally: true`.

**On context compaction:** The Memory Loading Strategy is not re-run. Only the host instructions file survives — that's why directives are mirrored there from `standard/main-directives.md`. Those directives re-trigger the gates, which re-inject active instructions via GATE 0. Everything beyond the mirrored directives is best-effort; knowing which gates exist depends on `standard/gates.md`, evicted at compaction.

**Standard reductions vs legacy profiles:** Standard reads the pending head of 2 summaries (not 5 whole files), no individual DECISION/DISCUSSION pre-load, and no index pre-load — the Pre-Implementation Gate fetches decisions and discussions when they are actually needed.

## Token Budget Guidelines (standard)

Same as Memory Loading Strategy: the pending head of 2 summaries plus active instructions at session start; indexes and individual files on demand.

## Staleness — standard

| Criterion | Threshold | Purpose |
|---|---|---|
| Tier 3 contradiction detection | ≥ 30 days since closure | Offer the user an override path on old decisions |

---

# Knowledge Preservation Rule (standard — relaxed)

Every DECISION and significant change must leave enough context to answer:

- Why was this done? (captured in the DECISION record or `summaries/current-state.md`)
- Which commits implemented it? (referenced in the DECISION record or commit message)
- What should happen next? (a row in `summaries/roadmap.md`)

Standard's relaxed approach omits the explicit alternative/constraint/tension prompts but still encourages capturing them via DECISION files when significant.

---

# MCP Companion Integration

MCP behavior is unchanged from the previous profile behavior. See `mcp-integration.md` for the full tool catalog. Availability check, proactive DB sync, memory loading hooks, ad-hoc search, constraint search, squash/rebase recovery, and drift audit via MCP all work identically. When MCP is unavailable, identical behavior using file-based fallbacks.

---

For the canonical inventory of skill sub-files (including which files are profile-specific vs shared), see `SKILL.md` → Project Structure.
