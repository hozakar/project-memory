---
name: project-memory-mcp-integration
description: MCP companion server integration rules for project-memory. Covers availability detection, tool catalog, proactive sync, graceful degradation, and audit fast path.
---

# MCP Companion

The `mcp-server/` subdirectory contains an optional MCP server that accelerates project-memory with semantic search and deterministic drift audits.

## Availability Detection

At session start, check if `search_memory`, `index_decision`, and `index_instruction` are in your available MCP tools. If yes → MCP is active for this session. If no → all behavior is identical to standard file-based operation.

## Tools Provided

| Tool | Purpose |
|------|---------|
| `search_memory(…)` | Hybrid search: vector similarity + optional exact pre-filters. … Legacy phase rows remain searchable via `search_memory`. |
| `index_decision(data)` | Upsert a decision; called on creation and status change. |
| `index_discussion(data)` | Upsert a discussion; called on conclusion and status change. |
| `index_instruction(data)` | Upsert an instruction; called on creation and state change (active ↔ dropped). |
| `index_assignment(data)` | Upsert an assignment; called on creation and status change. |
| `index_note(data)` | Upsert a note; called on creation and update. |
| `delete_note(id)` | Delete a note from vector DB and filesystem; called on user-initiated note deletion. |
| `index_era(data)` | Upsert an era summary; called when a new era-NNN.md is written. |
| `check_consistency(project_memory_dir)` | Returns `{missing, orphaned}` for DB/filesystem sync; used in drift audit Cat 13 and proactive sync at session start. |
| `rebuild_index(entries[])` | Full atomic rebuild of the index; called when DB is empty or on user request. |
| `run_audit(project_memory_dir)` | Executes all 10 audit categories in a single MCP call. Returns `{auto_fixed, pending_fixes, escalations}`. See `audit-mcp.md`. |
| `apply_audit_fixes(project_memory_dir, pending_fixes)` | Deterministically applies the `pending_fixes` payload from `run_audit`. Returns `{applied, partial, failed, rerun_audit_recommended}`. Source-of-truth safe (never reads vector index, never synthesizes prose). Idempotent. See `audit-mcp.md` step 2. |
| `find_similar_commit(diff_snippet, top_k?)` | Search for past commits with similar code changes; used for squash/rebase recovery. |

## Proactive DB Sync

At session start, if MCP is active: call `check_consistency(project_memory_dir)`. For each ID in `missing`: call the appropriate index tool (`index_decision`, `index_discussion`, `index_era`, `index_instruction`, `index_assignment`, `index_note`). Best-effort — if any call fails, continue.

## Graceful Degradation

File system is always source of truth. DB is a derived index. Write direction is files → DB only, never DB → files. MCP failure at any point does not affect skill functionality.

## Detailed Integration Rules

- **Session start + proactive sync:** `protocol.md` → MCP Companion Integration
- **Audit fast path:** `audit.md` → Dispatcher (routes to `audit-mcp.md` when `run_audit` available)
- **Squash/rebase recovery:** `protocol.md` → `find_similar_commit`
- **Drift audit Cat 13:** `audit-fs.md` → Category 13
