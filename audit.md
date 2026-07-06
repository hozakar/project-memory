---
name: project-memory-audit
description: Drift audit dispatcher for project-memory. Routes by active profile and MCP availability. Contains shared sections — severity model, permanent skip, era auto-clean, output format, and interactive mode — used by both MCP and FS paths.
---

# When To Run

**Context A1 — On-load header emission (synchronous):**
Emit `🧠 PROJECT MEMORY LOADED` as a synchronous indicator at session open. This is the memory-loaded header only — no audit results at this point.

**Context A2 — Post-first-response drift audit (async):**
After the LLM answers the user's first message, run the drift audit automatically (standard only — minimal skips audit entirely). Apply auto-fixes silently. Emit a single drift report block for all findings, headed by `[🧠] POST-RESPONSE DRIFT AUDIT — N auto-fixed`. If nothing found and nothing auto-fixed, emit the clean line. All findings auto-fix silently — no interactive mode needed.

**Context B — On-demand (standard profile), via `Skill project-memory audit` or natural-language triggers:**
Run when the skill is invoked with the `audit` argument OR when the user phrases a request that clearly asks for an audit / drift review of project memory (e.g. "let's audit", "review project memory", "run a drift check" — lenient detection in any language, standard only). Run detection silently, apply auto-fixes, emit the consolidated drift report. All active categories auto-fix silently — no interactive triage. Re-run detection after fixes; loop until clean. When the trigger phrase is ambiguous, ask a one-line clarification before entering audit mode. Governing rule: `DECISION-2026-06-17-audit-implicit-triggers`.

**Minimal profile:** No audit. On-load skips it; `audit` argument prints a single-line notice and exits.

---

# Post-Response Drift Audit

On-load drift audit is deferred to post-first-response. The LLM answers the user's first message first; the drift audit (active categories, raise_cat4: false) runs AFTER the first user-facing response is delivered. The drift report is emitted as a follow-up block with header `[🧠] POST-RESPONSE DRIFT AUDIT — N auto-fixed`.

Exceptions (audit runs synchronously):
1. Explicit invocation: `Skill project-memory audit` (or any natural-language audit trigger per `DECISION-2026-06-17-audit-implicit-triggers`).
2. First user message is itself an audit-implicit/explicit trigger — the LLM must run the audit synchronously to answer correctly. Threshold unchanged from current spec; false positives (user accidentally triggers an audit-tarzı message) are tolerable.
3. `minimal` profile — no audit at all; no deferral applies.

---

# Dispatcher

**At session start or on `audit` argument:**

1. Read the active `profile` from `.project-memory/config.yml`. If `profile=minimal`, exit (no audit).
2. Check if `run_audit` is in available MCP tools.
3. **If yes:** read `<profile>/audit-mcp.md` and follow its MCP Fast Path. Pass `raise_cat4: false` when running as post-first-response audit (SKILL.md step 5); pass `raise_cat4: true` when running from `Skill project-memory audit`. Skip `<profile>/audit-fs.md`.
4. **If no:** read `<profile>/audit-fs.md` and follow its file-based Detection Procedure.

`<profile>` is `standard`. The standard profile uses a reduced category set (Cat 1, 2, 3, 5, 6, 7, 8 (conditional), 12, 13 (conditional), 14 — phase-related categories retired, Cat 9 and 11 omitted).

**Semantic Conflict Scan (`semantic-conflict-scan`)** was a legacy full-only optional stage. It is no longer available in the standard profile.

The shared sections below (Severity, Permanent Skip, Era Auto-Clean, Output Format, Interactive Mode) apply to both paths and both profiles.

---

# Severity

The model has 1 effective tier:

| Severity | Categories | Behavior |
|----------|-----------|----------|
| **auto-fix** | Cat 1,2,3,5,6,7,8,12,13,14 | Applied silently; logged in drift report. |

In standard, phase-related categories retired, Cat 9 and 11 are not detected at all (not "auto-fixed silently" — simply absent).

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
| 6 | `decision-drift:<DECISION-ID>:<missing-row|orphan-row|status-mismatch>` |
| 8 | `adr-drift:<DECISION-ID>:<missing-adr_id|missing-file|status-mismatch>` |
| 9 | `discussion-drift:<DISCUSSION-ID>:<missing-row|orphan-row|status-mismatch>` |
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
```

**Phase-keyed `audit_ignore` entries:** Existing phase-keyed ignore entries in `.project-memory/config.yml` (e.g. Cat 10 phase-completeness or Cat 4 phase-gap entries) stay put — they only ever match frozen phase artifacts, are harmless, and act as a historical record of past audit suppressions. There is no need to remove them.

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

# Output Format

## Synchronous header (session open)

```
🧠 PROJECT MEMORY LOADED
```

## Deferred post-first-response report

**No intermediate messages.** During detection and auto-fix, output nothing. Do not announce findings as you discover them, do not say "auto-fixing...", do not narrate steps. Collect all findings and apply all fixes in complete silence. The consolidated report below is the only output permitted.

**When findings or auto-fixes exist:**

```
[🧠] POST-RESPONSE DRIFT AUDIT — N auto-fixed
  Auto-fixed:
  • Replaced N stub placeholder(s) in summaries/ → *(none)*
  • Synced N discussion index drift(s): M added, K removed, J fixed
  • Renamed N tag typo(s): "<old>" → "<new>" across M historical phase record(s)
  • Bumped N stale summary Last Updated date(s)
  • Synced N decision index drift(s)
  • Synced N ADR drift(s)
  • Auto-annotated: N orphan commit reference(s) across M historical phase record(s) → [orphaned YYYY-MM-DD]
  • Auto-archived: DISCUSSION-xxx → discussions/archive/
  • Auto-fixed: moved <filename> to closed/
  • MCP sync: N entries updated

  Info:
  • Cat 1: N significant commit(s) with no memory trace (last 3 days). Run `audit` to review.
```

Replace `N` with the count of auto-fixed items. Omit any bullet that has no findings.

**When zero findings AND zero auto-fixes:**

```
[🧠] POST-RESPONSE DRIFT AUDIT — clean
```

---

# Interactive Mode

When the skill is invoked as `Skill project-memory audit` (standard only):

1. Run the full detection procedure for the active profile. Collect all findings. All findings in the active categories are auto-fixed silently — no interactive triage remains.
2. Present the full drift report.
3. After all fixes are applied, re-run the full detection. If new findings appear, repeat from step 1. Loop until clean.
4. Do NOT re-run the on-load summary loading sequence.

**Question shapes per category:**

No interactive categories remain. All active categories (Cat 1,2,3,5,6,7,8,12,13,14) are auto-fixed silently. Phase-related categories have been retired. Cat 9 and 11 remain disabled.

When the user chooses `"mark ignored (permanent)"` for any finding: write the corresponding `audit_ignore` entry to `.project-memory/config.yml` immediately, then move to the next finding.
