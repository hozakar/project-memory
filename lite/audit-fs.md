---
name: project-memory-audit-fs-lite
description: Lite-profile file-system drift audit. 12 active categories (Cat 9, 11 disabled — discussion index/expiry checks dropped). Cat 10 modified — only phase.yml is required in lite phases.
---

# Detection Procedure (lite)

**Invocation:** at post-first-response hook (default), or on explicit `Skill project-memory audit` (sync), or when first user message is an audit-implicit-trigger (sync).

Run all 12 active categories on every audit pass. Collect findings before acting. Check `audit_ignore` (see `audit.md` → Permanent Skip) before escalating any finding — suppressed findings are omitted entirely.

**Active categories in lite:** 1, 2, 3, 4, 5, 6, 7, 8 (conditional on `adr_enabled`), 10 (modified for lite phase shape), 12, 13 (conditional on MCP), 14.

**Disabled in lite:** Cat 9 (discussion index drift), Cat 11 (discussion expiry). If you use discussions in a lite project, you are responsible for index hygiene and archival manually. The features are still available — only the automated checks are dropped.

---

# Categories

| # | Category | Detection Rule | Tool Calls | Classification | Severity |
|---|---|---|---|---|---|
| 1 | **Commit orphans** | Same as full — `git log --format='%h %ae %aI %s' -30`; check `phases/index.yml` for matches; trivial-commit regex; same-user auto-assign by file overlap; ambiguous → info; aged + non-current-user filters lifted on explicit audit. | `Bash: git log -30`; `Read: phases/index.yml` | **Auto-fix** | — |
| 2 | **Summary staleness** | Same as full — bump `Last Updated:` if older than most recent project commit. **Lite only checks 2 summaries:** `summaries/roadmap.md`, `summaries/current-state.md`. | `Bash: git log -1 --format=%cs`; `Read summaries/*.md` | **Auto-fix** | — |
| 3 | **Stub placeholders** | Same as full — grep `summaries/*.md` for `None recorded yet`, `TBD`, `system just initialized`, `first run detected` → replace with `*(none)*`. **Lite only operates on 2 summaries.** | `Grep` over `.project-memory/summaries/*.md` | **Auto-fix** | **low** |
| 4 | **Open-phase commit gap** | Same as full — find open phases (`status` in `planning|implementation|review`); compute branch commits not in `phase.yml.commits`; same-user auto-assign by file overlap; unresolved (author mismatch / ambiguous) → info on on-load, escalate on manual audit. | `Read: phases/index.yml`; `Bash: git log ...` | **Info (on-load) / Escalate (manual audit)** | **high** |
| 5 | **Misplaced issue files** | Same as full — `issues/open/*.md` with `status: closed` → move to `issues/closed/`. **No-op when issues feature unused (default in lite).** | `Glob: issues/open/*.md`; `Read` frontmatter | **Auto-fix** | — |
| 6 | **Decision index drift** | Same as full — DECISION files vs `decisions/index.md` rows; missing rows → pendingFix; orphan rows → auto-remove; status mismatch → auto-resolve from file. | `Glob: decisions/DECISION-*.md`; `Read: decisions/index.md` | **Auto-fix** | — |
| 7 | **Orphan commit references** | Same as full — collect hashes from `phases/index.yml`; batch-check with `git cat-file --batch-check`; annotate missing with `[orphaned YYYY-MM-DD]`. | `Read: phases/index.yml`; `Bash: git cat-file --batch-check` | **Auto-fix** | — |
| 8 | **ADR sync drift (conditional)** | Same as full — only fires if `config.yml.adr_enabled: true`. Lite's default is `adr_enabled: false` (no ADR scaffolding), so Cat 8 is typically a no-op. If the user explicitly enables it on a lite project, behavior is identical to full. | `Read: config.yml`; `Glob/Read: decisions/`; `Glob: <adr_dir>` | **Auto-fix** | — |
| 9 | **DISABLED in lite** | Discussion index drift not checked. Manual hygiene. | — | — | — |
| 10 | **Lite phase file completeness** | **Modified from full.** For each phase in `index.yml` with `status: completed`: verify `phase.yml` exists in the phase directory. `plan.md` is optional — its absence is NOT a finding. No check for `implementation.md`, `review-and-fixes.md`, `followup.md` — these files don't exist in lite phases. **Migration-aware:** consult `config.yml.profile_history`. If the phase's `started_at` falls within a `full` window, apply the full-shape check (5 files) instead. | `Read: phases/index.yml`; `Glob: phases/<id>/*.md` | **Auto-fix** | — |
| 11 | **DISABLED in lite** | Discussion expiry not checked. Manual archival. | — | — | — |
| 12 | **Tag inconsistency** | Same as full — Levenshtein distance on phase tags; skip if < 5 unique tags; flag pairs with distance 1-2; auto-rename when confident, suppress with audit_ignore when uncertain. | `Read: phases/index.yml` | **Auto-fix** | **low** |
| 13 | **MCP consistency (conditional)** | Same as full — runs only if MCP `check_consistency` tool is available. Indexes any IDs found on disk but not in DB. **Lite-specific:** when calling index_phase for a lite-window phase, pass empty `implementationText` (the file doesn't exist). | MCP: `check_consistency`; `Read` files for missing IDs; MCP: `index_*` tools | **Auto-fix** | — |
| 14 | **Assignment integrity** | Same as full — 14a (target_id orphan), 14b (stale pending), 14c (completed without evidence). **No-op when assignments feature unused (default in lite).** | `Glob: assignments/*.md`; `Read` frontmatter | **Auto-fix** | **low/medium** |

---

# Auto-Fix Rules

The lite auto-fix rules are identical to full for every active category. For step-by-step procedures, refer to `full/audit-fs.md` → Auto-Fix Rules. The only category-specific divergence is Cat 10:

**Lite Category 10 auto-fix steps:**
1. For each completed phase: read `phase.yml` (required — finding if missing). Apply profile-history check: if `started_at` is in a `full` window, switch to the full Cat 10 logic (5 files required). Otherwise lite-shape only.
2. Missing `phase.yml` → Return pendingFix `{ type: "create_phase_stub", phaseId, missingFile: "phase.yml" }`. LLM creates stub.
3. Lite phases do not need `plan.md` to be marked complete. Absence is silently accepted.
4. Log: `Created N stub phase.yml file(s) for M phase(s)` (or empty log if all phases healthy). This log line appears only in the final consolidated drift report — do not output anything during detection or fix steps.

---

# Cat 4 auto-assignment heuristic

Identical to full. See `full/audit-fs.md` → Cat 4 auto-assignment heuristic for the full procedure.

---

# Edge Cases

Edge cases from `full/audit-fs.md` apply unchanged for all active categories, with these lite-specific notes:

- **Cat 2 — lite summaries:** the staleness check operates only on `roadmap.md` and `current-state.md`. The other 3 summary files (`project-memory.md`, `active-issues.md`, `architecture.md`) are not present and not checked. If a user manually creates them, they are NOT auto-bumped — lite does not assume responsibility for non-default summary files.
- **Cat 10 — migration-aware shape check:** see Auto-Fix Rules above.
- **Cat 9, 11 — feature still available:** users can still create DISCUSSION files and `discussions/index.md` rows. The skill helps create them and append index rows. Drift between files and the index is simply not detected automatically. On a `lite → full` profile change, Cat 9 and 11 become active and any accumulated drift surfaces as findings at that point.
- **Cat 13 — lite-window phase indexing:** when re-indexing a lite-window phase, pass `implementationText: ""` to `index_phase`. The phase still has searchable content via plan.md (if present) and the per-commit records.
- **`adr_enabled` default in lite:** lite `init.md` does NOT scaffold `adr_enabled: true`. The flag is omitted (which means `true` by backward-compat default) OR explicitly set to `false` — refer to `lite/templates-config.md` for the chosen default.
