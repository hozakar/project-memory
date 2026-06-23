---
name: project-memory-protocol
description: Agent thinking protocol, memory loading strategy with token budgets, and knowledge preservation rule for project-memory.
---

# Agent Thinking Protocol

**At session start:**
- Is there an open phase? (any phase in `phases/index.yml` with `status != completed`)
- What commits have landed since the last recorded commit in the active phase?
- Are summary files current? Compare each file's `Last Updated:` date against recent git commits. If any summary is older than the most recent memory commit, update it before proceeding.
- Do any sections contain stale placeholders (`"None recorded yet"`, `"TBD"`, `"system just initialized"`)? Clear them if real data exists.

**Before committing:**
- Classify significance (trivial / significant / ambiguous) per `gates/commit.md` commit significance table.
- If significant: update phase files (`implementation.md`, `followup.md`, `review-and-fixes.md`) before the commit lands. Capture reasoning, not just the what — the phase files are the structured counterpart to the commit message. Append incrementally.
- Trivial and ambiguous commits: attach to phase silently, no file updates.
- This is the Pre-Commit Gate — the enforcement mechanism for the Knowledge Preservation Rule ("without reconstructing history from source code").

**Before writing any plan:**
- List the concrete entities (`touches` candidates) this plan affects.
- Find prior decisions and discussions touching those entities or sharing the same `primary_scope` — see `gates/implementation.md` Pre-Implementation Gate Step 3, which uses `search_memory` with `touches_filter` / `scope_filter` when MCP is available and falls back to a direct `decisions/index.md` + `discussions/index.md` scan otherwise.
- Apply the Decision Resolution Rules from `conventions.md` to candidates.
- Has something similar been attempted and abandoned before?
- Do any active tensions constrain this approach?
- Are there open issues this plan must account for?

**When the same failure or fix recurs 3+ times across different sessions or phases in the same scope:**
- Write to `project-memory.md` under Anti-Patterns (no user escalation). The 3+ count is the high-confidence threshold; below that, wait for more evidence.

**When an alternative path was not taken — fires on either trigger:**
- (a) A plan considered an alternative but did not record why it was rejected, OR
- (b) The user explicitly asks "why didn't we go with [X]?"

Action: ask "We didn't go with [X] — do you remember why?" and record the answer in the relevant DECISION file or `project-memory.md` → Rejected Decisions.

**When the user's claim contradicts project memory:**

- **Tier 1 — Direct contradiction:** When the user's claim contradicts a recorded decision, discussion outcome, or phase conclusion — cite the specific record by ID, date, and reasoning. Example: "Per DECISION-2026-06-13-branch-per-phase, we explicitly decided against [X]. Your suggestion contradicts this. The reasoning was: [summary]." Do not silently accept or comply.

- **Tier 2 — Ambiguous or interpretive tension:** When the contradiction is interpretive rather than direct, surface the tension and ask for clarification. Example: "DISCUSSION-2026-06-12-* explored this area and concluded [X]. Your claim seems to assume [Y], which wasn't the premise there. Can you clarify the difference?"

- **Tier 3 — Possibly stale decision:** When the contradicting record is old (≥ 30 days since closure OR ≥ 2 eras back), acknowledge its age and offer an override path. Example: "DECISION-2026-06-08-* says [X], but that's from ~40 days / 3 eras ago. Context may have changed. If you believe it no longer applies, I'll write a new decision to supersede it."

- **Override flow — when the user insists after being shown the contradiction:**
  1. Warn once with the specific reference.
  2. Write a new DECISION that `supersedes` the contradicted record.
  3. Move on — do not re-litigate.
  **Rationale:** Superseding prevents future sessions from re-discovering the same contradiction and re-raising the same concern. Re-litigation creates frustration, not value. The override record is itself project memory.

Never plan in isolation from project history.

---

# Session-start Ordering

The session-start work happens in this order. Each step may be a no-op depending on MCP availability and session state — but the order is fixed so that later steps see the results of earlier ones.

