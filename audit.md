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

# Detection Procedure

Run all 7 categories on every audit pass. Collect findings before acting.

| # | Category | Detection Rule | Tool Calls | Classification |
|---|---|---|---|---|
| 1 | **Commit orphans** | Run `git log --oneline -30`. For each commit hash, check `phases/index.yml` for a match in any `commits:` list or as a `merge_commit`. Commits not found in the index are candidates. Apply trivial-commit regex (see Edge Cases) to filter: commits whose subject matches `^(docs\|chore\(lint\|chore\(format\|chore\(deps\|chore\(memory\|chore\(audit\|fix\(lint` are filtered out. Remaining unmatched commits = orphan significant commits. | `Bash: git log --oneline -30`; `Read: .project-memory/phases/index.yml` | **Escalate** |
| 2 | **Summary staleness** | Run `git log -1 --format=%cs` to get the date of the most recent project commit (no path filter — `.project-memory/` is gitignored and would return empty). Then for each file in `summaries/*.md`, parse the `Last Updated:` field. If the summary date is older than the project commit date, it is stale. If a summary file has no `Last Updated:` field, treat as a separate finding (see Edge Cases). | `Bash: git log -1 --format=%cs`; `Read` each `summaries/*.md` file to find `Last Updated:` line | **Escalate** |
| 3 | **Stub placeholders** | Grep all `summaries/*.md` for the following strings: `None recorded yet`, `TBD`, `system just initialized`, `first run detected`. Record the file path and which section header the match falls under. | `Grep` over `.project-memory/summaries/*.md` for each stub pattern | **Escalate** |
| 4 | **Open-phase commit gap** | In `phases/index.yml`, find every phase with `status` equal to `planning`, `implementation`, or `review` (skip `completed` and `abandoned`). For each such phase: identify the branch (if `branch` is null, try `main`, `master`, `staging` in order and use the first branch that exists; if none exist, skip this phase's gap detection). Get the list of commit hashes already recorded in `commits[]`. Run `git log --oneline <branch>` and compare against the recorded commits. Commits on the branch that came after the last recorded commit in the phase, and are not in the phase's `commits[]` list, are the gap. | `Read: .project-memory/phases/index.yml`; `Bash: git log --oneline <branch>` for each open phase | **Escalate** |
| 5 | **Misplaced issue files** | List all files in `issues/open/`. For each file, read its frontmatter and check the `status:` field. If `status: closed`, the file is in the wrong directory. | `Glob: .project-memory/issues/open/*.md`; `Read` frontmatter of each file | **Auto-fix** |
| 6 | **Decision index drift** | List all `DECISION-*.md` files in `.project-memory/decisions/`. Read each file's frontmatter to extract `id` and `status`. Read `.project-memory/decisions/index.md` and parse the rows (skip header). For each row extract the ID column and Status column. Compute three sets: (a) **missing index row** — file ID not in any index row; (b) **orphan index row** — index ID has no corresponding file; (c) **status mismatch** — file ID matches index ID but file `status` ≠ index `Status`. | `Glob: .project-memory/decisions/DECISION-*.md`; `Read` frontmatter of each; `Read: .project-memory/decisions/index.md` | **Escalate** |
| 7 | **Orphan commit references** | Read `phases/index.yml`. Collect all hashes from every phase's `commits:` list and `merge_commit` field (skip null values and hashes already annotated with `[orphaned`). Batch-check all hashes with a single `git cat-file --batch-check` call (pipe the hashes to stdin). Any hash that returns `missing` is an orphan reference — its stored hash no longer exists in git (rebase/squash/force-push rewrote it). | `Read: .project-memory/phases/index.yml`; `Bash: echo "<hashes>" \| git cat-file --batch-check` | **Auto-fix** |

---

# Auto-Fix Rules

Only categories 5 and 7 are auto-fixed. No other category is ever auto-fixed.

**Category 5 auto-fix steps:**
1. For each `issues/open/*.md` file with frontmatter `status: closed`:
   a. Move the file to `issues/closed/` (same filename).
   b. Open `summaries/active-issues.md` and remove or update the entry for that issue to reflect it is now closed.
2. Log the action as: `Auto-fixed: moved <filename> to closed/`
3. Include this log line in the drift report output (see Output Format).

**Category 7 auto-fix steps:**
1. For each orphan hash found:
   a. In `phases/index.yml`, replace the bare hash with `<hash> [orphaned YYYY-MM-DD]` (today's date). Apply to both `commits:` list entries and `merge_commit` field.
   b. In the phase's `phase.yml`, apply the same annotation to any matching hash in `commits:` or `merge_commit`.
2. Count total orphan hashes and the number of distinct phases affected.
3. Log: `Auto-annotated: N orphan commit reference(s) across M phase(s) → marked [orphaned YYYY-MM-DD] in phase.yml and index.yml`
4. If `N > 0`, add or update an entry in `summaries/project-memory.md` under Technical Debt: `N orphan commit reference(s) across M phase(s) (rebased/squashed history) — annotated YYYY-MM-DD, no automated recovery`

Everything outside categories 5 and 7 is escalated, regardless of how clearly wrong it appears. The auto-fix rule is intentionally conservative.

---

# Output Format (On-Load)

**When findings or auto-fixes exist:**

```
[🧠] PROJECT MEMORY LOADED

[⚠️] DRIFT AUDIT — N issue(s), M auto-fixed
  • Commit orphan: K commits not tracked
    <hash1> <hash2> <hash3> ...
  • Summary stale: <filename> (Last Updated <date> < project commit <date>)
  • Summary missing Last Updated field: <filename>
  • Stub placeholder: <filename> → "<placeholder text>" in section "<section heading>"
  • Open-phase gap: phase <id> is missing commits: <hash1> <hash2> ...
  • Decision index missing row: <DECISION-ID> (file exists, no index row)
  • Decision index orphan row: <DECISION-ID> (index row exists, no file)
  • Decision index status mismatch: <DECISION-ID> (file: <status>, index: <status>)
  • Auto-annotated: N orphan commit reference(s) across M phase(s) → marked [orphaned YYYY-MM-DD] in phase.yml and index.yml
  • Auto-fixed: moved <filename> to closed/

Entering interactive triage — answering each finding in turn.
```

Replace `N` with the total number of escalation findings. Replace `M` with the count of auto-fixed items (0 if none). Omit any bullet that has no findings for its category. The auto-fixed bullet always comes last.

**When zero findings AND zero auto-fixes:**

Emit this single line (replacing the default Step 1 `[🧠] PROJECT MEMORY LOADED` output):

```
[🧠] PROJECT MEMORY LOADED — drift audit clean
```

---

# Auto-Trigger Rule

When on-load detection (Context A) produces **any escalation finding** after auto-fix, the skill MUST immediately proceed into Interactive Mode flow — without waiting for the user to invoke `Skill project-memory audit` manually.

Rationale: users consistently skip the manual invocation suggestion. Drift accumulates silently. Auto-triggering interactive triage on-load enforces the discipline that on-demand invocation was meant to provide, without requiring the user to remember to run it.

The transition is seamless: emit the drift report header line, then begin prompting per-finding via `AskUserQuestion` exactly as Interactive Mode specifies. After all findings are resolved, re-run detection and loop until clean.

The clean-line case (`[🧠] PROJECT MEMORY LOADED — drift audit clean`) is unchanged — it only fires when there are zero findings and zero auto-fixes.

---

# Interactive Mode

When the skill is invoked as `Skill project-memory audit`:

1. Run the full detection procedure above. Collect all escalation-category findings.
2. For each finding, use `AskUserQuestion` to prompt the user with the finding and the available resolution choices (see question shapes below). Apply their decision immediately before moving to the next finding.
3. After all decisions are applied, re-run the full detection procedure. If new findings appear, repeat from step 2. Loop until the audit returns clean.
4. Do NOT re-run the on-load summary loading sequence — the user already has a loaded session.

**Question shapes per category:**

- **Commit orphans:** "These N commits are not tracked in any phase: `<hashes>`. What should I do?" — options: `[open phase name(s) if any]`, `"new phase"`, `"mark trivial (skip)"`.

- **Summary staleness:** "`<filename>` is stale (Last Updated `<date>`, memory commit `<date>`). How should I resolve this?" — options: `"update content"`, `"bump Last Updated date only"`, `"skip"`.

- **Stub placeholders:** "`<filename>` still has '<placeholder>' in section '<section>'. Resolve now or leave?" — options: `"replace now"`, `"leave"`.

- **Open-phase commit gap:** "Open phase `<id>` is missing commits: `<hashes>`. What should I do?" — options: `"add to this phase"`, `"open new phase for these commits"`, `"close current phase"`, `"skip"`.

- **Summary missing Last Updated field:** "`<filename>` has no 'Last Updated:' field. Add it now?" — options: `"add Last Updated: <today>"`, `"skip"`.

- **Decision index missing row:** "`<DECISION-ID>` has no row in `decisions/index.md`. What should I do?" — options: `"add row now"`, `"skip"`.

- **Decision index orphan row:** "`<DECISION-ID>` appears in `decisions/index.md` but the file does not exist. What should I do?" — options: `"remove row"`, `"recreate file from index data"`, `"skip"`.

- **Decision index status mismatch:** "`<DECISION-ID>` status differs — file says `<status>`, index says `<status>`. Which is correct?" — options: `"file is correct (update index)"`, `"index is correct (update file)"`, `"skip"`.

---

# Edge Cases

- **Trivial-commit regex:** `^(docs|chore\(lint|chore\(format|chore\(deps|chore\(memory|chore\(audit|fix\(lint`. Apply to the commit subject line (the part after the 7-char hash and space). If a commit subject matches this pattern AND no open phase exists, exclude it from the orphan list entirely. If a commit subject matches AND an open phase exists, also exclude it from the orphan list — but if the count of such trivial unattached commits exceeds 3, add a silent note: "X trivial commits not attached to open phase `<id>`" (do not escalate, do not ask the user; note only if count > 3).

- **`*(none)*` is not a stub:** `*(none)*` is the canonical placeholder for a legitimately-empty section (per SKILL.md — "Stub placeholders to clear on sight … any `*(none)*` in a section that **now has content**"). It is intentional and correct when the section truly has no content. Detecting whether a section "has content" vs. "is intentionally empty" via regex is unreliable. Do not include `*(none)*` in the stub grep patterns. If a user finds a stale `*(none)*` in a section that should have content, they can clear it manually.

- **First-run:** If `.project-memory/` does not exist, skip the audit entirely. The `init.md` path handles first-run setup; audit has no role there.

- **Summaries without `Last Updated:` field:** Do not fail the date parse. Instead, raise as a separate escalation finding: "summary missing Last Updated field: `<filename>`". This is distinct from summary staleness and is always escalated, never auto-fixed.

- **Empty `issues/open/` directory:** Category 5 produces zero findings. This is normal; do not flag it.

- **No open phases:** Category 4 produces zero findings. Normal.

- **Decisions directory empty or missing:** Category 6 produces zero findings. Normal for a project with no decisions yet.

- **`decisions/index.md` missing or has only the header:** If the file is missing entirely, every DECISION file is a "missing index row" finding. If the file exists but has no data rows, same outcome. This is intentional — surfacing every missing row forces the user to recreate the index or confirm intent.

- **Why no auto-fix for "missing index row":** The `Claim` column is human-authored prose, not derivable from frontmatter. Auto-inserting a row with all fields except Claim produces a half-fix that pollutes the index. Escalation is safer.

- **Category 7 — hashes already annotated:** Skip hashes that already contain `[orphaned` in their stored value. They were handled in a prior audit pass; re-annotating is a no-op and would corrupt the field.

- **Category 7 — empty commits list:** If a phase has no entries in `commits:` and `merge_commit` is null, skip that phase. Zero hashes to check.

- **Category 7 — all commits in a phase orphaned:** Annotate all of them. The phase record itself is preserved; only the commit linkage is severed.

- **Category 7 — git cat-file behavior:** `git cat-file --batch-check` accepts one hash per line on stdin and returns `<hash> missing` for non-existent objects. Works cross-platform (Windows/POSIX). If the command is unavailable (non-git directory), skip category 7 entirely and do not flag it as a finding.

- **Category 7 — why auto-fix, not escalation:** The commit hash is gone permanently. The user cannot recover it. The only "decision" would be "annotate" or "ignore" — forcing Interactive Mode for potentially dozens of orphan references across many phases would be pure noise. Auto-annotate preserves the historical record without burdening the user.
