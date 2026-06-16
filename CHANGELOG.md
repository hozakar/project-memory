# Changelog

All notable changes to the project-memory skill and MCP companion server.

## [0.0.3] — 2026-06-16

### Tiered profiles (full / lite / minimal)

Three coherent profiles gate ceremony-bearing features so the skill scales down
for medium and short-lived projects without losing value on long-running ones.

**Profile matrix highlights:**

| Feature | `full` | `lite` | `minimal` |
|---|---|---|---|
| Phase files | 5-file | `phase.yml` + optional `plan.md` | none |
| Pre-Impl Gate | Steps 0–5 | Steps 0–4 | Step 0 only |
| Drift audit | 14 categories | 12 categories (Cat 9, 11 off; Cat 10 modified) | none |
| Summaries | 5 files | `roadmap.md` + `current-state.md` | inline `MEMORY.md` |
| Author attribution | `created_by` + `contributors` | `created_by` only | none |
| Topic-shift | on | off | n/a |

**Architecture — hybrid file split:** divergent files live under `full/` and `lite/`
(8 files each: `gates.md`, `protocol.md`, `audit-fs.md`, `audit-mcp.md`,
`templates-phase.md`, `templates-config.md`, `init.md`, `cheatsheet.md`).
`minimal/minimal.md` is a single self-contained spec. Shared lifecycle files
(decisions, discussions, records, attribution, MCP integration, record templates)
stay at the root. `SKILL.md` is the profile router; `profiles.md` holds the tier
matrix, init UX, and migration rules.

**Init UX:** first-run asks one question with three options and guidance criteria.
Default cursor: `lite`. Profile is recorded in `config.yml` with a `profile_history`
array (one entry per profile change with `effective_date` and `reason`).

**Change profile:** natural language — "switch project-memory to lite". SKILL.md
recognizes the intent, appends a `profile_history` entry, and updates the top-level
`profile` field. No past artifacts are deleted; only future behavior changes.

**Backward compatibility:** existing projects without a `profile` field in `config.yml`
are treated as `full`. No migration required.

**User-triggered features are NOT profile-bound:** discussions, issues, assignments,
instructions, eras, ADR mirror, and the MCP companion are opt-in regardless of profile.

### MCP server — `run_audit` profile parameter

`run_audit` now accepts a `profile` parameter (`"full"` | `"lite"` | `"minimal"`).
- `minimal` → returns empty findings immediately (minimal has no audit).
- `lite` → skips Cat 9 and Cat 11; reduces Cat 10 to `phase.yml`-only shape.
- `full` → unchanged behavior.

MCP server version bumped to `0.0.3`.

### English-only enforcement for skill files

All skill files must be written exclusively in English. This rule now has an
active instruction (`INSTRUCTION-2026-06-16-english-only-skill-files`) with zero
ambiguity: no non-English text anywhere in any skill file, including user-facing
prompts, trigger phrase examples, and inline comments. Proactive check required
on every skill file write.

---

## [0.0.2] — 2026-06-14

### Era 4 — Feature Completeness & Quality Gates (phases 33–43)

- **Maintainer role**: two-tier maintainer/developer system — era creation gated to maintainers only. DECISION-2026-06-13-maintainer-role.
- **Audit scalability**: wildcard `*` pattern support in `audit_ignore`; era-based auto-clean removes stale ignore entries on era creation. Skill auto-load fixed in init.md CLAUDE.md directive.
- **Discussion relevancy scoring**: 25-55-10-10 weighted gate (conclusion / long-term impact / discussion fill / decision fill). Score < 60 → silent drop; 60–80 → escalate; ≥ 80 → auto-save. Safety rule: impact subscore > 41/55 always escalates. DECISION-2026-06-13-discussion-relevancy-scoring.
- **Provenance field**: `provenance: directive | collaborative` added to DECISION and DISCUSSION frontmatter. DECISION-2026-06-13-provenance-field.
- **Security fix**: `@xenova/transformers` → `@huggingface/transformers` — resolved 4 transitive vulnerabilities (1 critical, 3 high).
- **Hybrid search**: `touches_filter` and `tags_filter` parameters in `search_memory` — SQL LIKE pre-filter on JSON columns before vector ranking.
- **ADR optional**: `adr_enabled` flag in config.yml (default: false on new projects). Cat 8 and run_audit skip when disabled. Re-enable triggers catch-up auto-fix.
- **ASSIGNMENT record type**: sixth record type — cross-user task delegation with persistent session-start notifications. State machine: pending → accepted → ongoing → completed / rejected → assigner loop. Audit Category 14. `index_assignment` MCP tool. `assigned_to_email` / `assigned_by_email` search filters.
- **MCP index fixes**: null-safe `.join()` in utils.ts; LanceDB dummy record schema completed; rebuild_index tagsJson/touchesJson populated. 78/78 records now index cleanly on fresh install.
- **Skill file split**: dispatcher architecture applied to 4 largest skill files (audit.md, templates.md, conventions.md + new mcp-integration.md). Session load: ~1700 → ~650 lines (−62%). 22 total skill files.
- **MCP server quality gates**: pre-commit hook (Husky + lint-staged), ESLint + TypeScript-ESLint, Vitest unit tests (3 files, 25 tests), `--noEmit` typecheck, coverage via @vitest/coverage-v8.

## [0.0.1] — 2026-06-08 (continuously updated)

