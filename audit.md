---
name: project-memory-audit
description: Drift audit dispatcher for project-memory. Routes by active profile and MCP availability. Contains shared sections — severity model, permanent skip, era auto-clean, output format, and interactive mode — used by both MCP and FS paths.
---

# When To Run

**Context A1 — On-load header emission (synchronous):**
Emit `🧠 PROJECT MEMORY LOADED` as a synchronous indicator at session open. This is the memory-loaded header only — no audit results at this point.

**Context A2 — Post-first-response drift audit (async):**
After the LLM answers the user's first message, run the drift audit automatically (standard only — minimal skips audit entirely).
- **MCP present:** The LLM calls `run_audit(project_memory_dir, { profile: 'standard', background: true })` at session open (SKILL.md On-Load step 5). The server runs the full audit pipeline (`run_audit → apply_audit_fixes → re-run until clean`) silently in the background and returns `{ status: 'running' }` immediately. The LLM emits a single instant-ack line (e.g. `🧠 PROJECT MEMORY AUDIT — running in background`) and moves on. **NO drift report block is emitted**; all fixes apply silently to disk. No retrieval.
- **No MCP:** Fall back to the deferred file-based audit per On-Load step 5 (requires the LLM to emit the drift report as a follow-up block after the first user response).

**Context B — On-demand (standard profile), via `Skill project-memory audit` or natural-language triggers:**
Run when the skill is invoked with the `audit` argument OR when the user phrases a request that clearly asks for an audit / drift review of project memory (e.g. "let's audit", "review project memory", "run a drift check" — lenient detection in any language, standard only). Run detection silently, apply auto-fixes, emit the consolidated drift report. All active categories auto-fix silently — no interactive triage. Re-run detection after fixes; loop until clean. When the trigger phrase is ambiguous, ask a one-line clarification before entering audit mode. Governing rule: `DECISION-2026-06-17-audit-implicit-triggers`.

**Minimal profile:** No audit. On-load skips it; `audit` argument prints a single-line notice and exits.

---

# Post-Response Drift Audit

On-load drift audit is deferred to post-first-response.

## MCP present — silent background auto-run

At session open, the LLM calls `run_audit(project_memory_dir, { profile: 'standard', background: true })`. The MCP server starts the chained pipeline (`run_audit → apply_audit_fixes → re-run until clean`) silently in the background and returns `{ status: 'running' }` immediately. The LLM emits a single instant-ack line — e.g. `🧠 PROJECT MEMORY AUDIT — running in background` — and moves on to answer the user. NO drift report block is emitted; all fixes apply silently to disk. No retrieval.

## No MCP — deferred file-based audit

The LLM answers the user's first message first; the drift audit (active categories) runs AFTER the first user-facing response is delivered. The drift report is emitted as a follow-up block with header `[🧠] POST-RESPONSE DRIFT AUDIT — N auto-fixed`.

## Exceptions (audit runs synchronously):
1. Explicit invocation: `Skill project-memory audit` (or any natural-language audit trigger per `DECISION-2026-06-17-audit-implicit-triggers`). Uses the synchronous `run_audit` form (background omitted/false) — returns the full `{auto_fixed, pending_fixes}` result.
2. First user message is itself an audit-implicit/explicit trigger — the LLM must run the audit synchronously to answer correctly. Threshold unchanged from current spec; false positives (user accidentally triggers an audit-tarzı message) are tolerable.
3. `minimal` profile — no audit at all; no deferral applies.

---

# Dispatcher

**At session start or on `audit` argument:**

1. Read the active `profile` from `.project-memory/config.yml`. If `profile=minimal`, exit (no audit).
2. Check if `run_audit` is in available MCP tools.
3. **If yes:** read `<profile>/audit-mcp.md` and follow its MCP Fast Path (the same `run_audit(project_memory_dir, { profile: "standard" })` call shape applies to both on-load and explicit invocation). Skip `<profile>/audit-fs.md`.
4. **If no:** read `<profile>/audit-fs.md` and follow its file-based Detection Procedure.

`<profile>` is `standard`. The standard profile uses a reduced category set (5, 6, 8 (conditional), 9, 11, 13 (conditional), 14 — phase-related categories retired, Cat 7 and 12 dropped).

**Semantic Conflict Scan (`semantic-conflict-scan`)** was a legacy full-only optional stage. It is no longer available in the standard profile.

The shared sections below (Severity, Permanent Skip, Era Auto-Clean, Output Format, Interactive Mode) apply to both paths and both profiles.

---

# Severity

All findings use a single Auto-fix tier — they are either auto-fixed directly or queued as deterministic `pending_fixes` (applied by `apply_audit_fixes`):

| Category | Behavior |
|----------|----------|
| 5 (misplaced issues) | Auto-fixed: moved from `open/` to `closed/` |
| 6 (decision index drift) | Queued as `pending_fixes` (missing rows, status mismatches); orphan rows auto-removed |
| 8 (ADR sync drift, conditional on `adr_enabled`) | Queued as `pending_fixes` (missing ADR IDs, missing ADR files) |
| 9 (discussion index drift) | Queued as `pending_fixes` (missing rows, status mismatches); orphan rows auto-removed |
| 11 (discussion expiry auto-archive) | Auto-fixed: archived to `discussions/archive/` |
| 13 (MCP consistency, conditional) | Auto-fixed: missing notes re-indexed, orphaned records deleted from DB |
| 14 (assignment integrity: 14a target orphan, 14b stale pending, 14c completed without evidence) | Auto-fixed: frontmatter annotated with `target_orphaned_at`, `reminded: true`, or `completed_without_evidence_at` |

