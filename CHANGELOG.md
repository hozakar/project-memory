# Changelog

All notable changes to the project-memory skill and MCP companion server.

## [0.0.1] — 2026-06-08 (continuously updated)

### 2026-06-13
- **MCP Installation Guide** (`mcp-server/INSTALL.md`): manual and automated install paths for OpenCode and Claude Desktop
- **Version tracking**: `version: 0.0.1` in SKILL.md; `mcp_install_offered_for_version` in config.yml for one-time install offer
- **Combined changelog** (this file)
- **ADR 0008 — Branch-Per-Phase Workflow**: every phase gets its own git branch; rejected trunk-based and fork-based alternatives
- **Era 2** (`era-002.md`): narrative covering phases 11–21 (memory scalability through fix-open-issues)
- **Era creation trigger** in cheatsheet.md and protocol.md: auto-create era when ~10 phases accumulate
- **Author attribution** — structured `created_by` + `contributors` ({name, email}) added to phase / decision / discussion / issue frontmatter. LLM captures git identity at write time; missing → `unknown` sentinel (no escalation). MCP record schema extended with `createdByName`, `createdByEmail`, `contributorsJson`; rebuild_index required after backfill. Era / summaries / ADR / index files unchanged. See DECISION-2026-06-13-author-attribution and ADR 0010.

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

### MCP Server
- **v0.4.0** — `run_audit` tool (deterministic audit delegation, all 13 categories); Cat 5/11 file-move auto-fixes executed in MCP; Cat 7 returned as pending_fixes; Cat 12 Levenshtein pre-filter; `AuditFinding.interactive` pre-computed
- **v0.3.0** — `index_era` tool (8th tool); `search_memory` excludes type=commit by default; proactive `check_consistency` + auto-index at session start; era summary system (eras/ dir, era-NNN.md, eras/index.yml)
- **v0.2.0** — `index_discussion` and `find_similar_commit` tools (7 total); per-commit vector records; hex validation on commit hashes
- **MVP (v0.1.0)** — LanceDB + all-MiniLM-L6-v2 local embeddings; 5 tools: search_memory, index_phase, index_decision, check_consistency, rebuild_index; graceful degradation without MCP
