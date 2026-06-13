---
name: project-memory-audit-mcp
description: MCP-driven drift audit fast path. Called by audit.md dispatcher when run_audit MCP tool is available. Handles MCP installation check when run_audit is not available.
---

# MCP Fast Path

**When `run_audit` is in available MCP tools (server v0.4.0+):**

1. Call `run_audit(project_memory_dir)` where `project_memory_dir` is the absolute path to `.project-memory/`.
2. Receive `{ auto_fixed, pending_fixes, escalations }`:
   - `auto_fixed`: Cat 5 and Cat 11 file-move operations already executed — log them in the auto-fix line of the report.
   - `pending_fixes`: Cat 7 orphan annotations — apply each one using the Edit tool (annotate the hash in `phases/index.yml` and the corresponding `phases/<phase_id>/phase.yml`).
   - `escalations`: all other findings, each with `category`, `severity`, `description`, `interactive` (bool), and `data`.
3. For each escalation where `interactive: true` → enter interactive triage using the question shapes in `audit.md` → Interactive Mode.
4. For each escalation where `interactive: false` → these are pre-classified for auto-fix by MCP's severity/time-boundary logic. Report them in the auto-fixed log (not interactive triage).
5. Cat 12 findings (`category: 12`) always require LLM confirmation before prompting the user — review the `data.tag` / `data.similar_tag` pair and decide if it is genuinely a typo. Only escalate if confident.
6. Skip the file-based Detection Procedure in `audit-fs.md` entirely — `run_audit` has already covered all 14 categories.

**When `run_audit` is NOT available — MCP installation check:**

1. Check if `mcp-server/package.json` exists and read its `version` field.
2. Read `.project-memory/config.yml` for `mcp_install_offered_for_version`.
3. If `mcp-server/package.json` version > `mcp_install_offered_for_version` (or `mcp_install_offered_for_version` is null/missing):
   - Present a single offer: "MCP companion server v{X.Y.Z} is available but not installed. It provides semantic search and faster audits. I can install it for you — want me to?"
   - Options: "Install now" / "I'll do it myself" / "Not now"
   - On "Install now" or "I'll do it myself": read `mcp-server/INSTALL.md` and follow the appropriate section.
   - On "Not now": set `mcp_install_offered_for_version` to the current version to suppress re-offers for this version.
4. If version matches `mcp_install_offered_for_version` → silent skip (already offered).
5. If `mcp-server/` does not exist at all → silent skip (MCP is optional).