---

# Permanent Skip

Before suppressing any finding (auto-fix or pending fix), check the `audit_ignore` list in `.project-memory/config.yml`. If a finding's fingerprint matches an entry's `key`, suppress it — omit from `auto_fixed`/`pending_fixes`.

**Matching rules:**
- Exact match: `key` equals the finding fingerprint exactly (backward-compatible).
- Pattern match: `key` contains `*` as a wildcard. A `*` matches any sequence of characters in that segment. Examples:
  - `tag-typo:*:skil-md` — matches any phase with tag typo "skil-md"
  - `phase-completeness:phase-2026*:*.md` — matches missing files across a cohort of phases
  - `assignment-orphan:ASSIGNMENT-*` — matches all orphan-target assignment findings (Cat 14)
- Patterns are checked AFTER exact matches. If an exact match exists, pattern matching is skipped for that finding.
- Pattern matching is glob-style: `*` matches within a single segment (between `:` delimiters). To match across segments, use multiple `*` wildcards.

**Fingerprint format per category:**

| # | Key format |
|---|---|
| 2 | `summary:<filename>` |
| 6 | `decision-drift:<DECISION-ID>:<missing-row|orphan-row|status-mismatch>` |
| 8 | `adr-drift:<DECISION-ID>:<missing-adr_id|missing-file|status-mismatch>` |
| 9 | `discussion-drift:<DISCUSSION-ID>:<missing-row|orphan-row|status-mismatch>` |
| 14 | `assignment-orphan:<ASSIGNMENT-ID>` / `assignment-stale:<ASSIGNMENT-ID>` / `assignment-no-evidence:<ASSIGNMENT-ID>` |

**`config.yml` format:**

```yaml
audit_ignore:

```

**Phase-keyed `audit_ignore` entries:** Existing phase-keyed ignore entries in `.project-memory/config.yml` (e.g. Cat 10 phase-completeness or Cat 4 phase-gap entries) stay put — they only ever match frozen phase artifacts, are harmless, and act as a historical record of past audit suppressions. There is no need to remove them.

When the user chooses "mark ignored" during interactive triage, write the entry to `config.yml` immediately before moving to the next finding.

---

# Era-Based Auto-Clean

When an era (`era-NNN.md`) is created or updated in `.project-memory/eras/`:

1. Read the new or updated era file's frontmatter `records:` list and `date_range:` field — these define the scope of records (DECISION-* / DISCUSSION-* docs) covered by this era.
2. Open `.project-memory/config.yml` and read the `audit_ignore` list (if absent, nothing to clean — skip).
3. For each `audit_ignore` entry, check whether its `key` references any record ID in the era's `records` list. A reference is any match where the record ID appears as a segment in the key (between `:` delimiters or as the full key for single-segment keys).
4. Remove any entry that matches — the record is now archived in an era, so suppressing its findings is no longer needed.
5. If entries were removed, log: `Era auto-clean: removed N audit_ignore entry/entries for archived record(s) in era-XXX` (with `date_range: YYYY-MM-DD to YYYY-MM-DD` appended).
6. This cleanup runs automatically when the era is created/updated. Do NOT prompt the user — it is a maintenance operation.

> **Backward compatibility:** Legacy era files using a `phases:` field (instead of `records:` + `date_range:`) are treated as historical records. Their `phases` list is not auto-cleaned by this procedure — the phase-keyed ignore entries they reference are left in place as a historical record of past suppressions.

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
  • Synced N discussion index drift(s): M added, K removed, J fixed
  • Renamed N tag typo(s): "<old>" → "<new>" across M historical phase record(s)
  • Synced N decision index drift(s)
  • Synced N ADR drift(s)
  • Auto-archived: DISCUSSION-xxx → discussions/archive/
  • Auto-fixed: moved <filename> to closed/
  • MCP sync: N entries updated

```

Replace `N` with the count of auto-fixed items. Omit any bullet that has no findings.

**When zero findings AND zero auto-fixes:**

```
[🧠] POST-RESPONSE DRIFT AUDIT — clean
```

---

# Interactive Mode

When the skill is invoked as `Skill project-memory audit` (standard only):

1. Run the full detection procedure for the active profile. Collect all findings. Auto-fix categories are applied silently; only interactive findings (where `interactive: true`) are presented for triage.
2. For each interactive finding, enter interactive triage using the question shapes below. After the user responds, apply the resolution.
3. After all interactive findings are resolved and non-interactive findings auto-fixed, re-run the full detection. If new findings appear, repeat from step 1. Loop until clean.
4. Do NOT re-run the on-load summary loading sequence.

**Question shapes per category:**

**Cat 14a — Orphaned assignment target (≤3 days old, medium severity)**

An assignment's `targetType`/`targetId` points to a file that does not exist. The assignment may have been superseded, completed offline, or the file may have been renamed or removed.

For each such finding, raise one question:

> Assignment `<id>` targets `<targetId>`, which was not found. Is this assignment still relevant?
> * **Reassign** — update the target to an existing file.
> * **Close** — mark as no longer needed (set `status: rejected` or `status: completed` with a note).
> * **Convert to a note** — save the content as a NOTE record.
> * **Mark ignored** — write to `audit_ignore` in `config.yml` and suppress future findings.

When the user chooses "Mark ignored" or "mark ignored (permanent)" for any finding: write the corresponding `audit_ignore` entry to `.project-memory/config.yml` immediately, then move to the next finding.
