# project-memory MCP Server

Optional MCP companion server for the [project-memory](../) skill. Provides semantic search over decisions, discussions, instructions, assignments, notes, and legacy phase rows using LanceDB + all-MiniLM-L6-v2 (local embedding, no API key needed).

## Tools

- `search_memory(query, top_k?, include_commits?, include_superseded?, created_by_email?, created_by_name?, assigned_to_email?, assigned_by_email?, type_filter?, touches_filter?, tags_filter?, scope_filter?, outcome_type_filter?, diversify?)` — hybrid semantic + structural search over decisions, discussions, instructions, assignments, notes, and legacy phase rows. Supports `created_by_email` and `created_by_name` user-scope filters, `type_filter` to restrict record type, `touches_filter` (decision entities, AND), `tags_filter` (phase/discussion tags, AND), `scope_filter` (decision primary_scope, OR), `outcome_type_filter` (discussion outcome category: none/phase/decision/roadmap), `assigned_to_email`/`assigned_by_email` (assignment filters), `include_commits` opt-in for per-commit records, and `diversify` (opt-in MMR reranking: over-fetches 5x and reranks with lambda=0.7 for result diversity; set true for survey/exploration queries with top_k >= 5; P@1 preserved). When `type_filter="note"`, `created_by_email` is auto-applied — notes are private. Legacy phase rows remain searchable.
- `index_decision(data)` — upsert a decision (called on creation and status change)
- `index_discussion(data)` — upsert a discussion (called on conclusion)
- `index_instruction(data)` — upsert a user instruction (active or dropped)
- `index_assignment(data)` — upsert an assignment record; supports `assigned_to_email` and `assigned_by_email` search filters
- `index_note(data)` — upsert a personal note (user-scoped, private, deletable)
- `delete_note(id)` — delete a note from LanceDB and filesystem; returns per-store deletion details
- `find_similar_commit(diff_snippet, top_k?)` — search per-commit records for squash/rebase recovery
- `check_consistency(project_memory_dir)` — compare DB index against filesystem; returns {missing, orphaned}
- `rebuild_index(entries[])` — full atomic rebuild of the vector index
- `run_audit(project_memory_dir, profile?)` — execute all 8 audit categories; returns {auto_fixed, pending_fixes}; accepts `profile` parameter (`standard` | `minimal`)
- `apply_audit_fixes(project_memory_dir, pending_fixes[])` — deterministically execute `PendingFix` variants returned by `run_audit`; source-of-truth-safe (reads `.project-memory/` files only, no LanceDB reads, no prose synthesis); idempotent; supports `fix_decision_supersession_status` for Cat 15 zombie-active decisions; returns {applied, partial, failed, rerun_audit_recommended}
- `list_contributors()` — walk all project-memory records, deduplicate contributors by email, return sorted list

**Version:** 0.1.2

**Record types indexed:** decisions, discussions, instructions, assignments, notes, and legacy phase rows. Notes are user-scoped and private — broad searches exclude them; `search_memory` auto-applies `created_by_email` when `type_filter="note"`.

**Write direction:** files → DB only. MCP may write `.project-memory/` files for file-move auto-fixes (Cat 5/11) and `apply_audit_fixes` structural fixes. YAML prose mutations remain LLM-only. Zero data loss on MCP absence.

Records may carry `createdByName`, `createdByEmail`, and `contributorsJson` columns (JSON-stringified `Identity[]`). Optional; defaults to `unknown`. Instructions are user-scoped via `created_by.email` — loaded only for the current user at session start.

## Prerequisites

- Node.js ≥ 18
- npm

## Installation

```bash
cd mcp-server
npm install
npm run build
```
First run downloads the all-MiniLM-L6-v2 model (~25MB) to local cache.

## Configuration

Add to your `claude_desktop_config.json` (or equivalent MCP config):

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "PROJECT_MEMORY_DIR": "/absolute/path/to/your/project"
      }
    }
  }
}
```
`PROJECT_MEMORY_DIR` should point to the root of the project that contains `.project-memory/`. The vector index is stored at `<PROJECT_MEMORY_DIR>/.project-memory/vector-index/` (gitignored).

## Without MCP

The project-memory skill works identically without this server. MCP is an optional accelerator — removing or disabling it causes zero data loss.
