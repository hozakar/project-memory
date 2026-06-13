---
name: project-memory-audit
description: Drift audit procedure for project-memory. Read on every session load (per SKILL.md step 3) and when project-memory skill is invoked with the `audit` argument.
---

# When To Run

**Context A — On-load (passive), via SKILL.md step 3:**
Run automatically every session. Apply auto-fixes silently. Emit a single drift report block for all escalation-category findings. If nothing found and nothing auto-fixed, emit the single clean line instead of the normal Step 1 output. If any escalation-category findings remain after auto-fix, immediately transition into Interactive Mode (same as Context B) — do not emit the drift report block and stop; proceed directly to triage.

**Context B — On-demand (interactive), via `Skill project-memory audit`:**
Run when the skill is explicitly invoked with the `audit` argument. Same detection logic, but for each escalation-category finding, prompt the user via `AskUserQuestion` and apply their decision immediately. After all decisions are applied, re-run detection; loop until clean.

---

# MCP Fast Path

**When `run_audit` is in available MCP tools (server v0.4.0+):**

1. Call `run_audit(project_memory_dir)` where `project_memory_dir` is the absolute path to `.project-memory/`.
2. Receive `{ auto_fixed, pending_fixes, escalations }`:
   - `auto_fixed`: Cat 5 and Cat 11 file-move operations already executed — log them in the auto-fix line of the report.
   - `pending_fixes`: Cat 7 orphan annotations — apply each one using the Edit tool (annotate the hash in `phases/index.yml` and the corresponding `phases/<phase_id>/phase.yml`).
   - `escalations`: all other findings, each with `category`, `severity`, `description`, `interactive` (bool), and `data`.
