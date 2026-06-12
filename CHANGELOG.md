# Changelog

All notable changes to the project-memory skill and MCP companion server.

## [0.0.1] — 2026-06-08

### Skill
- Initial release: SKILL.md, gates.md, protocol.md, cheatsheet.md, init.md, audit.md, templates.md, conventions.md
- Phase management with planning → implementation → review → completed lifecycle
- Drift audit with 13 detection categories
- Decision cross-reference mechanism (Pre-Implementation Gate)
- Discussion feature with 4 outcome types
- ADR support with adr/ directory
- Tag-aware memory loading with token budgets
- Rolling summaries cap (20 entries + Historical Milestones)

### MCP Server
- Initial MVP (v0.0.1): LanceDB + all-MiniLM-L6-v2 local embeddings
- 5 tools: search_memory, index_phase, index_decision, check_consistency, rebuild_index
- Graceful degradation: skill works identically without MCP
- Write direction: files → DB only
