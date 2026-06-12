# MCP Server Installation

Installs the project-memory MCP companion server for semantic search over phases and decisions.

## Prerequisites

- Node.js >= 18.0.0
- npm (comes with Node.js)
- Write access to the skill directory

---

## For the User (Manual Installation)

### 1. Navigate to the MCP server directory

```bash
cd .claude/skills/project-memory/mcp-server
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the TypeScript

```bash
npm run build
```

### 4. Register the MCP server

#### Option A — OpenCode

Add to `opencode.json` (or `~/.config/opencode/opencode.json`):

```json
"mcp": {
  "project-memory": {
    "type": "local",
    "command": ["node", ".claude/skills/project-memory/mcp-server/dist/index.js"]
  }
}
```

#### Option B — Claude Desktop

Add to `claude_desktop_config.json` (or `~/.config/Claude/claude_desktop_config.json`):

```json
"mcpServers": {
  "project-memory": {
    "command": "node",
    "args": [".claude/skills/project-memory/mcp-server/dist/index.js"]
  }
}
```

### 5. Restart

Restart OpenCode or Claude Desktop for the MCP server to load.

### 6. Verify

On next session start, the project-memory skill will detect MCP availability. You should see `search_memory`, `index_phase`, `index_decision`, `index_discussion`, `find_similar_commit`, `check_consistency`, `rebuild_index`, `index_era`, and `run_audit` in the available MCP tools.

---

## For the LLM (Automated Installation)

When the user accepts the automatic install offer ("Ben kurayım" / "Go ahead"), execute these steps:

### 1. Detect platform

Check which configuration file is active:
- If `opencode.json` or `~/.config/opencode/opencode.json` exists → OpenCode
- If `claude_desktop_config.json` exists → Claude Desktop
- If both/neither → ask the user which platform

### 2. Install dependencies

```bash
cd <skill_dir>/mcp-server
npm install
```

### 3. Build

```bash
npm run build
```

### 4. Register server

For OpenCode: add the `"project-memory"` entry to the `"mcp"` object in the active opencode.json. If `"mcp"` object does not exist, create it.

For Claude Desktop: add the `"project-memory"` entry to `"mcpServers"` in the config file.

### 5. Update version tracking

Set `mcp_install_offered_for_version` in `.project-memory/config.yml` to the current version from `mcp-server/package.json`.

### 6. Report

Tell the user to restart the application. Verify by checking MCP tools on next session start.