3. For each escalation where `interactive: true` → enter interactive triage (same per-category question shapes as below).
4. For each escalation where `interactive: false` → these are pre-classified for auto-fix by MCP's severity/time-boundary logic. Report them in the auto-fixed log (not interactive triage).
5. Cat 12 findings (`category: 12`) always require LLM confirmation before prompting the user — review the `data.tag` / `data.similar_tag` pair and decide if it is genuinely a typo. Only escalate (interactive: false → it's low severity) if confident.
6. Skip the file-based Detection Procedure section entirely — `run_audit` has already covered all 13 categories.

**When `run_audit` is NOT available — MCP installation check:**

1. Check if `mcp-server/package.json` exists and read its `version` field.
2. Read `.project-memory/config.yml` for `mcp_install_offered_for_version`.
3. If `mcp-server/package.json` version > `mcp_install_offered_for_version` (or `mcp_install_offered_for_version` is null/missing):
   - Present a single offer: "MCP companion server v{X.Y.Z} is available but not installed. It provides semantic search and faster audits. I can install it for you — want me to?"
   - Options: "Install now" / "I'll do it myself" / "Not now"
   - On "Install now" or "I'll do it myself": read `mcp-server/INSTALL.md` and follow the appropriate section.
   - On "Not now": set `mcp_install_offered_for_version` to the current version to suppress re-offers for this version.
4. If version matches `mcp_install_offered_for_version` → silent skip (already offered).
5. If `mcp-server/` does not exist at all → silent skip (MCP is optional).

**When MCP is unavailable entirely:** use the file-based Detection Procedure below.

---

# Detection Procedure

Run all 13 categories on every audit pass. Collect findings before acting. Check `audit_ignore` (see Permanent Skip section) before escalating any finding — suppressed findings are omitted entirely.

| # | Category | Detection Rule | Tool Calls | Classification | Severity |
|---|---|---|---|---|---|---|
| 1 | **Commit orphans** | Run `git log --format='%h %ae %aI %s' -30`. For each commit hash, check `phases/index.yml` for a match in any `commits:` list or as a `merge_commit`. Apply trivial-commit regex (see Edge Cases). Auto-assigns same-user commits to phases by file matching. Ambiguous commits logged as info. Aged (>3d) and non-current-user commits skipped. All filters removed on explicit `audit` invocation. | MCP: `run_audit` Cat 1 function | **Auto-fix** | — |
| 2 | **Summary staleness** | Run `git log -1 --format=%cs` to get the date of the most recent project commit. For each file in `summaries/*.md`, parse the `Last Updated:` field. If the summary date is older than the project commit date, it is stale. If a summary file has no `Last Updated:` field, treat as a separate finding (see Edge Cases). Always auto-bumps Last Updated date to today. | `Bash: git log -1 --format=%cs`; `Read` each `summaries/*.md` file | **Auto-fix** | — |
| 3 | **Stub placeholders** | Grep all `summaries/*.md` for: `None recorded yet`, `TBD`, `system just initialized`, `first run detected`. Record the file path and which section header the match falls under. No age computation — always auto-fix. | `Grep` over `.project-memory/summaries/*.md` | **Auto-fix** | **low** |
| 4 | **Open-phase commit gap** | In `phases/index.yml`, find every phase with `status` equal to `planning`, `implementation`, or `review`. For each: identify branch (if null, try `main`, `master`, `staging`; if none exist, skip). Get commits already in `commits[]`. Run `git log --oneline --max-count=200 --after=<started_at - 1 day> <branch>` and find commits on branch not in the phase's list. Same-user heuristic: auto-assigns commits to current or next phase by file overlap scoring. Escalates only when author != current user or file matching is ambiguous. Age: timestamp of the earliest untracked commit. | `Read: .project-memory/phases/index.yml`; `Bash: git log --oneline --max-count=200 --after=<started_at - 1 day> <branch>` | **Escalate** | **high** |
| 5 | **Misplaced issue files** | List all files in `issues/open/`. For each, read its frontmatter `status:` field. If `status: closed`, the file is misplaced. | `Glob: .project-memory/issues/open/*.md`; `Read` frontmatter | **Auto-fix** | — |
| 6 | **Decision index drift** | List all `DECISION-*.md` files in `.project-memory/decisions/`. Read each file's frontmatter `id` and `status`. Read `decisions/index.md` and parse rows. Compute: (a) missing index row; (b) orphan index row; (c) status mismatch. Missing rows → pendingFix with decision data for LLM Claim generation. Orphan rows → auto-removed. Status mismatches → auto-resolved (file is source of truth). | `Glob: .project-memory/decisions/DECISION-*.md`; `Read` frontmatter; `Read: decisions/index.md` | **Auto-fix** | — |
| 7 | **Orphan commit references** | Collect all hashes from every phase's `commits:` and `merge_commit` (skip null and already-annotated with `[orphaned`). Batch-check via `git cat-file --batch-check`. Any hash returning `missing` is orphaned. | `Read: .project-memory/phases/index.yml`; `Bash: echo "<hashes>" | git cat-file --batch-check` | **Auto-fix** | — |
| 8 | **ADR sync drift** | Read `.project-memory/config.yml` for `adr_dir` (default `adr/`). If `adr_dir` absent, skip. For each `DECISION-*.md`: (a) check `adr_id` — if null/missing, flag; (b) glob `<adr_dir>/<adr_id>-*.md` — if no match, flag; (c) if found, compare its `Status:` against expected prose per ADR Status mapping in `conventions.md`. Missing adr_id → auto-assigns next number. Missing ADR file → pendingFix with decision content for LLM generation. Status mismatch → pendingFix for LLM sync. | `Read: .project-memory/config.yml`; `Glob/Read: decisions/DECISION-*.md`; `Glob/Read: <adr_dir>/<adr_id>-*.md` | **Auto-fix** | — |
| 9 | **Discussion index drift** | List all `DISCUSSION-*.md` files in `.project-memory/discussions/` (not `discussions/archive/`). Read each file's frontmatter `id` and `status`. Read `discussions/index.md` and parse rows. Compute: (a) missing index row — file ID not in any index row; (b) orphan index row — index row ID has no file; (c) status mismatch — file `status` ≠ index `Status` cell. | `Glob: .project-memory/discussions/DISCUSSION-*.md`; `Read` frontmatter of each; `Read: discussions/index.md` | **Auto-fix** | **low** |
| 10 | **Completed phase file completeness** | For each phase in `index.yml` with `status: completed`, verify these 5 files exist in the phase directory: `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`. Report each missing file as a separate finding. Auto-creates stub files (`*(none)*`) for missing phase documents. | `Read: phases/index.yml`; `Glob: phases/<id>/*.md` for each completed phase | **Auto-fix** | — |
| 11 | **Discussion expiry** | For each `DISCUSSION-*.md` in `discussions/` (not `discussions/archive/`): read frontmatter `outcome.type` and `date`. If `outcome.type == none` AND `today - date > 30 days` → expired. Handles both nested format (`outcome:\n  type: none`) and flat format (`outcome: none`). | `Glob: discussions/DISCUSSION-*.md`; `Read` frontmatter of each | **Auto-fix** | — |
| 12 | **Tag inconsistency** | Read all phase tags from `phases/index.yml`. Collect all unique tags across all phases. Using LLM judgment, identify tag pairs that appear to be typos or near-duplicates (e.g., `skil-md` vs `skill-md`). Flag each suspect pair with both the tag value and the phase IDs where it appears. Only flag when confident — false positives are worse than misses. Skip if fewer than 5 unique tags total. | `Read: phases/index.yml` | **Auto-fix** | **low** |
| 13 | **MCP consistency** | If `check_consistency` is NOT in available tools, skip entirely. Otherwise: call `check_consistency(path_to_dot_project_memory_dir)` where the path is the absolute path to the `.project-memory/` directory in the current project. For each ID in `missing` (file exists, not in DB): if ID starts with `phase-`, read that phase's `phase.yml` + `plan.md` + `implementation.md` and call `index_phase`; if ID starts with `DECISION-`, read the DECISION file and call `index_decision`. For each ID in `orphaned`: no action (will be cleaned on next upsert cycle). **Note:** Cat 13 runs when MCP was unavailable at session start. If proactive sync (see `protocol.md` → MCP Companion Integration) already ran this session, Cat 13 will find no missing entries and can be skipped. Cat 13 is a fallback, not a duplicate. | MCP: `check_consistency`; `Read` phase/decision files for missing IDs; MCP: `index_phase`/`index_decision` | **Auto-fix** | — |

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

# Severity

The model has 2 effective tiers:

| Severity | Categories | Behavior |
|----------|-----------|----------|
| **high** | Cat 4 | Heuristic auto-resolves same-user commits. Escalates only on author mismatch or ambiguous file matching. |
| **auto-fix** | Cat 1,2,3,5,6,7,8,9,10,11,12,13 | Applied silently; logged in drift report. |

---

# Permanent Skip

Before escalating any finding, check the `audit_ignore` list in `.project-memory/config.yml`. If a finding's fingerprint matches an entry's `key`, suppress it entirely — omit from both the report and interactive triage.

**Matching rules:**
- Exact match: `key` equals the finding fingerprint exactly (backward-compatible).
- Pattern match: `key` contains `*` as a wildcard. A `*` matches any sequence of characters in that segment. Examples:
  - `tag-typo:*:skil-md` — matches any phase with tag typo "skil-md"
  - `phase-completeness:phase-2026*:*.md` — matches missing files across a cohort of phases
  - `commit:*` — matches ALL orphan commit findings in category 1
- Patterns are checked AFTER exact matches. If an exact match exists, pattern matching is skipped for that finding.
- Pattern matching is glob-style: `*` matches within a single segment (between `:` delimiters). To match across segments, use multiple `*` wildcards.

**Fingerprint format per category:**

| # | Key format |
|---|---|
| 1 | `commit:<hash>` |
| 2 | `summary:<filename>` |
| 3 | `stub:<filename>:<section-heading>` |
| 4 | `phase-gap:<phase-id>` |
| 6 | `decision-drift:<DECISION-ID>:<missing-row|orphan-row|status-mismatch>` |
| 8 | `adr-drift:<DECISION-ID>:<missing-adr_id|missing-file|status-mismatch>` |
| 9 | `discussion-drift:<DISCUSSION-ID>:<missing-row|orphan-row|status-mismatch>` |
| 10 | `phase-completeness:<phase-id>:<missing-filename>` |
| 12 | `tag-typo:<phase-id>:<tag-value>` |

**`config.yml` format:**

```yaml
audit_ignore:
  - category: 12
    key: "phase-20260611-skill-md-refactor:skil-md"
    reason: "legacy typo, accepted as-is"
    ignored_at: 2026-06-12
  # Pattern-based example — suppresses tag typo "skil-md" across ALL phases:
  - category: 12
    key: "tag-typo:*:skil-md"
    reason: "recurring typo, suppressed globally"
    ignored_at: 2026-06-13
  # Suppress all phase-completeness findings for a cohort:
  - category: 10
    key: "phase-completeness:phase-202606*:*.md"
    reason: "cohort phases pre-date file completeness discipline"
    ignored_at: 2026-06-13
```

When the user chooses "mark ignored" during interactive triage, write the entry to `config.yml` immediately before moving to the next finding.

---

# Era-Based Auto-Clean

When an era (`era-NNN.md`) is created or updated in `.project-memory/eras/`:

1. Read the new or updated era file's frontmatter `phases:` list — these are the phase IDs covered by this era.
2. Open `.project-memory/config.yml` and read the `audit_ignore` list (if absent, nothing to clean — skip).
3. For each `audit_ignore` entry, check whether its `key` references any phase ID in the era's `phases` list. A reference is any match where the phase ID appears as a segment in the key (between `:` delimiters or as the full key for single-segment keys).
4. Remove any entry that matches — the phase is now archived in an era, so suppressing its findings is no longer needed.
5. If entries were removed, log: `Era auto-clean: removed N audit_ignore entry/entries for archived phase(s) in era-XXX`.
6. This cleanup runs automatically when the era is created/updated. Do NOT prompt the user — it is a maintenance operation.

**MCP note:** When Cat 13 (MCP consistency) detects a new `era-` entry during `check_consistency` and indexes it, the auto-clean does NOT re-trigger. Auto-clean fires only on explicit era file creation/update, not on DB sync.

---

# Auto-Fix Rules

All 13 categories are auto-fixed per the simplified severity model. Cat 4 uses a heuristic that auto-resolves same-user commits and escalates only on author mismatch or ambiguous file matching.

**Category 5 auto-fix steps:**
1. For each `issues/open/*.md` file with frontmatter `status: closed`:
   a. Move the file to `issues/closed/` (same filename).
   b. Open `summaries/active-issues.md` and remove or update the entry for that issue.
2. Log: `Auto-fixed: moved <filename> to closed/`

**Category 7 auto-fix steps:**
1. For each orphan hash:
   a. In `phases/index.yml`, replace the bare hash with `<hash> [orphaned YYYY-MM-DD]` (today's date). Apply to both `commits:` and `merge_commit`.
   b. In the phase's `phase.yml`, apply the same annotation.
2. Log: `Auto-annotated: N orphan commit reference(s) across M phase(s) → marked [orphaned YYYY-MM-DD] in phase.yml and index.yml`
3. If `N > 0`, add or update an entry in `summaries/project-memory.md` under Technical Debt.

**Category 11 auto-fix steps:**
1. For each expired discussion (`outcome.type: none` AND `today - date > 30 days`):
   a. Move the file from `discussions/` to `discussions/archive/` (create `archive/` directory if absent).
   b. Remove its row from `discussions/index.md`.
2. Log: `Auto-archived: DISCUSSION-xxx → discussions/archive/ (outcome: none, age > 30 days)`

**Category 13 auto-fix steps:**
1. Call `check_consistency(project_memory_dir)` to get `{ missing, orphaned }`.
2. For each ID in `missing`:
   - If ID starts with `phase-`: read `phases/<ID>/phase.yml` (for id, title, tags, status), `phases/<ID>/plan.md` (truncate to 2000 chars), `phases/<ID>/implementation.md` (truncate to 2000 chars). Call `index_phase` with this data and `commitDiffs: []`.
   - If ID starts with `DECISION-`: read `decisions/<ID>.md`. Extract `id`, `title`, `status`, `touches` from frontmatter; extract `context` section body (truncate to 1000 chars) and `decision body` (combined # Decision + # Chosen Solution sections, truncate to 1000 chars). Call `index_decision`.
   - If ID starts with `DISCUSSION-`: read `discussions/<ID>.md`. Call `index_discussion` with id, title, status, outcome, tags, summary, and bodyText (first 2000 chars).
   - If ID starts with `era-`: read the era file. Extract `id` and `title` from frontmatter, `phases` list from frontmatter, `date_range` as `dateRange`, and body text after `---` as `narrative` (truncate to 3000 chars). Call `index_era({ id, title, phases, dateRange, narrative })`.
3. Orphaned IDs: no action.
4. Log: `MCP sync: N entries updated` (where N = missing.length)

**Category 3 auto-fix steps:**
1. For each summary file containing `None recorded yet`, `TBD`, `system just initialized`, or `first run detected`:
   a. Replace each match with `*(none)*` (the canonical empty-section marker).
   b. Skip matches that are already `*(none)*`.
2. Log: `Replaced N stub placeholder(s) in summaries/ → *(none)*`

**Category 9 auto-fix steps:**
1. For each DISCUSSION-*.md file:
   a. **Missing index row**: Read the file's frontmatter (`id`, `title`, `status`, `outcome.type`, `date`). Add a new row to `discussions/index.md` with the data from the file.
   b. **Orphan index row**: Remove the row from `discussions/index.md` that has no corresponding file.
   c. **Status mismatch**: Update the index row's Status cell to match the file's frontmatter `status` (file is source of truth).
2. Log: `Synced N discussion index drift(s): M missing row(s) added, K orphan(s) removed, J status mismatch(es) fixed`

**Category 12 auto-fix steps:**
1. For each tag inconsistency where the LLM is confident (already filtered by detection rule — "Only flag when confident"):
   a. Rename the suspicious tag to the canonical tag in all phases where it appears: update both `phases/index.yml` and the individual `phases/<phase-id>/phase.yml`.
   b. If confidence is uncertain (edge case), instead add the finding to `audit_ignore` in `.project-memory/config.yml` with reason `"auto-suppressed: tag typo requires human review"`.
2. Log: `Renamed N tag typo(s): "<old>" → "<new>" across M phase(s)` or `Auto-suppressed N tag inconsistency finding(s) to audit_ignore`

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

**Category 6 auto-fix steps:**
1. Missing row: Return pendingFix with decision data; LLM generates Claim and inserts row.
2. Orphan row: Remove row from index.
3. Status mismatch: Return pendingFix; LLM updates index (file is source of truth).
4. Log: "Synced N decision index drift(s)"

**Category 8 auto-fix steps:**
1. Missing adr_id: Count ADR files, assign next number. Return pendingFix.
2. Missing ADR file: Return pendingFix with decision content; LLM creates ADR file.
3. Status mismatch: Return pendingFix; LLM syncs ADR status.
4. Log: "Synced N ADR drift(s)"

**Category 10 auto-fix steps:**
1. For each missing phase file: Return pendingFix { type: "create_phase_stub", phaseId, missingFile }.
2. LLM creates stub with `*(none)*` content.
3. Log: "Created N stub file(s) for M phase(s)"

---

# Output Format (On-Load)

**When findings or auto-fixes exist:**

```
[🧠] PROJECT MEMORY LOADED

[⚠️] DRIFT AUDIT — N issue(s), M auto-fixed
  Interactive triage:
  • [high] Open-phase gap: phase <id> — <N> commit(s) by <author> couldn't be auto-assigned

  Auto-fixed:
  • Replaced N stub placeholder(s) in summaries/ → *(none)*
  • Synced N discussion index drift(s): M added, K removed, J fixed
  • Renamed N tag typo(s): "<old>" → "<new>" across M phase(s)
  • Bumped N stale summary Last Updated date(s)
  • Synced N decision index drift(s)
  • Synced N ADR drift(s)
  • Created N stub file(s) for M phase(s)
  • Auto-assigned N commit(s) to phase(s)
  • Auto-annotated: N orphan commit reference(s) across M phase(s) → [orphaned YYYY-MM-DD]
  • Auto-archived: DISCUSSION-xxx → discussions/archive/
  • Auto-fixed: moved <filename> to closed/
  • MCP sync: N entries updated

  Info:
  • Cat 1: N orphan commit(s) (last 3 days). Run `audit` to review.

Entering interactive triage — answering each finding in turn.
```

Replace `N` with the total number of escalation findings (Cat 4 only). Replace `M` with the count of auto-fixed items. Omit any bullet that has no findings.

The `Interactive triage:` sub-header is omitted when there are zero interactive findings (Cat 4 heuristic resolved everything). Auto-fix log lines always follow.

**When zero findings AND zero auto-fixes:**

```
[🧠] PROJECT MEMORY LOADED — drift audit clean
```

---

# Auto-Trigger Rule

When on-load detection produces **any interactive-triage finding** (Cat 4 — author mismatch or ambiguous file matching that couldn't be auto-resolved) after auto-fix, the skill MUST immediately proceed into Interactive Mode flow.

Emit the drift report header line, then begin prompting per interactive-triage finding via `AskUserQuestion`. After all findings are resolved, re-run detection and loop until no interactive-triage findings remain.

---

# Interactive Mode

When the skill is invoked as `Skill project-memory audit`:

1. Run the full detection procedure. Collect all findings — only Cat 4 findings that couldn't be auto-resolved enter interactive triage.
2. Present the full drift report.
3. For each **interactive-triage** finding, use `AskUserQuestion`. Apply their decision immediately before moving to the next.
4. All auto-fix findings are handled silently; only Cat 4 unresolved findings are prompted.
5. After all decisions are applied, re-run the full detection. If new interactive-triage findings appear, repeat from step 3. Loop until clean.
6. Do NOT re-run the on-load summary loading sequence.

**Question shapes per category:**

Cat 4 is the only interactive category. All others (Cat 1,2,3,5,6,7,8,9,10,11,12,13) are auto-fixed silently.

- **Open-phase commit gap (simplified):** Only escalated when heuristic can't resolve.
  "Open phase <id> has <N> commit(s) by <author> that couldn't be auto-assigned. What should I do?"
  Options: "add to this phase", "open new phase", "close current phase", "skip", "mark ignored"

When the user chooses `"mark ignored (permanent)"` for any finding: write the corresponding `audit_ignore` entry to `.project-memory/config.yml` immediately, then move to the next finding.

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