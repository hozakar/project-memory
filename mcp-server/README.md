# project-memory MCP Server

Optional MCP companion server for the [project-memory](../) skill. Provides semantic search over phases and decisions using LanceDB + all-MiniLM-L6-v2 (local embedding, no API key needed).

## Tools

- `search_memory(query, top_k?, created_by_email?, type_filter?, include_commits?)` — semantic search over phases, decisions, discussions, eras, and instructions; supports `created_by_email` user-scope filter and `type_filter` to restrict to a specific record type; excludes per-commit records by default
- `index_phase(data)` — upsert a phase into the vector index (called on phase open and close)
- `index_decision(data)` — upsert a decision (called on creation and status change)
- `index_discussion(data)` — upsert a discussion (called on conclusion)
- `find_similar_commit(diff_snippet, top_k?)` — search per-commit records for squash/rebase recovery
- `check_consistency(project_memory_dir)` — compare DB index against filesystem; returns {missing, orphaned}
- `rebuild_index(entries[])` — full atomic rebuild of the vector index
- `index_era(data)` — upsert an era narrative summary
- `index_instruction(data)` — upsert a user instruction (active or dropped)
- `run_audit(project_memory_dir)` — execute all 13 audit categories; returns {auto_fixed, pending_fixes, escalations} with pre-computed interactive flags

**Version:** 0.0.1 (skill), MCP server internal v0.4.0

**Record types indexed:** phases, decisions, discussions, eras, and instructions (all six project-memory record types).

**Write direction:** files → DB only. MCP may write `.project-memory/` files for file-move auto-fixes (Cat 5/11). YAML mutations (Cat 7) remain LLM-only. Zero data loss on MCP absence.

As of v0.4.x+, records may carry `createdByName`, `createdByEmail`, and `contributorsJson` columns (JSON-stringified `Identity[]`). Optional; defaults to `unknown`. Instructions are user-scoped via `created_by.email` — loaded only for the current user at session start.

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

## Module system note

This package uses CommonJS (`"module": "commonjs"` in tsconfig). `@xenova/transformers` v2 ships as ESM but `esModuleInterop: true` in tsconfig handles the interop. If you see `ERR_REQUIRE_ESM` errors, ensure you are using Node.js ≥ 18 and have run `npm run build` before `npm start`.

## Without MCP

The project-memory skill works identically without this server. MCP is an optional accelerator — removing or disabling it causes zero data loss.