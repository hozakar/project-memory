---
name: project-memory-audit-fs
description: File-system drift audit detection procedure for the standard profile. 7 active categories (phase-related categories retired, Cat 7, 12 dropped).
---

# Detection Procedure (standard)

**Invocation:** at post-first-response hook (default), or on explicit `Skill project-memory audit` (sync), or when first user message is an audit-implicit-trigger (sync).

Run all 7 active categories on every audit pass. Collect findings before acting. Check `audit_ignore` (see `audit.md` → Permanent Skip) before escalating any finding — suppressed findings are omitted entirely.

**Active categories in standard:** 5, 6, 8 (conditional on `adr_enabled`), 9, 11, 13 (conditional on MCP), 14.

**Retired in standard:** Phase-related categories (open-phase gaps, phase file completeness) — retired when the phase concept was dropped. Cat 9 and Cat 11 (discussion hygiene) ARE active: Cat 9 reports discussion index drift (low severity, non-interactive); Cat 11 auto-archives discussions with outcome: none older than 30 days.

---

# Categories

| # | Category | Detection Rule | Tool Calls | Classification | Severity |
|---|---|---|---|---|---|
| 5 | **Misplaced issue files** | `issues/open/*.md` with `status: closed` → move to `issues/closed/`. **No-op when issues feature unused.** | `Glob: issues/open/*.md`; `Read` frontmatter | **Auto-fix** | — |
| 6 | **Decision index drift** | DECISION files vs `decisions/index.md` rows; missing rows → pendingFix; orphan rows → auto-remove; status mismatch → auto-resolve from file. | `Glob: decisions/DECISION-*.md`; `Read: decisions/index.md` | **Auto-fix** | — |
| 8 | **ADR sync drift (conditional)** | Only fires if `config.yml.adr_enabled: true`. Default is `adr_enabled: false` (no ADR scaffolding), so Cat 8 is typically a no-op. | `Read: config.yml`; `Glob/Read: decisions/`; `Glob: <adr_dir>` | **Auto-fix** | — |
| 9 | **Discussion index drift** | DISCUSSION files vs discussions/index.md rows; missing row / status mismatch / orphan row. | Glob: discussions/DISCUSSION-*.md; Read: discussions/index.md | **Report (low, non-interactive)** | low |
| 11 | **Discussion expiry** | DISCUSSION with outcome: none and age > 30 days → archive. | Glob: discussions/DISCUSSION-*.md; Read frontmatter | **Auto-fix** | — |
| 13 | **MCP consistency (conditional)** | Runs only if MCP `check_consistency` tool is available. Indexes any IDs found on disk but not in DB. | MCP: `check_consistency`; `Read` files for missing IDs; MCP: `index_*` tools | **Auto-fix** | — |
| 14 | **Assignment integrity** | 14a (target_id orphan), 14b (stale pending), 14c (completed without evidence). **No-op when assignments feature unused.** | `Glob: assignments/*.md`; `Read` frontmatter | **Auto-fix** | **low/medium** |

---

# Auto-Fix Rules

The auto-fix rules are identical to the legacy full profile for every active category. Phase-related categories (open-phase gaps, phase file completeness) are retired — no auto-fix rules apply.

---

Phase-related open-phase gap auto-assignment heuristic is retired — no longer applies.

---

# Edge Cases

Edge cases from the legacy full `audit-fs.md` apply unchanged for all active categories, with these standard-specific notes:

- **Phase-related categories retired:** these categories are removed. Their historical findings are not detected. Existing `audit_ignore` entries keyed on retired category numbers in `.project-memory/config.yml` are harmless — they only ever match frozen phase artifacts and act as a historical record.
- **Cat 9, 11 — active:** Cat 9 detects discussion index drift (missing rows, status mismatches, orphan rows) as low-severity non-interactive reports. Cat 11 auto-archives discussions with outcome: none older than 30 days to discussions/archive/ and removes their index rows.
- **Cat 13 — MCP consistency on historical records:** Legacy phase records are re-indexed automatically by `rebuild_index` when the historical phases/ directory is walked — there is no public tool to re-index a single phase. The records still have searchable content via plan.md (if present) and the per-commit records.
- **`adr_enabled` default:** `init.md` does NOT scaffold `adr_enabled: true`. The flag defaults to `false`.
