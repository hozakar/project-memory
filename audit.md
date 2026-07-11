---
name: project-memory-audit
description: Drift audit dispatcher for project-memory. Routes by active profile and MCP availability. Contains shared sections — severity model, permanent skip, output format, and interactive mode — used by both MCP and FS paths.
---

# When To Run

**Context A1 — On-load header emission (synchronous):**
Emit `🧠 PROJECT MEMORY LOADED` as a synchronous indicator at session open. This is the memory-loaded header only — no audit results at this point.

**Context A2 — Post-first-response drift audit (async):**
After the LLM answers the user's first message, run the drift audit automatically (standard only — minimal skips audit entirely).
- **MCP present:** The LLM calls `run_audit(project_memory_dir, { profile: 'standard', background: true })` at session open (SKILL.md On-Load step 5). The server runs the full audit pipeline (`run_audit → apply_audit_fixes → re-run until clean`) silently in the background and returns `{ status: 'running' }` (audit starting/in-progress) or `{ status: 'done' }` (audit already completed moments ago). The LLM emits a single instant-ack line (e.g. `🧠 PROJECT MEMORY AUDIT — running in background`) and moves on. **NO drift report block is emitted**; all fixes apply silently to disk. No retrieval.
  
  > **Concurrency guarantees:** Concurrent triggers (server head-start + SKILL.md call) deduplicate via a normalized in-flight guard. Manual `run_audit` / `apply_audit_fixes` calls serialize against the background run via a per-dir async mutex.
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

`<profile>` is `standard`. The standard profile uses a reduced category set (5, 6, 8 (conditional), 9, 11, 13 (conditional), 14, 15 — phase-related categories retired, Cat 7 and 12 dropped).

**Semantic Conflict Scan (`semantic-conflict-scan`)** is an optional final stage of the interactive (manual) audit, gated by: user-triggered audit + MCP available + profile=standard + at least one non-superseded active decision. It narrows candidate pairs via the `find_decision_conflicts` MCP tool (pairwise embedding similarity → top-K), then the LLM evaluates each pair with an ambiguity-test self-prompt (yes/no only). Up to 2 findings are escalated to the user (plus 1 user-initiated). Resolution: user answers → new superseding DECISION (`provenance: directive`); user dismisses → permanent `audit-ignore` entry (`decision-contradiction:<ID1>:<ID2>`). See `DECISION-2026-06-17-semantic-conflict-scan` for full spec.

The shared sections below (Severity, Permanent Skip, Output Format, Interactive Mode) apply to both paths and both profiles.

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
| 15 (decision supersession integrity) | Auto-fixed: dangling pointers (supersedes/superseded_by cleared), asymmetric supersession (missing superseded_by link restored), circular supersession (cycle broken), orphan-superseded (status restored to active); pending_fix: zombie-active (status flipped to superseded, index row moved to Superseded table) |

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
| 15 | `decision-supersession:<DECISION-ID>:<dangling|zombie|asymmetric|circular|orphan-superseded>` |

**`config.yml` format:**

```yaml
audit_ignore:

```

**Phase-keyed `audit_ignore` entries:** Existing phase-keyed ignore entries in `.project-memory/config.yml` (e.g. Cat 10 phase-completeness (retired) or Cat 4 phase-gap (retired) entries) stay put — they only ever match frozen phase artifacts, are harmless, and act as a historical record of past audit suppressions. There is no need to remove them.

Manually add the ignored finding's fingerprint to `audit_ignore` in `config.yml` to suppress future occurrences.
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

# Explicit (Synchronous) Audit Invocation

When the skill is invoked as `Skill project-memory audit` (standard only), the audit runs synchronously and returns structured results — no interactive triage flow exists:

