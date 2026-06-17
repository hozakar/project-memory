---
name: project-memory-audit
description: Drift audit dispatcher for project-memory. Routes by active profile and MCP availability. Contains shared sections — severity model, permanent skip, era auto-clean, output format, and interactive mode — used by both MCP and FS paths.
---

# When To Run

**Context A — On-load (passive), via SKILL.md step 5:**
Run automatically every session (full and lite only — minimal skips audit entirely). Apply auto-fixes silently. Emit a single drift report block for all findings. If nothing found and nothing auto-fixed, emit the clean line. If any interactive-triage findings remain after auto-fix, immediately transition into Interactive Mode.

**Context B — On-demand (interactive), via `Skill project-memory audit` or natural-language triggers:**
Run when the skill is invoked with the `audit` argument OR when the user phrases a request that clearly asks for an audit / drift review of project memory (e.g. "let's audit", "review project memory", "run a drift check" — lenient detection in any language, full and lite only). Same detection logic, but prompt the user for each interactive finding via `AskUserQuestion`. Re-run detection after decisions; loop until clean. When the trigger phrase is ambiguous, ask a one-line clarification before entering audit mode. Governing rule: `DECISION-2026-06-17-audit-implicit-triggers`.

**Minimal profile:** No audit. On-load skips it; `audit` argument prints a single-line notice and exits.

---

# Dispatcher

**At session start or on `audit` argument:**

1. Read the active `profile` from `.project-memory/config.yml`. If `profile=minimal`, exit (no audit).
2. Check if `run_audit` is in available MCP tools.
3. **If yes:** read `<profile>/audit-mcp.md` and follow its MCP Fast Path. Skip `<profile>/audit-fs.md`.
4. **If no:** read `<profile>/audit-fs.md` and follow its file-based Detection Procedure.

`<profile>` is `full` or `lite`. The lite versions enumerate a reduced category set (Cat 1, 2, 3, 4, 5, 6, 7, 8 (conditional), 10 (modified), 12, 13 (conditional), 14 — Cat 9 and 11 omitted).

**Semantic Conflict Scan (`semantic-conflict-scan`)** is an optional final stage of interactive audit, separate from the numbered categories. It runs *only* when all four gates pass: (1) audit was triggered via `Skill project-memory audit` (not on-load), (2) MCP is available, (3) `profile=full`, (4) `decisions/index.md` Active section is non-empty. When gated out, it is silently skipped — no prompt is shown. Procedure lives in `full/audit-mcp.md`. Governing rules: `DECISION-2026-06-17-semantic-conflict-scan`.

The shared sections below (Severity, Permanent Skip, Era Auto-Clean, Output Format, Interactive Mode) apply to both paths and both profiles.

---

# Severity

The model has 2 effective tiers:

| Severity | Categories | Behavior |
|----------|-----------|----------|
| **high** | Cat 4 | Heuristic auto-resolves same-user commits. **On-load:** unresolved findings shown as `info` — non-blocking, no triage. **Manual audit:** escalates to interactive triage. |
| **auto-fix** | Cat 1,2,3,5,6,7,8,9,10,11,12,13,14 | Applied silently; logged in drift report. |

In lite, Cat 9 and 11 are not detected at all (not "auto-fixed silently" — simply absent).

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

# Profile-aware migration semantics

For profile-sensitive checks (notably Cat 10 file-completeness), consult `config.yml → profile_history` rather than the current `profile` field. A phase whose `started_at` falls within a `lite` window is expected to have only `phase.yml` (+ optional `plan.md`), regardless of the currently active profile. This prevents upgrade-to-`full` from retroactively flagging historical lite phases as incomplete.

---

# Output Format (On-Load)

**No intermediate messages.** During detection and auto-fix, output nothing. Do not announce findings as you discover them, do not say "auto-fixing...", do not narrate steps. Collect all findings and apply all fixes in complete silence. The consolidated report below is the only output permitted.

**When findings or auto-fixes exist:**

```
[🧠] PROJECT MEMORY LOADED

[⚠️] DRIFT AUDIT — N auto-fixed
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
  • Cat 4: N open-phase gap(s) — commit(s) couldn't be auto-assigned. Run `audit` to resolve.
```

Replace `N` with the count of auto-fixed items. Omit any bullet that has no findings.

**When zero findings AND zero auto-fixes:**

```
[🧠] PROJECT MEMORY LOADED — drift audit clean
```

---

# Interactive Mode

When the skill is invoked as `Skill project-memory audit` (full or lite only):

1. Run the full detection procedure for the active profile. Collect all findings — only Cat 4 findings that couldn't be auto-resolved enter interactive triage.
2. Present the full drift report.
3. For each **interactive-triage** finding, use `AskUserQuestion`. Apply their decision immediately before moving to the next.
4. All auto-fix findings are handled silently; only Cat 4 unresolved findings are prompted.
5. After all decisions are applied, re-run the full detection. If new interactive-triage findings appear, repeat from step 3. Loop until clean.
6. Do NOT re-run the on-load summary loading sequence.

**Question shapes per category:**

Cat 4 is the only interactive category among the numbered set. All others (Cat 1,2,3,5,6,7,8,9,10,11,12,13,14) are auto-fixed silently. A second interactive surface — `semantic-conflict-scan` — runs *after* Cat 1–14 finish, only when all four gates pass (user-triggered + MCP + `profile=full` + non-empty active decisions). It is opt-in per audit (default `n`) and is not a category — see `full/audit-mcp.md` for the procedure.

- **Open-phase commit gap (simplified):** Only escalated when heuristic can't resolve.
  "Open phase <id> has <N> commit(s) by <author> that couldn't be auto-assigned. What should I do?"
  Options: "add to this phase", "open new phase", "close current phase", "skip", "mark ignored"

When the user chooses `"mark ignored (permanent)"` for any finding: write the corresponding `audit_ignore` entry to `.project-memory/config.yml` immediately, then move to the next finding.
