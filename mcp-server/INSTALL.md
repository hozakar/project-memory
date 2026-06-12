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

Register the MCP server in your platform's configuration file. The exact format depends on whether you use OpenCode, Claude Desktop, or another MCP-compatible client.

**For OpenCode:** Add a `"local"` type MCP server entry in your `opencode.json`. Run `node dist/index.js` as the command.

**For Claude Code / Claude Desktop:** Add a stdio MCP server entry in `~/.claude.json` (global), `.mcp.json` (project-level), or use `claude mcp add`.

**For the most up-to-date configuration format**, consult your platform's documentation:
- OpenCode: https://opencode.ai/docs/mcp-servers
- Claude Code: https://docs.anthropic.com/en/docs/claude-code/mcp

### 5. Restart

Restart your application for the MCP server to load.

### 6. Verify

On next session start, the project-memory skill will detect MCP availability. You should see `search_memory`, `index_phase`, `index_decision`, `index_discussion`, `find_similar_commit`, `check_consistency`, `rebuild_index`, `index_era`, and `run_audit` in the available MCP tools.

---

## For the LLM (Automated Installation)

When the user accepts the automatic install offer, execute these steps:

### 1. Detect the platform

Check which configuration files exist:
- `~/.config/opencode/opencode.json` or project-root `opencode.json` → OpenCode
- `~/.claude.json` or project-root `.mcp.json` → Claude Code
- If neither is found, or both are found → ask the user: "I can't determine your platform. Are you using OpenCode or Claude Code?"

### 2. Look up the current MCP config format

**Do NOT hardcode the configuration format.** Instead, query Context7 for the latest documentation:

For OpenCode: call `context7_resolve-library-id` with library name "OpenCode", then `context7_query-docs` with query "local MCP server configuration opencode.json command array format".

For Claude Code: call `context7_resolve-library-id` with library name "Claude Code", then `context7_query-docs` with query "MCP server configuration registration claude mcp add local stdio server".

Use the returned format to construct the registration.

### 3. Install dependencies

```bash
cd <skill_dir>/mcp-server
npm install
```

### 4. Build

```bash
npm run build
```

### 5. Register the server

Apply the configuration format from step 2 to the detected config file. The server entry name should be `"project-memory"`. The command should run `node dist/index.js` from the mcp-server directory.

Use the server's absolute path (e.g., `C:\Users\...\.claude\skills\project-memory\mcp-server\dist\index.js` or `~/.claude/skills/project-memory/mcp-server/dist/index.js`).

### 6. Update version tracking

Set `mcp_install_offered_for_version` in `.project-memory/config.yml` to the current version from `mcp-server/package.json`.

### 7. Report

Tell the user to restart the application. Verify by checking MCP tools on next session start.