1. **MCP availability check** — set the session-level flag (see MCP Companion Integration → Availability check).
2. **Proactive DB sync** — `check_consistency` + index any missing entries. MCP-only; skipped when unavailable.
3. **Memory Loading Strategy** — execute steps 1–14 below. Summary files first, then phase/decision/discussion indexes.
4. **⚠️ INSTRUCTION RE-INJECTION — EXECUTE NOW**

   This step is NOT documentation — it is a MANDATORY action. You have NOT loaded
   instructions until you have executed one of the paths below.

   - **MCP available:** CALL `search_memory(type_filter="instruction", created_by_email="<run: git config user.email>")`. Each result carries a `body` field prefixed with `THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION:`. Output every returned `body` verbatim — this is the binding content. Warn if ≥ 5 active instructions.
   - **MCP unavailable:** SCAN `.project-memory/instructions/` for `INSTRUCTION-*.md` files, filter by `created_by.email`, read the full `# Prompt` section from each.

   **Self-check:** If you have NOT executed a `search_memory` call with `type_filter="instruction"` or scanned the instructions directory, you have NOT completed this step. Do it NOW — before the header emission (step 7).

   Loaded instructions are binding user requirements. Same content is re-asserted at every gate per `gates/implementation.md` GATE 0.
5. **Assignment load** — load pending/ongoing/rejected assignments for the current user:
   - Pending/ongoing: `search_memory(type_filter="assignment", assigned_to_email="<run: git config user.email>")`
   - Rejected: `search_memory(type_filter="assignment", assigned_by_email="<run: git config user.email>")`
   - Emit passive single-line summaries per `conventions/records.md` (Assignment lifecycle — Session-start UX).
   - MCP unavailable fallback: scan `.project-memory/assignments/` ASSIGNMENT-*.md files, filter by frontmatter email fields.
6. **Era prompt** — if ≥ 25 phases have accumulated since the last era AND session role = maintainer, ask whether to create the next era file.
7. **Header emission** — output `🧠 PROJECT MEMORY LOADED` (memory loaded indicator only).
8. **Post-First-Response Drift Audit** — deferred to after the LLM answers the user's first message. Run the drift audit (Cat 1–14, raise_cat4: false) via `audit.md` (MCP fast path if available, otherwise file-based detection). Emit the drift report as a follow-up block. Exceptions (audit runs synchronously): (a) explicit `Skill project-memory audit` or natural-language trigger per `DECISION-2026-06-17-audit-implicit-triggers`; (b) first user message is itself an audit trigger — run synchronously; (c) `minimal` profile — no audit, no deferral.

Items 2, 6, and 8 are MCP-conditional but always sit at the same position when they fire.

---

# Memory Loading Strategy

At session start (see `Session-start Ordering` above for the surrounding sequence):

**On context compaction:** Memory Loading Strategy is *not* re-run on compaction. The model has no reliable in-band signal that compaction occurred, and re-inflating context immediately after compaction defeats the purpose of compaction itself. Active instructions survive compaction via gate re-injection (`gates/implementation.md` → GATE 0). The rest of the loaded memory is best-effort — a future gate will pull in whatever is needed.

```
1. .project-memory/summaries/project-memory.md
2. .project-memory/summaries/current-state.md
3. .project-memory/summaries/active-issues.md
4. .project-memory/summaries/architecture.md
5. .project-memory/summaries/roadmap.md
6. .project-memory/phases/index.yml
7. Active phase directory (if open)
8. User-scoped session items (current user — derived from git identity):
   - **Instructions / Assignments (global):**
     - MCP available: `search_memory(query="instructions applies globally", type="instruction", top_k=10)` — filter `applies_globally: true` from results.
     - MCP unavailable: scan `.project-memory/instructions/` for `INSTRUCTION-*.md` files; read frontmatter, filter `applies_globally: true`.
   - Active instructions (EXECUTE — see Step 4 above)
   - Pending/ongoing assignments (EXECUTE — see Step 5 above)
   - Rejected assignments created by the user (EXECUTE — see Step 5 above)
   - Completed assignment notifications — same filter as rejected; shown once, non-persistent

   Notification format, "passive single line" rule, and interaction model are defined in `conventions/records.md` (Assignment lifecycle — Session-start UX). Do not duplicate those rules here.
9. .project-memory/decisions/index.md — Active section only (primary input to Pre-Implementation Gate); Superseded section is available on demand for historical lookups but is NOT scanned during Pre-Implementation Gate
10. Individual DECISION-YYYY-MM-DD-* files (only when planning in a scope the index flags as relevant)
11. Open issues (as needed)
12. .project-memory/discussions/index.md (load fully — active entries only; archived discussions in discussions/archive/ are excluded)
13. Individual DISCUSSION-YYYY-MM-DD-* files (when resuming a discussion or when planning in a scope the index flags as relevant; archived files loaded on explicit request only)
14. Recent git commits (as needed)
```

