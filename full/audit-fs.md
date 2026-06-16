---
name: project-memory-audit-fs
description: File-system drift audit detection procedure. Called by audit.md dispatcher when run_audit MCP tool is NOT available. Contains the 14-category detection table, auto-fix rules, and edge cases.
---

# Detection Procedure

Run all 14 categories on every audit pass. Collect findings before acting. Check `audit_ignore` (see `audit.md` → Permanent Skip) before escalating any finding — suppressed findings are omitted entirely.

| # | Category | Detection Rule | Tool Calls | Classification | Severity |
|---|---|---|---|---|---|---|---|
| 1 | **Commit orphans** | Run `git log --format='%h %ae %aI %s' -30`. For each commit hash, check `phases/index.yml` for a match in any `commits:` list or as a `merge_commit`. Apply trivial-commit regex (see Edge Cases). Auto-assigns same-user commits to phases by file matching. Ambiguous commits logged as info. Aged (>3d) and non-current-user commits skipped. All filters removed on explicit `audit` invocation. | `Bash: git log -30`; `Read: phases/index.yml` | **Auto-fix** | — |
| 2 | **Summary staleness** | Run `git log -1 --format=%cs` to get the date of the most recent project commit. For each file in `summaries/*.md`, parse the `Last Updated:` field. If the summary date is older than the project commit date, it is stale. If a summary file has no `Last Updated:` field, treat as a separate finding (see Edge Cases). Always auto-bumps Last Updated date to today. | `Bash: git log -1 --format=%cs`; `Read` each `summaries/*.md` file | **Auto-fix** | — |
| 3 | **Stub placeholders** | Grep all `summaries/*.md` for: `None recorded yet`, `TBD`, `system just initialized`, `first run detected`. Record the file path and which section header the match falls under. No age computation — always auto-fix. | `Grep` over `.project-memory/summaries/*.md` | **Auto-fix** | **low** |
| 4 | **Open-phase commit gap** | In `phases/index.yml`, find every phase with `status` equal to `planning`, `implementation`, or `review`. For each: identify branch (if null, try `main`, `master`, `staging`; if none exist, skip). Get commits already in `commits[]`. Run `git log --oneline --max-count=200 --after=<started_at - 1 day> <branch>` and find commits on branch not in the phase's list. Same-user heuristic: auto-assigns commits to current or next phase by file overlap scoring. Escalates only when author != current user or file matching is ambiguous. Age: timestamp of the earliest untracked commit. | `Read: .project-memory/phases/index.yml`; `Bash: git log --oneline --max-count=200 --after=<started_at - 1 day> <branch>` | **Escalate** | **high** |
| 5 | **Misplaced issue files** | List all files in `issues/open/`. For each, read its frontmatter `status:` field. If `status: closed`, the file is misplaced. | `Glob: .project-memory/issues/open/*.md`; `Read` frontmatter | **Auto-fix** | — |
| 6 | **Decision index drift** | List all `DECISION-*.md` files in `.project-memory/decisions/`. Read each file's frontmatter `id` and `status`. Read `decisions/index.md` and parse rows. Compute: (a) missing index row; (b) orphan index row; (c) status mismatch. Missing rows → pendingFix with decision data for LLM Claim generation. Orphan rows → auto-removed. Status mismatches → auto-resolved (file is source of truth). | `Glob: .project-memory/decisions/DECISION-*.md`; `Read` frontmatter; `Read: decisions/index.md` | **Auto-fix** | — |
| 7 | **Orphan commit references** | Collect all hashes from every phase's `commits:` and `merge_commit` (skip null and already-annotated with `[orphaned`). Batch-check via `git cat-file --batch-check`. Any hash returning `missing` is orphaned. | `Read: .project-memory/phases/index.yml`; `Bash: echo "<hashes>" | git cat-file --batch-check` | **Auto-fix** | — |
| 8 | **ADR sync drift** | Read `.project-memory/config.yml`. If `adr_enabled: false` → skip Cat 8 entirely. If `adr_enabled` absent → treat as `true` (backward compat). If `adr_enabled: true` but `adr_dir` absent → skip. For each `DECISION-*.md`: (a) check `adr_id` — if null/missing, flag; (b) glob `<adr_dir>/<adr_id>-*.md` — if no match, flag. ADR files are created once and then owned by the user — do not check or sync their content after creation. Missing adr_id → auto-assigns next number. Missing ADR file → pendingFix with decision content for LLM generation. **When `adr_enabled` flips from false to true on an existing project:** Cat 8 runs normally on first pass — all pre-existing DECISIONs without `adr/` counterparts are flagged and auto-fixed as stubs. Emit: `Cat 8 catch-up: created N adr/ stub(s) for pre-existing decisions`. | `Read: .project-memory/config.yml`; `Glob/Read: decisions/DECISION-*.md`; `Glob: <adr_dir>/<adr_id>-*.md` | **Auto-fix** | — |
| 9 | **Discussion index drift** | List all `DISCUSSION-*.md` files in `.project-memory/discussions/` (not `discussions/archive/`). Read each file's frontmatter `id` and `status`. Read `discussions/index.md` and parse rows. Compute: (a) missing index row — file ID not in any index row; (b) orphan index row — index row ID has no file; (c) status mismatch — file `status` ≠ index `Status` cell. | `Glob: .project-memory/discussions/DISCUSSION-*.md`; `Read` frontmatter of each; `Read: discussions/index.md` | **Auto-fix** | **low** |
| 10 | **Completed phase file completeness** | For each phase in `index.yml` with `status: completed`, verify these 5 files exist in the phase directory: `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`. Report each missing file as a separate finding. Auto-creates stub files (`*(none)*`) for missing phase documents. | `Read: phases/index.yml`; `Glob: phases/<id>/*.md` for each completed phase | **Auto-fix** | — |
| 11 | **Discussion expiry** | For each `DISCUSSION-*.md` in `discussions/` (not `discussions/archive/`): read frontmatter `outcome.type` and `date`. If `outcome.type == none` AND `today - date > 30 days` → expired. Handles both nested format (`outcome:\n  type: none`) and flat format (`outcome: none`). | `Glob: discussions/DISCUSSION-*.md`; `Read` frontmatter of each | **Auto-fix** | — |
| 12 | **Tag inconsistency** | Read all phase tags from `phases/index.yml`. Collect all unique tags. Skip if fewer than 5 unique tags total. For each tag (length ≥ 4): compute Levenshtein distance against every other unique tag (length ≥ 4, length diff ≤ 3). If the closest match has distance 1 or 2, flag the pair. Report the best (lowest-distance) match per tag only. | `Read: phases/index.yml` | **Auto-fix** | **low** |
| 13 | **MCP consistency** | If `check_consistency` is NOT in available tools, skip entirely. Otherwise: call `check_consistency(path_to_dot_project_memory_dir)` where the path is the absolute path to the `.project-memory/` directory in the current project. For each ID in `missing` (file exists, not in DB): if ID starts with `phase-`, read that phase's `phase.yml` + `plan.md` + `implementation.md` and call `index_phase`; if ID starts with `DECISION-`, read the DECISION file and call `index_decision`. For each ID in `orphaned`: no action (will be cleaned on next upsert cycle). **Note:** Cat 13 runs when MCP was unavailable at session start. If proactive sync (see `protocol.md` → MCP Companion Integration) already ran this session, Cat 13 will find no missing entries and can be skipped. Cat 13 is a fallback, not a duplicate. | MCP: `check_consistency`; `Read` phase/decision files for missing IDs; MCP: `index_phase`/`index_decision` | **Auto-fix** | — |
| 14 | **Assignment integrity** | Scan all `ASSIGNMENT-*.md` files in `.project-memory/assignments/`. **(14a)** For each with `type: direct` and `status != completed`, verify `target_id` references an existing file in `issues/`, `phases/`, `discussions/`, or `decisions/`. Missing target → finding. **(14b)** For each with `status: pending` and `assigned_at` > 30 days ago → finding. **(14c)** For each with `status: completed` where `completion_note`, `completed_phase_id`, `completed_decision_id`, and `completed_discussion_id` are ALL null/empty → finding. | `Glob: .project-memory/assignments/ASSIGNMENT-*.md`; `Read` frontmatter of each | **Auto-fix** | **low** (14b,14c) / **medium** (14a) |

