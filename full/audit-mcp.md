---
name: project-memory-audit-mcp
description: MCP-driven drift audit fast path. Called by audit.md dispatcher when run_audit MCP tool is available. Handles MCP installation check when run_audit is not available.
---

# MCP Fast Path

**When `run_audit` is in available MCP tools:**

1. Call `run_audit(project_memory_dir)` where `project_memory_dir` is the absolute path to `.project-memory/`.
2. Receive `{ auto_fixed, pending_fixes, escalations }`:
   - `auto_fixed`: file-move operations already executed by MCP (Cat 5, Cat 11) — log them in the auto-fix line of the report.
   - `pending_fixes`: deterministic fixes detected but not yet applied. If `apply_audit_fixes` is in available tools, forward the **entire** array (no filtering) to `apply_audit_fixes(project_memory_dir, pending_fixes)`. **If `apply_audit_fixes` is NOT available** (older MCP server version): apply each fix manually via `Edit` — annotate orphan hashes in `phases/index.yml` and `phases/<phase_id>/phase.yml`, insert decision index rows, etc. The tool returns `{ applied, partial, failed, rerun_audit_recommended }`:
     - `applied`: fully-completed fixes (annotations, status flips, commit assignments, adr_id assignments, orphan row removals). Log each as MCP-applied — no LLM follow-up needed.
     - `partial`: the tool wrote a skeleton, but a prose-bearing cell is left as a TODO marker. Each entry carries `llm_must_do` (instruction) and `context` (the data you need). Resolve each one sequentially with `Edit`:
       - `add_decision_index_row` → fill the `<!-- TODO: claim -->` placeholder in `decisions/index.md` with a one-sentence Claim derived from the DECISION's `# Decision` section.
       - `create_adr_file` → fill the `<!-- TODO -->` blocks in the new ADR by extracting the corresponding sections from the source `DECISION-*.md` file.
       - `create_phase_stub` → fill the `<!-- TODO -->` blocks in the new phase file using session memory + git history.
     - `failed`: fix could not be applied (file missing, schema mismatch). Surface each failure in the audit report; if persistent, escalate to interactive triage.
     - If `rerun_audit_recommended: true`, optionally re-call `run_audit` once after applying to confirm no residual drift.
   - `escalations`: all other findings, each with `category`, `severity`, `description`, `interactive` (bool), and `data`.
3. For each escalation where `interactive: true` → enter interactive triage using the question shapes in `audit.md` → Interactive Mode.
4. For each escalation where `interactive: false` → these are pre-classified for auto-fix by MCP's severity/time-boundary logic. Report them in the auto-fixed log (not interactive triage).
5. Skip the file-based Detection Procedure in `audit-fs.md` entirely — `run_audit` has already covered all 14 categories.

**Why `apply_audit_fixes` exists:** `pending_fixes` are structural transformations driven by frontmatter + git facts. Source of truth is `.project-memory/` files; MCP just executes the deterministic edits the audit already decided. MCP never reads the vector DB to reconstruct content — that would degrade source. Prose-bearing cells stay as TODO markers for the LLM to fill from the actual source files.

---

# Semantic Conflict Scan (optional final stage)

Governing rules: `DECISION-2026-06-17-semantic-conflict-scan`. This stage runs *after* Cat 1–14 finish, only in interactive audit (i.e. via `Skill project-memory audit`), and only when all four gates pass.

## 1. Gating check

All four must hold; otherwise skip silently (do not show the offer prompt):
- Audit was triggered by `Skill project-memory audit` (not on-load).
- MCP is available (`run_audit` and `search_memory` both reachable).
- `profile=full` in `.project-memory/config.yml`.
- `decisions/index.md` Active section contains at least one row.

## 2. Offer prompt

Ask the user once, default `n`:

> "Run semantic conflict scan? (y/N)"

On `n` or no response → finish audit. On `y` → continue with step 3.

## 3. Candidate funnel

For each non-superseded decision D in `decisions/index.md` Active section:

1. Build `query` from D's `claim` (one-sentence assertion) joined with its `touches` list.
2. Call `search_memory({ query, type_filter: "decision", top_k: 3 })`.
3. For each returned neighbor N (N ≠ D) with similarity score ≥ 0.75, form a candidate pair `(D, N)`.

