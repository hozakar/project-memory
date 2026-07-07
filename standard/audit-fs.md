---
name: project-memory-audit-fs
description: File-system drift audit detection procedure for the standard profile. 9 active categories (phase-related categories retired, Cat 9, 11 disabled).
---

# Detection Procedure (standard)

**Invocation:** at post-first-response hook (default), or on explicit `Skill project-memory audit` (sync), or when first user message is an audit-implicit-trigger (sync).

Run all 9 active categories on every audit pass. Collect findings before acting. Check `audit_ignore` (see `audit.md` → Permanent Skip) before escalating any finding — suppressed findings are omitted entirely.

**Active categories in standard:** 2, 3, 5, 6, 7, 8 (conditional on `adr_enabled`), 12, 13 (conditional on MCP), 14.

**Disabled in standard:** Phase-related categories retired (open-phase gaps, phase file completeness), Cat 9 (discussion index drift), Cat 11 (discussion expiry). If you use discussions in a project, you are responsible for index hygiene and archival manually. The features are still available — only the automated checks are dropped.

---

# Categories

| # | Category | Detection Rule | Tool Calls | Classification | Severity |
|---|---|---|---|---|---|
| 2 | **Summary staleness** | Bump `Last Updated:` if older than most recent project commit. **Only checks 2 summaries:** `summaries/roadmap.md`, `summaries/current-state.md`. *Write trigger (anchored to turn-boundary sweep per `gates.md`):* "The turn-boundary sweep fires at turn end; if the turn included a commit it updates `.project-memory/summaries/current-state.md` once (covering the turn's commits) and `.project-memory/summaries/roadmap.md` when the turn changed scope." | `Bash: git log -1 --format=%cs`; `Read summaries/*.md` | **Auto-fix** | — |
| 3 | **Stub placeholders** | Grep `summaries/*.md` for `None recorded yet`, `TBD`, `system just initialized`, `first run detected` → replace with `*(none)*`. **Only operates on 2 summaries.** | `Grep` over `.project-memory/summaries/*.md` | **Auto-fix** | **low** |
| 5 | **Misplaced issue files** | `issues/open/*.md` with `status: closed` → move to `issues/closed/`. **No-op when issues feature unused.** | `Glob: issues/open/*.md`; `Read` frontmatter | **Auto-fix** | — |
| 6 | **Decision index drift** | DECISION files vs `decisions/index.md` rows; missing rows → pendingFix; orphan rows → auto-remove; status mismatch → auto-resolve from file. | `Glob: decisions/DECISION-*.md`; `Read: decisions/index.md` | **Auto-fix** | — |
| 7 | **Orphan commit references** | Collect hashes from historical phase records; batch-check with `git cat-file --batch-check`; annotate missing with `[orphaned YYYY-MM-DD]`. | `Bash: git cat-file --batch-check` | **Auto-fix** | — |
| 8 | **ADR sync drift (conditional)** | Only fires if `config.yml.adr_enabled: true`. Default is `adr_enabled: false` (no ADR scaffolding), so Cat 8 is typically a no-op. | `Read: config.yml`; `Glob/Read: decisions/`; `Glob: <adr_dir>` | **Auto-fix** | — |
| 9 | **DISABLED in standard** | Discussion index drift not checked. Manual hygiene. | — | — | — |
| 11 | **DISABLED in standard** | Discussion expiry not checked. Manual archival. | — | — | — |
| 12 | **Tag inconsistency** | Levenshtein distance on tags in historical phase records; skip if < 5 unique tags; flag pairs with distance 1-2; auto-rename when confident, suppress with audit_ignore when uncertain. | — | **Auto-fix** | **low** |
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

- **Cat 2 — summaries:** the staleness check operates only on `roadmap.md` and `current-state.md`. The other 3 summary files (`project-memory.md`, `active-issues.md`, `architecture.md`) are not present and not checked. If a user manually creates them, they are NOT auto-bumped — standard does not assume responsibility for non-default summary files.
- **Phase-related categories retired:** these categories are removed. Their historical findings are not detected. Existing `audit_ignore` entries keyed on retired category numbers in `.project-memory/config.yml` are harmless — they only ever match frozen phase artifacts and act as a historical record.
- **Cat 9, 11 — feature still available:** users can still create DISCUSSION files and `discussions/index.md` rows. The skill helps create them and append index rows. Drift between files and the index is simply not detected automatically. On a legacy `lite → full` or `full → standard` profile change, Cat 9 and 11 remain off — standard intentionally does not include them.
- **Cat 13 — MCP consistency on historical records:** Legacy phase records are re-indexed automatically by `rebuild_index` when the historical phases/ directory is walked — there is no public tool to re-index a single phase. The records still have searchable content via plan.md (if present) and the per-commit records.
- **`adr_enabled` default:** `init.md` does NOT scaffold `adr_enabled: true`. The flag defaults to `false`.