---

Cat 4 auto-assignment heuristic:
1. For each missing commit: check author == git config user.email
   → Different author: escalate to user
   → Same author: continue
2. Find the chronologically NEXT phase (started_at > commit date)
   → No next phase: auto-assign to current phase
   → Next phase exists: compare commit files against current and next phase file sets
     → Higher overlap score wins → auto-assign
     → Equal scores or no overlap → escalate to user

---

# Auto-Fix Rules

All 14 categories are auto-fixed per the simplified severity model. Cat 4 uses a heuristic that auto-resolves same-user commits and escalates only on author mismatch or ambiguous file matching.

**Category 1 auto-fix steps (explicit audit):**
1. For each orphan commit by the current user:
   a. Get files touched: git diff-tree --no-commit-id --name-only -r <hash>
   b. Match against phase directory paths. If exactly one phase matches, auto-assign.
   c. Return as pendingFix: { type: "assign_commit", phaseId, commitHash, files }
2. Log: "Auto-assigned N commit(s) to phase(s)"
3. Ambiguous commits (multiple matches or none): log as info, do not escalate.

**Category 2 auto-fix steps:**
1. For each stale summary file:
   a. Bump Last Updated date to today.
2. Log: "Bumped N stale summary Last Updated date(s) to today"

**Category 3 auto-fix steps:**
1. For each summary file containing `None recorded yet`, `TBD`, `system just initialized`, or `first run detected`:
   a. Replace each match with `*(none)*` (the canonical empty-section marker).
   b. Skip matches that are already `*(none)*`.
