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

Run all 5 categories on every audit pass. Collect findings before acting.

| # | Category | Detection Rule | Tool Calls | Classification |
|---|---|---|---|---|
| 1 | **Commit orphans** | Run `git log --oneline -30`. For each commit hash, check `phases/index.yml` for a match in any `commits:` list or as a `merge_commit`. Commits not found in the index are candidates. Apply trivial-commit regex (see Edge Cases) to filter: commits whose subject matches `^(docs\|chore\(lint\|chore\(format\|chore\(deps\|chore\(memory\|chore\(audit\|fix\(lint` are filtered out. Remaining unmatched commits = orphan significant commits. | `Bash: git log --oneline -30`; `Read: .project-memory/phases/index.yml` | **Escalate** |
| 2 | **Summary staleness** | Run `git log -1 --format=%cs -- .project-memory/` to get the date of the most recent commit that touched `.project-memory/`. Then for each file in `summaries/*.md`, parse the `Last Updated:` field. If the summary date is older than the memory commit date, it is stale. If a summary file has no `Last Updated:` field, treat as a separate finding (see Edge Cases). | `Bash: git log -1 --format=%cs -- .project-memory/`; `Read` each `summaries/*.md` file to find `Last Updated:` line | **Escalate** |
| 3 | **Stub placeholders** | Grep all `summaries/*.md` for the following strings: `None recorded yet`, `TBD`, `system just initialized`, `first run detected`. Record the file path and which section header the match falls under. | `Grep` over `.project-memory/summaries/*.md` for each stub pattern | **Escalate** |
| 4 | **Open-phase commit gap** | In `phases/index.yml`, find every phase with `status != completed`. For each such phase: identify the branch (use `staging` if `branch` is null). Get the list of commit hashes already recorded in `commits[]`. Run `git log --oneline <branch>` and compare against the recorded commits. Commits on the branch that came after the last recorded commit in the phase, and are not in the phase's `commits[]` list, are the gap. | `Read: .project-memory/phases/index.yml`; `Bash: git log --oneline <branch>` for each open phase | **Escalate** |
| 5 | **Misplaced issue files** | List all files in `issues/open/`. For each file, read its frontmatter and check the `status:` field. If `status: closed`, the file is in the wrong directory. | `Glob: .project-memory/issues/open/*.md`; `Read` frontmatter of each file | **Auto-fix** |

---

# Auto-Fix Rules

Only category 5 is auto-fixed. No other category is ever auto-fixed.

**Category 5 auto-fix steps:**
1. For each `issues/open/*.md` file with frontmatter `status: closed`:
   a. Move the file to `issues/closed/` (same filename).
   b. Open `summaries/active-issues.md` and remove or update the entry for that issue to reflect it is now closed.
2. Log the action as: `Auto-fixed: moved <filename> to closed/`
3. Include this log line in the drift report output (see Output Format).

Everything outside category 5 is escalated, regardless of how clearly wrong it appears. The auto-fix rule is intentionally conservative.

---

# Output Format (On-Load)

**When findings or auto-fixes exist:**

```
[🧠] PROJECT MEMORY LOADED

[⚠️] DRIFT AUDIT — N issue(s), M auto-fixed
  • Commit orphan: K commits not tracked
    <hash1> <hash2> <hash3> ...
  • Summary stale: <filename> (Last Updated <date> < memory commit <date>)
  • Summary missing Last Updated field: <filename>
  • Stub placeholder: <filename> → "<placeholder text>" in section "<section heading>"
  • Open-phase gap: phase <id> is missing commits: <hash1> <hash2> ...
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

---

# Edge Cases

- **Trivial-commit regex:** `^(docs|chore\(lint|chore\(format|chore\(deps|chore\(memory|chore\(audit|fix\(lint`. Apply to the commit subject line (the part after the 7-char hash and space). If a commit subject matches this pattern AND no open phase exists, exclude it from the orphan list entirely. If a commit subject matches AND an open phase exists, also exclude it from the orphan list — but if the count of such trivial unattached commits exceeds 3, add a silent note: "X trivial commits not attached to open phase `<id>`" (do not escalate, do not ask the user; note only if count > 3).

- **`*(none)*` is not a stub:** `*(none)*` is the canonical placeholder for a legitimately-empty section (per SKILL.md — "Stub placeholders to clear on sight … any `*(none)*` in a section that **now has content**"). It is intentional and correct when the section truly has no content. Detecting whether a section "has content" vs. "is intentionally empty" via regex is unreliable. Do not include `*(none)*` in the stub grep patterns. If a user finds a stale `*(none)*` in a section that should have content, they can clear it manually.

- **First-run:** If `.project-memory/` does not exist, skip the audit entirely. The `init.md` path handles first-run setup; audit has no role there.

- **Summaries without `Last Updated:` field:** Do not fail the date parse. Instead, raise as a separate escalation finding: "summary missing Last Updated field: `<filename>`". This is distinct from summary staleness and is always escalated, never auto-fixed.

- **Empty `issues/open/` directory:** Category 5 produces zero findings. This is normal; do not flag it.

- **No open phases:** Category 4 produces zero findings. Normal.