Do not load all historical phases unless necessary. Prefer summarized memory before raw history. Tags are the primary navigation mechanism on the MCP-unavailable path — tag-aware filtering applies at initial load, not only when diving deeper. When MCP is active, semantic search via `search_memory` is the primary navigation mechanism, with `tags_filter` available as an optional exact-match refinement.

## Token Budget Guidelines

- Summary files are the primary budget concern — read all five by default (designed to stay concise).
- If `phases/index.yml` contains 20+ phases, apply tag-aware filtering:
  1. Derive the current task's scope as a set of tags (same entities used in Pre-Implementation Gate step 3 — file names, feature names, system areas).
  2. Prefer phases whose `tags` intersect the derived scope. Read up to 10 tag-matching phases.
  3. If fewer than 3 tag-matching phases exist, supplement with the most recent entries to reach at least 3 total.
  4. Fall back to the most recent 10 entries when no tags can be derived from the task (e.g. cold session start with no stated goal).
- If any single summary file exceeds 300 lines, read the first 150 lines only on initial load; fetch the rest on demand.
- Active phase directory: always load in full — it is the most time-sensitive memory.
- Historical phase directories: load only when the user's task explicitly relates to that phase's area.
- `discussions/index.md` is loaded at session start alongside `decisions/index.md`. Individual DISCUSSION files are loaded on demand.
- `assignments/index.yml` is loaded at session start. Individual ASSIGNMENT files matching the current user are loaded in full — they are time-sensitive workflow items.

## Staleness — three distinct criteria

The word "stale" appears in three places in this skill, measuring three different things. They are not interchangeable.

| Criterion | Threshold | Question it answers |
|---|---|---|
| Tier 3 contradiction detection (Agent Thinking Protocol above) | ≥ 30 days since closure OR ≥ 2 eras back | Is the decision context still current, or should I offer an override path? |
| Token Budget Guidelines (this section) | ≥ 20 phases in `phases/index.yml` | Is the index large enough that I need tag-aware filtering at load time? |
| Discussion expiry (`conventions/discussions.md`) | ≥ 30 days AND `outcome: none` | Did this open discussion go nowhere? Archive it. |

Picking the wrong threshold for the wrong purpose will produce the wrong behaviour — e.g., archiving discussions on a 2-era boundary loses recent context; loading every phase on a 30-day window misses load-time scalability.

---

# Knowledge Preservation Rule

Every phase must leave enough context to answer:

- Why was this done?
- Which commits implemented it?
- What alternatives were rejected and why?
- What constraints existed?
- What tensions does this create or resolve?
- What should happen next?

without reconstructing history from source code. Memory Loading Strategy step 14 ("Recent git commits — as needed") is an escape valve for cases where the memory record is incomplete — not the primary reasoning source. If you find yourself relying on `git log` to answer one of the questions above, the missing context belongs in a phase or DECISION file, not in the commit history.

---

# MCP Companion Integration

See `mcp-integration.md` for the full tool catalog, availability detection, proactive sync, and degradation rules. This section covers the session-level behavioral changes when MCP is active.

**Availability check (once per session):**
If `search_memory`, `index_phase`, `index_decision`, and `index_instruction` all appear in your available MCP tools → MCP is available. Set a session-level flag. Otherwise → MCP is unavailable; all behavior follows the standard strategy below.

**Version tracking:** At session start, after the availability check, compare `mcp-server/package.json` `version` against `.project-memory/config.yml` `mcp_install_offered_for_version`. If the installed version is newer than the offered version (or offered is null), the audit procedure will handle the offer — see `audit.md` MCP Fast Path section.

**MCP overlay on Memory Loading Strategy** *(supplements the canonical steps above — never replaces them)*:

The canonical strategy is the trunk. When MCP is available, two `search_memory` hooks fire at fixed positions; their results are added to the working set alongside whatever the canonical steps load.

