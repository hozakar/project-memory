---
name: project-memory-cheatsheet-lite
description: Lite-profile quick reference and event-based triggers. Reflects the reduced lite gate, audit, and summary set.
---

> **Profile:** `lite` — This cheatsheet covers lite-ceremony behavior. For tier differences and full/minimal alternatives, see `profiles.md`.

# Quick Reference Cheatsheet (lite)

**About to commit?**
```
Trivial (typo, formatting, import cleanup, single-line bugfix)
  → open phase exists? attach silently : skip entirely

Everything else (feature, bugfix, refactor, schema change, dep upgrade, test, doc)
  → open phase exists? update phase.yml.commits
  → no open phase? CREATE PHASE FIRST, then commit
```

Lite does not split "significant" vs "ambiguous". Anything non-trivial is just "everything else" and runs Pre-Impl Gate Step 3.

**About to open a phase?**
→ Minimum required: `phase.yml` + `phases/index.yml` entry. `plan.md` is optional.

**About to close a phase?**
→ Sanity check `phase.yml.commits` non-empty + `phase.yml.summary` filled + scan `plan.md` for unchecked TODOs (warn only).
→ Set `status: completed`, `closed_at: today` (or `merge_commit` if branch merged).
→ NO impl/review/followup file verification — those don't exist in lite.

**Topic shifted mid-session?**
→ Lite does not auto-detect this. Open a new phase manually when you start the new topic, or accept that the current phase scopes both.

**Work cancelled / superseded?**
→ Set `status: abandoned` in `phase.yml`, add `abandoned_reason`.

**About to implement something non-trivial?**
→ Step 0: instruction re-inject (lite re-injects here only, not at every gate).
→ Step 1: phase open? If not, create it (yml + optional plan).
→ Step 2: trivial vs everything-else.
→ Step 3: scan `decisions/index.md` (and `discussions/index.md` if discussions feature is used) for `touches` overlap or `scope` match; batch directional conflicts into one `AskUserQuestion`.
→ Step 4: if architectural move with no candidate, offer to record a DECISION.
→ NO Step 5 (broad awareness load) — that's a full-only feature.

**About to route work to a teammate?**
→ Same as full. Assignments are orthogonal to profile.
→ `assignments/` directory is created on first use.

**About to close a discussion?**
→ Same as full. Discussions are orthogonal to profile.
→ `discussions/` directory is created on first close (lite doesn't pre-scaffold it).

---

# Event-Based Triggers (lite)

| Event | Action required now |
|---|---|
| User requests significant implementation | Create phase BEFORE starting any work (lite shape: `phase.yml` + optional `plan.md`) |
| `submit_implementation` about to be called | Phase must exist — create before the call |
| DECISION-* file created | Add row to `decisions/index.md`. ADR mirror NOT created (lite default `adr_enabled: false`). |
| Decision superseded | Update superseded DECISION frontmatter; move row to Superseded section of `decisions/index.md`. |
| New feature or component shipped | Update `current-state.md` → What Exists. |
| Technical debt introduced | Update `current-state.md` → Known Debt / Risks. |
| Architecture module added or changed | No dedicated `architecture.md` in lite. Note significant changes in `current-state.md` or write a DECISION. |
| Issue opened | Add to `issues/open/` (create dir on first use). Update `current-state.md → Known Debt / Risks` line if relevant. NO `active-issues.md` rollup in lite. |
| Issue closed | Move file to `issues/closed/`, update frontmatter. |
| Stub placeholder found in `roadmap.md` or `current-state.md` | Replace immediately. |
| Status-changing write on phase / decision / discussion / issue | Lite does NOT track `contributors`. Skip this step. |
| Discussion concluded | Write `DISCUSSION-*.md` to `discussions/` (create dir on first use); add row to `discussions/index.md`. If MCP: call `index_discussion`. |
| Discussion resumed | Same as full — load existing file, update at close. |
| Discussion triggers a phase | Set `outcome.type: phase`, `outcome.id: <phase-id>` in DISCUSSION file. |
| Phase opened | If MCP available, call `index_phase` with empty `implementationText` (lite has no impl.md). |
| Phase closed | If MCP available, call `index_phase` with `status: completed`, planText if present, empty implementationText, commitDiffs. |
| User asks about past phases/decisions/discussions (MCP available) | `search_memory` per `mcp-integration.md`. `search_memory` now accepts `include_superseded?: boolean` — opt-in flag for historical lookup (default false excludes superseded decisions). Pass `include_superseded: true` only when explicitly researching past/superseded decisions. `SearchResult` carries `status` for decision records. |
| Drift audit (post-first-response) — `run_audit` available | Default: deferred to post-first-response. Call `run_audit(project_memory_dir, { profile: "lite", raise_cat4: false })`. MCP server filters Cat 9/11 internally; apply pending_fixes; triage escalations. Sync exceptions: explicit `Skill project-memory audit`, first-user-message is audit-implicit-trigger, or `minimal` profile (no audit). |
| Drift audit (post-first-response) — `run_audit` NOT available | Default: deferred to post-first-response. Run lite file-based detection (12 active categories, raise_cat4: false). Sync exceptions same as above. |
| User mentions lost commits after squash/rebase | `find_similar_commit` per `mcp-integration.md`. |
| ~10 phases accumulated since last era | Maintainer-only prompt. Rare in lite. |
| Assignment created / status changed | Same as full. Update `assignments/index.yml`, re-call `index_assignment` if MCP. |
| Session start — pending/rejected/completed assignment notifications | Same as full. |
| User says "switch project-memory to &lt;profile&gt;" | SKILL.md → change-profile flow: append `profile_history` entry, switch active `profile`, handle minimal ↔ structured shape transitions per `profiles.md` → Migration mechanism. |

**Stub placeholders to clear on sight:** `"None recorded yet"`, `"TBD"`, `"system just initialized"`, `"first run detected"`, or any `*(none)*` in a section that now has content.

**Lite reminders (often forgotten):**
- `phase.yml.summary` MUST be filled before close — a one or two sentence "what was done, why" line.
- Roadmap items go into `roadmap.md` as you discover them, not at phase close.
- If you keep wanting `implementation.md` or `review-and-fixes.md`, consider upgrading to `full`. Lite is a deliberate compromise; outgrowing it is normal.
