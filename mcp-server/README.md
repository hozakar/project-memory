# project-memory MCP Server

Optional MCP companion server for the [project-memory](../) skill. Provides semantic search over phases and decisions using LanceDB + all-MiniLM-L6-v2 (local embedding, no API key needed).

## What it does

- `search_memory` — semantic search at Pre-Implementation Gate and ad-hoc queries
- `index_phase` / `index_decision` — dual-write: skill calls these after every phase/decision write
- `check_consistency` — DB/filesystem sync (used by drift audit Cat 13)
- `rebuild_index` — full atomic rebuild from scratch

## Prerequisites

- Node.js ≥ 18
- npm

## Installation

bash
cd mcp-server
npm install
npm run build
First run downloads the all-MiniLM-L6-v2 model (~25MB) to local cache.

## Configuration

Add to your `claude_desktop_config.json` (or equivalent MCP config):

json
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
`PROJECT_MEMORY_DIR` should point to the root of the project that contains `.project-memory/`. The vector index is stored at `<PROJECT_MEMORY_DIR>/.project-memory/vector-index/` (gitignored).

## Without MCP

The project-memory skill works identically without this server. MCP is an optional accelerator — removing or disabling it causes zero data loss.