---
name: project-memory-audit
description: Drift audit dispatcher for project-memory. Routes by active profile and MCP availability. Contains shared sections — permanent skip, output format, and interactive mode — used by both MCP and FS paths.
---

# When To Run

**Context A1 — On-load header emission:**
```
🧠 PROJECT MEMORY LOADED
```
No audit results at this point.

**Context A2 — Post-first-response drift audit:** Deferred to post-first-response. MCP: silent background auto-run (see `standard/audit-mcp.md`). No MCP: deferred file-based audit (see `standard/audit-fs.md`). Exceptions: explicit invocation, first-message audit trigger, minimal.

**Context B — On-demand (standard only):** Run via `Skill project-memory audit` or natural triggers (lenient detection: recognize intent in any language, ask clarification when ambiguous). Run detection silently, apply auto-fixes, emit report. Re-run until clean.

**Minimal:** No audit. On-load skips it; `audit` prints a single-line notice and exits.

---

# Dispatcher

**At session start or on `audit` argument:**

1. Read `profile` from `.project-memory/config.yml`. If `minimal`, exit.
2. If `run_audit` in available MCP tools: read `<profile>/audit-mcp.md` and follow its MCP Fast Path. Skip `<profile>/audit-fs.md`.
3. Else: read `<profile>/audit-fs.md` and follow file-based Detection Procedure.

`<profile>` is standard. See `standard/audit-fs.md` for active categories.

**Semantic Conflict Scan** is an optional final stage of interactive audit, gated by: user-triggered audit + MCP + standard + ≥1 active decision. Uses `find_decision_conflicts`, then LLM evaluates pairs. Up to 2 findings escalated (+1 user-initiated). Resolution: answer → superseding DECISION; dismiss → `audit-ignore` entry. See Semantic Conflict Scan procedure: user-triggered, 4 gating conditions, 2+1 escalation budget, answer→superseding DECISION or ignore→audit-ignore.

Shared sections below (Permanent Skip, Output Format, Interactive Mode) apply to both paths.

---

# Severity

All findings use a single Auto-fix tier — auto-fixed directly or queued as `pending_fixes`. See `standard/audit-fs.md` for per-category resolution behavior.

---

# Permanent Skip

Before suppressing any finding, check `audit_ignore` in `.project-memory/config.yml`. If a finding's fingerprint matches an entry's `key`, suppress it.

**Matching:** Exact match preferred. Pattern match: `*` matches any sequence within a segment (`:` delimiters). Patterns checked after exact matches.

**Fingerprint format per category:**

| # | Key format |
|---|---|
| 2 | `summary:<filename>` |
| 6 | `decision-drift:<DECISION-ID>:<missing-row|orphan-row|status-mismatch>` |
| 8 | `adr-drift:<DECISION-ID>:<missing-adr_id|missing-file|status-mismatch>` |
| 9 | `discussion-drift:<DISCUSSION-ID>:<missing-row|orphan-row|status-mismatch>` |
| 15 | `decision-supersession:<DECISION-ID>:<dangling|zombie|asymmetric|circular|orphan-superseded>` |

**config.yml format:** ```yaml audit_ignore: ``` Phase-keyed ignore entries for retired categories stay put — only match frozen phase artifacts, harmless historical record.

---

# Output Format

## Deferred post-first-response report
No intermediate messages. Collect findings and apply fixes in silence. Only output below.

**When findings exist:**
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
Replace `N` with count. Omit any bullet with no findings.

**When zero findings AND zero auto-fixes:**
```
[🧠] POST-RESPONSE DRIFT AUDIT — clean
```

---

# Explicit (Synchronous) Audit Invocation

When invoked as `Skill project-memory audit` (standard only):

1. Call `run_audit(project_memory_dir, { profile: "standard" })`. Returns `{ auto_fixed, pending_fixes }`.
2. Forward `pending_fixes` to `apply_audit_fixes(...)`. Handle `partial` entries' `llm_must_do`. If NOT available, apply each `pending_fix` manually.
3. Re-run detection. Loop until clean.
4. Do NOT re-run on-load summary loading sequence.

All structural findings are auto-fixed directly (Cat 5, 11, 13, 14a/14c, 15 dangling/asymmetric/circular/orphan-superseded) or queued as `pending_fixes` (Cat 6, 8, 9, 15 zombie-active). User triage only in Interactive Mode. Suppressions via `audit_ignore` configured manually.

---

# Interactive Mode (semantic contradictions)

An optional user-triggered stage that escalates potential decision conflicts to the user. Never entered automatically. See `standard/audit-mcp.md` → Semantic Conflict Scan for full procedure (user-triggered, 4 gating conditions, 2+1 escalation budget, answer→superseding DECISION or ignore→audit-ignore).

**Scope:** Semantic contradictions between active decisions where the LLM cannot deterministically choose. Structural drift handled by Silent Auto-Fix mode.

**Four gating conditions** (all must hold):
1. User-triggered audit only.
2. MCP available (requires `find_decision_conflicts`).
3. Profile = `standard`.
4. At least one non-superseded active decision.

**Escalation budget:** Up to 2 questions per audit (+1 if user asks "what else?").

**User responses:**
- **Answer** → LLM writes superseding DECISION (`provenance: directive`) and updates records.
- **"Ignore"** → pair added to `audit_ignore` as `decision-contradiction:<ID1>:<ID2>`. Permanent until manual removal.