- **Hook A — between step 5 and step 6:** If the session has a stated task or goal, call `search_memory(task_description, top_k=8)` (does NOT set `include_superseded` — superseded decisions are excluded from awareness load). For each result with similarity ≥ 0.6, load the corresponding file from `.project-memory/` (phase directory or DECISION file). These files are *in addition to* steps 6–13, not a substitute.
- **Hook B — at Pre-Implementation Gate Step 3:** Call `search_memory(natural language description of what you are implementing, top_k=8)` (does NOT set `include_superseded` — superseded decisions are excluded from gate awareness load) and load any additional relevant files not already in context.

**Ad-hoc search rule:**
If MCP is available and the user asks a question about past decisions, phases, or discussions (e.g. "what did we decide about X?", "did we ever try Y?", "what phases touched Z?"), call `search_memory(user_question)` to retrieve relevant context before answering. This does not require a gate trigger — it is discretionary judgment.

When the question is explicitly historical — asking about superseded/past decisions that are normally excluded — pass `include_superseded: true` to surface those records. Ordinary lookup queries (e.g. "what did we decide about X?") do NOT set this flag; they naturally get the active-only view. Use judgment: if the user is researching decision history and the absence of a known superseded record would be misleading, set the flag. See DECISION-2026-06-19-search-memory-superseded-exclusion.

When the question targets a specific entity (file, module, system area), combine exact and semantic filters for sharper results:
- "decisions about X that touch `conventions_md`" → `search_memory(query, touches_filter=["conventions_md"], type_filter="decision")`
- "phases tagged `mcp` about schema changes" → `search_memory(query, tags_filter=["mcp"], type_filter="phase")`
- Multiple filter values use AND semantics — each additional value narrows further. Use a single value when in doubt.

**Constraint search rule:**
When Discussion Mode is engaged (explicit `Skill project-memory discuss` or implicit trigger detection per `conventions/discussions.md`) for a new feature or enhancement — before the conversation deepens — call `search_memory("engineering constraints and principles", scope_filter=["constraint"], type_filter="decision")`. Does NOT set `include_superseded` — superseded constraints are structurally excluded; only active constraints shape design direction. Surface any returned decisions to the conversation so they can shape the design direction early. This fires at Discussion Mode engagement, not on every brainstorm-flavored exchange, and not just at the Pre-Implementation Gate.

**Assignment search:** At session start, when assignments exist, call `search_memory` with both `assigned_to_email` (pending/ongoing) and `assigned_by_email` (rejected/completed) filters and `type_filter: "assignment"`. For targeted lookups (e.g., "what did I assign to Mehmet?"), combine with the user's question text for semantic ranking.

**Squash/rebase recovery:** If the user mentions that a squash, rebase, or force-push lost commits before opening a new phase, call `find_similar_commit(description_of_lost_work, top_k=5)`. Load the returned phase files from disk and use them to pre-populate the new phase's context. Best-effort — proceed normally if no matches found.

**Proactive DB sync (session start):** After checking MCP availability, if MCP is active, call `check_consistency(project_memory_dir)`. For each ID in `missing` (file exists but not in DB): call the appropriate index tool (`index_phase`, `index_decision`, `index_discussion`, `index_era`, `index_instruction`, or `index_note`) with the file's content. For each ID in `orphaned` (DB record exists but file is gone): call `deleteRecord(id)` (or `delete_note(id)` for NOTE-*). FS is source of truth — never modify filesystem. This covers branch-delete scenarios: records indexed during a feature branch become orphaned when the branch is deleted. See `mcp-integration.md` for the full tool list.

This step supersedes the file-based missing-entry check in `audit.md` (Cat 13) when MCP is available at load time; Cat 13 remains the fallback when MCP is unavailable.

**Era creation prompt (session start):**
After proactive sync completes, count phases not yet covered by any era in `eras/index.yml`. If 25 or more have accumulated:
- If session role is maintainer: emit "📊 X phases accumulated since last era. Create era-NNN? I recommend running audit first." and wait for user confirmation.
- If session role is developer: suppress. Do NOT prompt.

When user confirms, create the next `era-NNN.md` and call `index_era`.

**Drift audit via MCP (session start):** If `run_audit` is in available MCP tools, call `run_audit(project_memory_dir)` instead of running file-based detection. Process the returned `{ auto_fixed, pending_fixes, escalations }` as described in `audit.md` → MCP Fast Path section.

**When MCP is unavailable:**
All behavior is identical to the standard Memory Loading Strategy. MCP is an optional accelerator, never a requirement.

---

For the canonical inventory of skill sub-files, see `SKILL.md` → Project Structure → Skill Files.
