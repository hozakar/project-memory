---
name: project-memory-audit
description: Drift audit dispatcher for project-memory. Routes to audit-mcp.md (MCP fast path) or audit-fs.md (file-system detection) based on run_audit availability. Contains shared sections: severity model, permanent skip, era auto-clean, output format, and interactive mode.
---

# When To Run

**Context A — On-load (passive), via SKILL.md step 3:**
Run automatically every session. Apply auto-fixes silently. Emit a single drift report block for all findings. If nothing found and nothing auto-fixed, emit the clean line. If any interactive-triage findings remain after auto-fix, immediately transition into Interactive Mode.

**Context B — On-demand (interactive), via `Skill project-memory audit`:**
Run when the skill is explicitly invoked with the `audit` argument. Same detection logic, but prompt the user for each interactive finding via `AskUserQuestion`. Re-run detection after decisions; loop until clean.

---

# Dispatcher

**At session start or on `audit` argument:**

1. Check if `run_audit` is in available MCP tools.
2. **If yes:** read `audit-mcp.md` and follow its MCP Fast Path — MCP-driven detection in a single `run_audit` call. Skip `audit-fs.md`.
3. **If no:** read `audit-fs.md` and follow its file-based Detection Procedure across all 14 categories.

The shared sections below (Severity, Permanent Skip, Output Format, Interactive Mode) apply to BOTH paths.

---

# Severity

The model has 2 effective tiers:

| Severity | Categories | Behavior |
|----------|-----------|----------|
| **high** | Cat 4 | Heuristic auto-resolves same-user commits. Escalates only on author mismatch or ambiguous file matching. |
| **auto-fix** | Cat 1,2,3,5,6,7,8,9,10,11,12,13,14 | Applied silently; logged in drift report. |

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
| 14 | `assignment-orphan:<ASSIGNMENT-ID>` / `assignment-stale:<ASSIGNMENT-ID>` / `assignment-no-evidence:<ASSIGNMENT-ID>` |

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

Cat 4 is the only interactive category. All others (Cat 1,2,3,5,6,7,8,9,10,11,12,13,14) are auto-fixed silently.

- **Open-phase commit gap (simplified):** Only escalated when heuristic can't resolve.
  "Open phase <id> has <N> commit(s) by <author> that couldn't be auto-assigned. What should I do?"
  Options: "add to this phase", "open new phase", "close current phase", "skip", "mark ignored"

When the user chooses `"mark ignored (permanent)"` for any finding: write the corresponding `audit_ignore` entry to `.project-memory/config.yml` immediately, then move to the next finding.