2. Log: `Replaced N stub placeholder(s) in summaries/ → *(none)*`

**Category 5 auto-fix steps:**
1. For each `issues/open/*.md` file with frontmatter `status: closed`:
   a. Move the file to `issues/closed/` (same filename).
   b. Open `summaries/active-issues.md` and remove or update the entry for that issue.
2. Log: `Auto-fixed: moved <filename> to closed/`

**Category 6 auto-fix steps:**
1. Missing row: Return pendingFix with decision data; LLM generates Claim and inserts row.
2. Orphan row: Remove row from index.
3. Status mismatch: Return pendingFix; LLM updates index (file is source of truth).
4. Log: "Synced N decision index drift(s)"

**Category 7 auto-fix steps:**
1. For each orphan hash:
   a. In `phases/index.yml`, replace the bare hash with `<hash> [orphaned YYYY-MM-DD]` (today's date). Apply to both `commits:` and `merge_commit`.
   b. In the phase's `phase.yml`, apply the same annotation.
2. Log: `Auto-annotated: N orphan commit reference(s) across M phase(s) → marked [orphaned YYYY-MM-DD] in phase.yml and index.yml`
3. If `N > 0`, add or update an entry in `summaries/project-memory.md` under Technical Debt.

**Category 8 auto-fix steps:**
1. Missing adr_id: Count ADR files, assign next number. Return pendingFix.
2. Missing ADR file: Return pendingFix with decision content; LLM creates ADR file.
3. Log: "Synced N ADR drift(s)"

**Category 9 auto-fix steps:**
1. For each DISCUSSION-*.md file:
   a. **Missing index row**: Read the file's frontmatter (`id`, `title`, `status`, `outcome.type`, `date`). Add a new row to `discussions/index.md` with the data from the file.
   b. **Orphan index row**: Remove the row from `discussions/index.md` that has no corresponding file.
   c. **Status mismatch**: Update the index row's Status cell to match the file's frontmatter `status` (file is source of truth).
2. Log: `Synced N discussion index drift(s): M missing row(s) added, K orphan(s) removed, J status mismatch(es) fixed`

**Category 10 auto-fix steps:**
1. For each missing phase file: Return pendingFix { type: "create_phase_stub", phaseId, missingFile }.
2. LLM creates stub with `*(none)*` content.
3. Log: "Created N stub file(s) for M phase(s)"

**Category 11 auto-fix steps:**
1. For each expired discussion (`outcome.type: none` AND `today - date > 30 days`):
   a. Move the file from `discussions/` to `discussions/archive/` (create `archive/` directory if absent).
   b. Remove its row from `discussions/index.md`.
2. Log: `Auto-archived: DISCUSSION-xxx → discussions/archive/ (outcome: none, age > 30 days)`

**Category 12 auto-fix steps:**
1. For each tag inconsistency where the LLM is confident (already filtered by detection rule — "Only flag when confident"):
   a. Rename the suspicious tag to the canonical tag in all phases where it appears: update both `phases/index.yml` and the individual `phases/<phase-id>/phase.yml`.
   b. If confidence is uncertain (edge case), instead add the finding to `audit_ignore` in `.project-memory/config.yml` with reason `"auto-suppressed: tag typo requires human review"`.
2. Log: `Renamed N tag typo(s): "<old>" → "<new>" across M phase(s)` or `Auto-suppressed N tag inconsistency finding(s) to audit_ignore`

**Category 13 auto-fix steps:**
1. Call `check_consistency(project_memory_dir)` to get `{ missing, orphaned }`.
2. For each ID in `missing`:
   - If ID starts with `phase-`: read `phases/<ID>/phase.yml` (for id, title, tags, status), `phases/<ID>/plan.md` (truncate to 2000 chars), `phases/<ID>/implementation.md` (truncate to 2000 chars). Call `index_phase` with this data and `commitDiffs: []`.
   - If ID starts with `DECISION-`: read `decisions/<ID>.md`. Extract `id`, `title`, `status`, `touches` from frontmatter; extract `context` section body (truncate to 1000 chars) and `decision body` (combined # Decision + # Chosen Solution sections, truncate to 1000 chars). Call `index_decision`.
   - If ID starts with `DISCUSSION-`: read `discussions/<ID>.md`. Call `index_discussion` with id, title, status, outcome, tags, summary, and bodyText (first 2000 chars).
   - If ID starts with `era-`: read the era file. Extract `id` and `title` from frontmatter, `phases` list from frontmatter, `date_range` as `dateRange`, and body text after `---` as `narrative` (truncate to 3000 chars). Call `index_era({ id, title, phases, dateRange, narrative })`.
3. Orphaned IDs: no action.
4. Log: `MCP sync: N entries updated` (where N = missing.length)

**Category 14 auto-fix steps:**
1. **14a — Direct assignment target orphan:**
   a. For each orphaned `target_id`, annotate the `target_id` value in the ASSIGNMENT file frontmatter with `[orphaned YYYY-MM-DD]` (e.g., `phase-20260601-goal-tracking [orphaned 2026-06-14]`).
   b. If age ≤ 3 days: escalate as interactive triage instead of auto-fixing. The LLM should ask if the user wants to (1) fix the target_id, (2) mark the assignment completed, or (3) mark ignored.
   c. Log: `Auto-annotated: N orphan assignment target(s) → [orphaned YYYY-MM-DD]`
2. **14b — Stale pending assignment:**
   a. For each stale pending assignment: increment `remind_count` by 1, update `last_reminded_at` to today's date (YYYY-MM-DD).
   b. Log: `Bumped remind_count for N stale pending assignment(s)`
3. **14c — Completed without evidence:**
   a. For each evidence-less completion: annotate the frontmatter with `# Warning: completed without evidence [YYYY-MM-DD]`.
   b. Log: `Flagged N evidence-less assignment completion(s)`
   c. **LLM post-auto-fix:** Suggest the user add a completion note or link during the session. The annotation is a nudge, not a block.
4. Log summary: `Assignment integrity: N issue(s) across 14a/14b/14c auto-fixed`

### Category 14 — Assignment Integrity

Detects issues with ASSIGNMENT records in `.project-memory/assignments/`. Three sub-categories.

**Detection:**
- **14a — Direct assignment target orphan:** Scan all `ASSIGNMENT-*.md` files with `type: direct` and `status != completed`. For each, verify `target_id` references a file that exists (check issues/, phases/, discussions/, decisions/). Missing target = finding.
- **14b — Stale pending assignment:** Scan all `ASSIGNMENT-*.md` files with `status: pending` and `assigned_at` older than 30 days.
- **14c — Completed without evidence:** Scan all `ASSIGNMENT-*.md` files with `status: completed` where `completion_note`, `completed_phase_id`, `completed_decision_id`, and `completed_discussion_id` are ALL null/empty.

**Severity and handling:**

| Sub | Severity | Boundary | Action |
|-----|----------|----------|--------|
| 14a | medium | Age ≤ 3 days → interactive triage; > 3 days → auto-fix | Auto-fix: annotate `target_id` with `[orphaned YYYY-MM-DD]` (same format as Cat 7) |
| 14b | low | N/A (auto-fix always) | Auto-fix: increment `remind_count` by 1, update `last_reminded_at` to today. Annotation: `[stale pending — bump remind_count to N]` |
| 14c | low | N/A (auto-fix always) | Auto-fix: annotate frontmatter with `# Warning: completed without evidence [YYYY-MM-DD]`. No structural change. |

**Permanent skip:** Standard `audit_ignore` entries in `config.yml` apply. Keys: `"assignment-orphan:<ASSIGNMENT-ID>"` for 14a, `"assignment-stale:<ASSIGNMENT-ID>"` for 14b, `"assignment-no-evidence:<ASSIGNMENT-ID>"` for 14c. Pattern matching (`*`) supported.

**LLM post-auto-fix actions for 14c:** When an evidence-less completion is detected, the LLM should suggest the user add a completion note or link during the session. The annotation is a nudge, not a block.

---

# Edge Cases

- **Trivial-commit regex:** `^(docs|chore\(lint|chore\(format|chore\(deps|chore\(memory|chore\(audit|fix\(lint|phase:)`. Apply to the commit subject line. If a commit subject matches this pattern AND no open phase exists, exclude it from the orphan list.

- **Cat 1 author filtering:** On-load, `git config user.email` identifies the current user. Commits where `author_email != current_user_email` are skipped. If `git config user.email` returns empty (unknown user), all commits are shown (safe default).

- **Cat 1 age boundary:** Commit age computed from `%aI` (ISO 8601 date). Age > 3 days → auto-trivial (logged in auto_fixed). Age ≤ 3 days → informational notice (escalation, low severity, interactive: false). Explicit `audit` removal of age boundary is handled by the LLM layer, not the MCP tool.

- **Cat 1 explicit audit:** When the user invokes `Skill project-memory audit`, the LLM ignores `interactive: false` for Cat 1 and re-runs detection unfiltered. The MCP tool always applies the filter; explicit-audit unfiltering is a layer above (LLM re-reads config or runs raw git log).

- **`*(none)*` is not a stub:** `*(none)*` is the canonical placeholder for a legitimately-empty section. Do not include it in the stub grep patterns.

- **First-run:** If `.project-memory/` does not exist, skip the audit entirely.

- **Summaries without `Last Updated:` field:** Raise as a separate escalation finding (medium severity, no time boundary — the age is undefined so it always qualifies for interactive triage).

- **Empty `issues/open/` directory:** Cat 5 produces zero findings. Normal.

- **No open phases:** Cat 4 produces zero findings. Normal.

- **Cat 4 — branch:null date filtering:** When `branch: null` and a fallback branch (main/master/staging) is used, filter commits via `--after=<started_at - 1 day>` to exclude pre-project historical commits. The 1-day offset ensures commits made on the phase start date are included (git `--after` is exclusive). If `started_at` is absent, fall back to unfiltered behavior.

- **Decisions directory empty or missing:** Cat 6 produces zero findings. Normal.

- **`decisions/index.md` missing or header-only:** Every DECISION file is a "missing index row" finding.

- **Why no auto-fix for "missing index row":** The `Claim` column is human-authored prose. Auto-inserting a row without it produces a half-fix.

- **Cat 7 — hashes already annotated:** Skip hashes containing `[orphaned` — they were handled in a prior pass.

- **Cat 7 — git cat-file unavailable:** Skip Cat 7 entirely if not in a git directory.

- **Cat 8 — config.yml absent:** Skip Cat 8 entirely. ADR support is opt-in.

- **Cat 8 — `adr_enabled: false`:** Skip Cat 8 entirely. No ADR files are expected or checked.

- **Cat 8 — `adr_enabled` absent:** Treat as `true` — backward compat for projects initialized before the opt-in flag was introduced.

- **Cat 8 — ADR disabled mid-project:** Setting `adr_enabled: false` on a project that previously had ADR files does not delete `adr/`. The directory stays in git. Emit an informational notice: "ℹ️ ADR disabled — `adr/` directory retained in git. Add it to `.gitignore` if you no longer want to track it."

- **Cat 8 — adr_dir directory missing:** Flag every DECISION file as "missing ADR file". Escalated so user confirms directory creation.

- **Cat 8 — adr_id zero-padding:** Normalize to 4-digit zero-padded string for glob matching.

- **Cat 9 — `discussions/` directory missing or empty:** Zero findings. Normal.

- **Cat 9 — `discussions/index.md` missing or header-only:** Every DISCUSSION file is a "missing index row" finding (same logic as Cat 6).

- **Cat 9 — files in `discussions/archive/`:** Excluded from Cat 9 detection. Archived discussions are not expected to have index rows.

- **Cat 11 — `discussions/archive/` does not exist:** Create it during auto-fix before moving the first file. Do not flag its absence as a finding.

- **Cat 12 — fewer than 5 unique tags:** Skip Cat 12. Insufficient signal for typo detection.

- **Cat 12 — uncertain similarity:** When in doubt, do not flag. False positives are worse than misses for fuzzy pattern matching.

- **audit_ignore — missing config.yml:** If `.project-memory/config.yml` does not exist, treat `audit_ignore` as an empty list. Do not flag the missing file as a finding.

- **audit_ignore — no `audit_ignore` key in config.yml:** Same as empty list. The key is optional.

- **Cat 13 — MCP unavailable:** If `check_consistency` tool is not in available tools, skip Cat 13 entirely. This is normal when MCP companion is not installed.
- **Cat 13 — project_memory_dir path:** Derive from the current project root: the directory containing `phases/`, `decisions/`, etc.
