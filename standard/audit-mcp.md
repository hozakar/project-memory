---
name: project-memory-audit-mcp
description: MCP-driven drift audit fast path for the standard profile. Calls run_audit with profile=standard parameter so the MCP server internally skips phase-related categories (Cat 4, Cat 10, retired). Falls back to MCP installation check when run_audit is unavailable.
---

# MCP Fast Path (standard)

**Invocation:** at post-first-response hook (default), or on explicit `Skill project-memory audit` (sync), or when first user message is an audit-implicit-trigger (sync).

**Auto-run (On-Load) uses background mode:**
At session open (SKILL.md On-Load step 5), the LLM calls `run_audit(project_memory_dir, { profile: 'standard', background: true })`. The server runs the full pipeline silently in the background: `run_audit → apply_audit_fixes → re-run until clean` (max 5 iterations). Returns `{ status: 'running' }` (audit starting/in-progress) or `{ status: 'done' }` (audit already completed moments ago). No retrieval, no report. The LLM emits a single instant-ack line.

> **Concurrency guarantees:** Concurrent triggers (server head-start + SKILL.md call) deduplicate via a normalized in-flight guard — different path strings pointing to the same physical directory collapse to one key. Manual `run_audit` / `apply_audit_fixes` calls serialize against the background pipeline via a per-directory async mutex.

**Manual invocation (explicit `Skill project-memory audit`) uses synchronous form:**

**When `run_audit` is in available MCP tools:**

1. Read `.project-memory/config.yml` to confirm `profile: standard`.
2. Call `run_audit(project_memory_dir, { profile: "standard" })` (background omitted/false) for explicit `Skill project-memory audit` invocation. The MCP server will:
   - Internally skip phase-related categories (Cat 4, Cat 10, retired). Cat 9 and Cat 11 (discussion hygiene) remain active for all profiles (legacy full/lite normalize to standard at read time).
3. Receive `{ auto_fixed, pending_fixes }`:
   - `auto_fixed`: file-move operations already executed by the MCP server (Cat 5 misplaced-issue moves, Cat 14/15 auto-fixes). Log them in the auto-fix line.
   - `pending_fixes`: deterministic fixes detected but not yet applied. If `apply_audit_fixes` is in available tools, forward the **entire** array (no filtering) to `apply_audit_fixes(project_memory_dir, pending_fixes)`. **If `apply_audit_fixes` is NOT available** (older MCP server): fall back to applying each fix manually via `Edit`. The tool returns `{ applied, partial, failed, rerun_audit_recommended }`. Decision-related pending types (`add_decision_index_row`, `fix_decision_supersession_status`, etc.) still appear if decisions exist — handle them per the standard flow.
4. Skip the file-based Detection Procedure in `standard/audit-fs.md` entirely — `run_audit` with `profile: "standard"` has already covered all active categories.

**Backward compatibility with older MCP server versions:**

If the installed MCP server does not accept a `profile` parameter (older than the version that introduced it), `run_audit` will return the standard 14-category findings. The LLM layer then performs the standard filter manually:

1. Drop phase-related categories (Cat 4, Cat 10, retired) and dropped categories (Cat 1, 2, 3, 7, 12). Cat 9 and Cat 11 (discussion hygiene) remain active.

This fallback ensures correctness while the MCP server is being upgraded.

**Legacy profile passing:** For pre-existing config.yml files with `profile: full` or `profile: lite`, the `run_audit` call should pass `profile: "standard"` — the MCP server treats all three (full, lite, standard) as the same category shape. See `standard/init.md` → Backward Compatibility.

---

# Semantic Conflict Scan (manual audit only)

After the structural audit categories are clean (step 4 above), if `find_decision_conflicts` is available as an MCP tool:

1. Check gating: profile=standard, MCP available, at least one active decision in `decisions/index.md`.
2. Prompt the user: "Run semantic conflict scan? (y/N)"
3. On `y`: call `find_decision_conflicts(project_memory_dir, { threshold: 0.75, top_k: 10 })`.
4. For each returned candidate pair, apply the LLM self-prompt with ambiguity test (see `audit.md` → Semantic Conflict Scan).
5. Escalate up to 2 "yes" findings to the user (plus 1 user-initiated +1).
6. Resolution: user answers → write new superseding DECISION; user dismisses → add `decision-contradiction:<ID1>:<ID2>` to `audit_ignore` in `config.yml`.

---

# MCP installation check

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