### 2026-06-13
- **MCP Installation Guide** (`mcp-server/INSTALL.md`): manual and automated install paths for OpenCode and Claude Desktop
- **Version tracking**: `version: 0.0.1` in SKILL.md; `mcp_install_offered_for_version` in config.yml for one-time install offer
- **Combined changelog** (this file)
- **ADR 0008 — Branch-Per-Phase Workflow**: every phase gets its own git branch; rejected trunk-based and fork-based alternatives
- **Era 2** (`era-002.md`): narrative covering phases 11–21 (memory scalability through fix-open-issues)
- **Era creation trigger** in cheatsheet.md and protocol.md: auto-create era when ~10 phases accumulate
- **Author attribution** — structured `created_by` + `contributors` ({name, email}) added to phase / decision / discussion / issue frontmatter. LLM captures git identity at write time; missing → `unknown` sentinel (no escalation). MCP record schema extended with `createdByName`, `createdByEmail`, `contributorsJson`; rebuild_index required after backfill. Era / summaries / ADR / index files unchanged. See DECISION-2026-06-13-author-attribution and ADR 0010.

### Era 3 — Stabilization & Polish (phases 22–32)

- **Bugfix cohort:** Fixed 6 audit bugs — Cat 1 infinite loop, Cat 4 branch:null boundary, Cat 4 same-day exclusion, CRLF parser, BOM parser, Cat12 ignore key prefix mismatch. Eliminated all false-positive audit escalations.
- **Branch-per-phase workflow:** ADR 0008 — every phase gets its own git branch. DECISION-2026-06-13-branch-per-phase.
- **MCP install guide:** mcp-server/INSTALL.md with version-aware one-time offer.
- **INSTRUCTION record type:** User-scoped workflow preferences separated from architectural decisions. index_instruction MCP tool. search_memory created_by_email filter.
- **Author attribution:** created_by + contributors frontmatter across all record types. MCP schema extended. 50-record backfill script.
- **Cat 1 frictionless:** Author-filtered orphan commits, 3-day age boundary, informational notice pattern.
- **Documentation:** README, mcp-server/README, CHANGELOG, and all summaries synced to current state.

### 2026-06-12
- **Audit expansion**: 6 → 13 categories (Cat 7 orphan commits, Cat 8 ADR sync, Cat 9 discussion index drift, Cat 10 phase completeness, Cat 11 discussion expiry, Cat 12 tag inconsistency, Cat 13 MCP consistency)
- **Severity model**: high/medium/low with 3-day time boundary for medium findings; permanent skip via `audit_ignore` in config.yml
- **Report-only → auto-fix**: eliminated passive noise tier; 7 new auto-fix rules added
- **MCP Companion Server** — 4-phase pipeline:
  - **Phase 1 (MVP)**: 5 tools — search_memory, index_phase, index_decision, check_consistency, rebuild_index
  - **Phase 2**: +2 tools — index_discussion, find_similar_commit (squash/rebase recovery)
  - **Phase 3**: +1 tool — index_era, era summary system, proactive session-start sync, search_memory commit filter
  - **Phase 4**: +1 tool — run_audit (deterministic audit delegation, 13 categories in 1 call)
- **ADR Support**: MADR-aligned decision body, adr/ directory, Cat 8 sync audit
- **Repo visibility**: .project-memory/ and adr/ committed to skill repo (self-demonstrating)
- **Memory scalability**: tag-aware phase loading, superseded decision filtering, discussion expiry archiving, rolling summaries cap (20 entries)
- **6 open issues resolved**: outcome format, unbounded git log, DB upsert atomicity, version mismatch, stale category count, DB code quality

### 2026-06-11
- **Discussion feature**: explicit/implicit triggers, 4 outcome types, resume, Pre-Implementation Gate integration
- **SKILL.md refactor**: split into gates.md (174L), protocol.md (94L), cheatsheet.md (61L); entry point reduced 54%
- **Phase naming standardization**: unified `phase-YYYYMMDD-slug` format

### 2026-06-09
- **AGENTS.md support**: init.md now checks both CLAUDE.md and AGENTS.md independently
- **Branch fallback**: main→master→staging chain replaces hard-coded staging fallback

### 2026-06-08
- **Initial release**: SKILL.md, gates.md, protocol.md, cheatsheet.md, init.md, audit.md, templates.md, conventions.md
- Phase management with planning → implementation → review → completed lifecycle
- Decision cross-reference mechanism (Pre-Implementation Gate)
- English-only convention for skill files
- Roadmap & follow-up cleanup

### MCP Server (all under v0.0.1)
- **Phase 4** — `run_audit` tool (deterministic audit delegation, all 13 categories); Cat 5/11 file-move auto-fixes executed in MCP; Cat 7 returned as pending_fixes; Cat 12 Levenshtein pre-filter; `AuditFinding.interactive` pre-computed
- **Phase 3** — `index_era` tool (8th tool); `search_memory` excludes type=commit by default; proactive `check_consistency` + auto-index at session start; era summary system (eras/ dir, era-NNN.md, eras/index.yml)
- **Phase 2** — `index_discussion` and `find_similar_commit` tools (7 total); per-commit vector records; hex validation on commit hashes
- **Phase 1 (MVP)** — LanceDB + all-MiniLM-L6-v2 local embeddings; 5 tools: search_memory, index_phase, index_decision, check_consistency, rebuild_index; graceful degradation without MCP