After all decisions processed:
- Canonicalize each pair as `[min(id), max(id)]` (lexicographic) and dedup.
- Drop pairs present in `semantic_audit_log` with `status: skipped` AND `cooldown_until > today`.
- Sort remaining pairs by similarity descending, keep the top **10**.

## 4. Self-prompt per pair

For each candidate pair `(A, B)`, ask yourself this question verbatim (from `DECISION-2026-06-17-semantic-conflict-scan`):

> "If I tried to apply decision A today, would decision B require me to do something different in the same situation? And if so, is it ambiguous which one I should follow?"

The **ambiguity clause** is mandatory — two decisions can use overlapping `touches` and differ in claim without conflicting in practice (different layers, different lifecycle stages). Without the clause, the false-positive rate inflates and user trust in the stage erodes.

Output: `yes` | `maybe` | `no`.

## 5. Triage outcomes

- **no** → drop, no log entry.
- **maybe** → append `{ pair: [A, B], status: maybe, seen_at: <today>, cooldown_until: null }` to `semantic_audit_log` in `.project-memory/config.yml`.
- **yes** → eligible for user-facing escalation in this run.

## 6. Escalation budget

- **Hard cap: 2 user-facing questions per audit run.**
- Fill from `yes` findings first (highest similarity first).
- If fewer than 2 `yes` findings exist, fill remaining slots from `maybe` candidates — but **at most one `maybe`** per run regardless of `yes` count.
- After the cap is consumed, escalate **one additional finding** *only if* the user explicitly asks ("anything else?", "what else do you have?", or equivalent). The +1 slot is user-initiated only — the LLM does not offer it.
- **Skip does not refund.** A skipped question still consumes its slot.

The cap is anchored in the decision; raise it only via a new superseding decision, not informally.

## 7. User question shape

For each escalated finding, use this template verbatim (substitute the bracketed parts):

> "On `<date-A>` we decided: `<claim A>` (`<DECISION-A-id>`).
> On `<date-B>` we decided: `<claim B>` (`<DECISION-B-id>`).
> These may conflict because `<one-sentence reason>`. If this situation came up, I might be unsure which to follow. How should I resolve this?"

Use `AskUserQuestion`. Offer two options alongside the open-text resolution: `"Resolve as described"` (user types resolution) and `"Skip / look later"`.

## 8. User response handling

- **Answer** (user provides resolution text) → proceed to step 9 (supersede write).
- **"Skip / look later"** → append `{ pair: [A, B], status: skipped, seen_at: <today>, cooldown_until: <today + 90 days> }` to `semantic_audit_log`. The pair will not be re-raised until `cooldown_until` passes. Slot consumed.

## 9. Supersede write

When the user provides a resolution, write a new DECISION through the canonical lifecycle in `conventions-decisions.md`:

1. Choose a short kebab-case slug describing the resolution.
2. Create `.project-memory/decisions/DECISION-<today>-<slug>.md` with:
   - `provenance: directive` (user explicitly resolved).
   - `supersedes: [<DECISION-id-of-the-one-being-overridden>]` — usually one ID; may include both if the user's resolution replaces both halves.
   - `# Context` note: *"Created via `semantic-conflict-scan` on `<date>`. User resolved a potential conflict between `<A-id>` and `<B-id>` with the following directive: `<paraphrase>`."*
3. Execute all post-write steps from `conventions-decisions.md`:
   - Move the superseded row(s) in `decisions/index.md` from Active to Superseded; set Status and Superseded By cells.
   - Update the superseded DECISION's frontmatter: `status: superseded`, `superseded_by: <new-id>`.
   - Append current git identity to `contributors` on both the new and superseded DECISION files; dedup by email.
   - If `adr_enabled: true`, create the ADR mirror per step 4 of `conventions-decisions.md`. If `adr_enabled: false`, skip.
4. After the write succeeds, remove any `semantic_audit_log` entries referencing either side of the resolved pair.

## 10. End conditions

The stage finishes when any of:
- Escalation budget is exhausted (2 asked, no user-initiated +1 requested).
- No eligible `yes` or `maybe` findings remain.
- User declines a further finding when offered.

After the stage finishes, the interactive audit is complete. Do **not** re-run Cat 1–14 — they already passed.

---

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