1. Call `run_audit(project_memory_dir, { profile: "standard" })` (background omitted/false). The MCP server scans all 8 active categories and returns `{ auto_fixed, pending_fixes }`.
2. If `apply_audit_fixes` is available, forward the entire `pending_fixes` array to `apply_audit_fixes(project_memory_dir, pending_fixes)`. The tool returns `{ applied, partial, failed, rerun_audit_recommended }`.
3. If `apply_audit_fixes` is NOT available, apply each `pending_fix` manually (edit frontmatter, index rows, etc.).
4. Re-run the full detection. If new findings appear, repeat from step 1. Loop until clean.
5. Do NOT re-run the on-load summary loading sequence.

All findings are either auto-fixed directly (Cat 5, 11, 13, 14a/14c, 15 dangling/asymmetric/circular/orphan-superseded) or queued as deterministic `pending_fixes` (Cat 6, 8, 9, 15 zombie-active) — there are no findings requiring user triage. Suppressions via `audit_ignore` (see Permanent Skip) are configured manually in `config.yml` outside the audit flow.

---

# Semantic Conflict Scan

An optional final stage of the interactive audit (`Skill project-memory audit`, standard profile only). Runs AFTER all structural audit categories are clean.

## Gating (all four must hold)

1. **User-triggered audit only.** Never runs in the background auto-run.
2. **MCP available.** When MCP is unreachable, the stage is silently skipped.
3. **Profile = `standard`.** `minimal` skips silently.
4. **At least one non-superseded active decision** in `decisions/index.md` Active section.

When gating holds, prompt the user at the end of the structural audit:

> "Run semantic conflict scan? (y/N)"

Default `n`. On `n` or skip, audit finishes.

## Candidate Funnel

1. Call `find_decision_conflicts(project_memory_dir, { threshold: 0.75, top_k: 10 })`.
2. The tool returns candidate pairs of active decisions with high embedding similarity, excluding pairs already in `audit_ignore`.

## LLM Self-Prompt (per pair)

For each candidate pair (A, B), the LLM asks itself:

> "If I tried to apply decision A today, would decision B require me to do something different in the same situation? And if so, is it ambiguous which one I should follow?"

Outputs:
- **no** — drop, no logging.
- **yes** — eligible for user-facing escalation.

If uncertain, err toward `no` — the next manual audit will re-evaluate.

## Escalation Budget

- **Hard cap: 2 user-facing questions per audit.**
- After the budget is consumed, if the user explicitly asks ("anything else?", "what else do you have?"), **one additional finding** may be escalated. The +1 slot is user-initiated only.
- **Skip does not refund.** If the user dismisses a question, that slot is consumed.

## User-Facing Question Shape

> "On `<date-A>` we decided: `<claim A>` (`<DECISION-A-id>`).
> On `<date-B>` we decided: `<claim B>` (`<DECISION-B-id>`).
> These may conflict because `<one-sentence reason>`. If this situation came up, I might be unsure which to follow. How should I resolve this?"

User response options:
- **Answer** — explain how to resolve. LLM proceeds to the supersede write step.
- **"Ignore"** — pair is added to `audit_ignore` in `config.yml` as `decision-contradiction:<ID1>:<ID2>` (permanent, manual removal to re-enable). Slot consumed.

## Supersede Write Step

When the user provides a resolution, the LLM writes a new DECISION file:
- Naming and frontmatter follow `conventions/decisions.md`.
- `provenance: directive` (the user explicitly resolved the conflict).
- `supersedes: [<DECISION-id-of-the-one-being-overridden>]` — usually one ID; may be multiple.
- `context` section notes: *"Created via `semantic-conflict-scan` on `<date>`. User resolved a potential conflict between `<DECISION-A-id>` and `<DECISION-B-id>` with the following directive: `<paraphrase>`."*
- All standard post-write steps: update `decisions/index.md` (move superseded row to Superseded section, add new row to Active), update superseded decision's `superseded_by` and `status`, append git identity to `contributors`, dedup by email.
- If `adr_enabled: true`, also create the ADR mirror. If `adr_enabled: false`, skip.
