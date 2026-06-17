---
name: project-memory-audit-mcp-lite
description: Lite-profile MCP-driven drift audit fast path. Calls run_audit with profile=lite parameter so the MCP server internally skips Cat 9, 11 and applies the modified Cat 10 shape. Falls back to MCP installation check when run_audit is unavailable.
---

# MCP Fast Path (lite)

**When `run_audit` is in available MCP tools:**

1. Read `.project-memory/config.yml` to confirm `profile: lite`.
2. Call `run_audit(project_memory_dir, profile: "lite")`. The MCP server will:
   - Internally skip Cat 9 (discussion index drift) and Cat 11 (discussion expiry).
   - Apply Cat 10 lite shape (`phase.yml` required, `plan.md` optional, others ignored) — consulting `profile_history` for per-phase shape inference when the project has history under multiple profiles.
3. Receive `{ auto_fixed, pending_fixes, escalations }`:
   - `auto_fixed`: file-move operations already executed by the MCP server (Cat 5 misplaced-issue moves). Log them in the auto-fix line.
   - `pending_fixes`: deterministic fixes detected but not yet applied. If `apply_audit_fixes` is in available tools, forward the **entire** array (no filtering) to `apply_audit_fixes(project_memory_dir, pending_fixes)`. **If `apply_audit_fixes` is NOT available** (older MCP server): fall back to applying each fix manually via `Edit`. The tool returns `{ applied, partial, failed, rerun_audit_recommended }` — see `full/audit-mcp.md` § 2 for full handling rules. In lite, the most common pending types are `annotate_orphan` (Cat 7) and `create_phase_stub` for missing `phase.yml` only (Cat 10 lite shape). Decision-related pending types (`add_decision_index_row`, etc.) still appear if decisions exist — handle them per the full-profile flow.
   - `escalations`: remaining findings. Each carries `category`, `severity`, `description`, `interactive` (bool), and `data`.
4. For each escalation where `interactive: true` → enter interactive triage using the question shapes in `audit.md` → Interactive Mode.
5. For each escalation where `interactive: false` → these are pre-classified for auto-fix. Report them in the auto-fix log (not interactive triage).
6. Skip the file-based Detection Procedure in `lite/audit-fs.md` entirely — `run_audit` with `profile: "lite"` has already covered all active categories.

**Backward compatibility with older MCP server versions:**

If the installed MCP server does not accept a `profile` parameter (older than the version that introduced it), `run_audit` will return the standard 14-category findings. The LLM layer then performs the lite filter manually:

1. Drop all Cat 9 and Cat 11 findings.
2. For each Cat 10 finding: check the phase's `started_at` against `profile_history`. If `started_at` falls in a lite window, drop the finding if it only flags missing `implementation.md`, `review-and-fixes.md`, or `followup.md`. Keep findings for missing `phase.yml`.

This fallback ensures correctness while the MCP server is being upgraded.

---

# MCP installation check (lite)

**When `run_audit` is NOT available:**

1. Check if `mcp-server/package.json` exists and read its `version` field.
2. Read `.project-memory/config.yml` for `mcp_install_offered_for_version`.
3. If `mcp-server/package.json` version > `mcp_install_offered_for_version` (or `mcp_install_offered_for_version` is null/missing):
   - Present a single offer: "MCP companion server v{X.Y.Z} is available but not installed. It provides semantic search and faster audits. I can install it for you — want me to?"
   - Options: "Install now" / "I'll do it myself" / "Not now"
   - On "Install now" or "I'll do it myself": read `mcp-server/INSTALL.md` and follow the appropriate section.
   - On "Not now": set `mcp_install_offered_for_version` to the current version to suppress re-offers for this version.
4. If version matches `mcp_install_offered_for_version` → silent skip (already offered).
5. If `mcp-server/` does not exist at all → silent skip (MCP is optional in all profiles).

The install check itself is identical across profiles — only the post-install audit behavior differs.
