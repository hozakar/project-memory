# MCP Server Installation

The MCP companion server adds semantic search, deterministic audits, and vector
indexing to project-memory. Strongly recommended for any project beyond the
first few phases.

## Prerequisites

- Node.js >= 18.0.0
- npm (comes with Node.js)
- Write access to the skill directory

---

## Step 1 — Build

```bash
cd <skill-dir>/mcp-server
npm install
npm run build
```

---

## Step 2 — Register

Register the built server with your platform. Find your platform below.

---

### Claude Code

**Global** (all projects):

```bash
claude mcp add project-memory node /absolute/path/to/mcp-server/dist/index.js
```

**Project-level** (add to `.mcp.json` in project root):

```json
{
  "project-memory": {
    "command": "node",
    "args": ["/absolute/path/to/mcp-server/dist/index.js"]
  }
}
```

---

### Gemini CLI

Add to `~/.gemini/settings.json` (global) or `.gemini/settings.json`
(project-level):

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/mcp-server"
    }
  }
}
```

---

### Cursor

Add to `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (project-level):

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

---

### Windsurf

Open the **Cascade** panel → **Customizations** icon → **MCP Servers** →
**+ Add Server**, then fill in:

- **Name:** `project-memory`
- **Command:** `node`
- **Args:** `/absolute/path/to/mcp-server/dist/index.js`

Or add directly to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "project-memory": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"]
    }
  }
}
```

---

### OpenCode

Add to `~/.config/opencode/opencode.json` (global) or `opencode.json`
(project-level):

```json
{
  "mcp": {
    "project-memory": {
      "type": "local",
      "command": ["node", "/absolute/path/to/mcp-server/dist/index.js"],
      "enabled": true
    }
  }
}
```

---

### Cline

Open VS Code → Cline extension panel → **MCP Servers** tab →
**Add MCP Server**, then enter:

- **Name:** `project-memory`
- **Command:** `node`
- **Args:** `/absolute/path/to/mcp-server/dist/index.js`

---

## Step 3 — Restart

Restart your application. On next session start, project-memory will detect
the MCP server automatically.

## Verify

You should see these tools available: `search_memory`, `index_phase`,
`index_decision`, `index_discussion`, `index_era`, `index_instruction`,
`index_assignment`, `find_similar_commit`, `check_consistency`,
`rebuild_index`, `run_audit`, `apply_audit_fixes`.

---

## For the LLM — Automated Installation

When the user asks you to install the MCP server:

### 1. Ask which platform

```
Which platform are you using?
Claude Code / Gemini CLI / Cursor / Windsurf / OpenCode / Cline / other
```

### 2. Build

```bash
cd <skill-dir>/mcp-server && npm install && npm run build
```

### 3. Register

Use the configuration format for the user's platform from the sections
above. Substitute the absolute path to `mcp-server/dist/index.js`.

For global vs. project-level: default to global (applies across all
projects). If the user prefers project-level, use the project-root path
instead.

### 4. Update version tracking

Set `mcp_install_offered_for_version` in `.project-memory/config.yml`
to the version from `mcp-server/package.json`.

### 5. Report

Tell the user to restart their application and confirm the tools appear
on next session start.
