# Changelog

All notable changes to the project-memory skill and MCP companion server.

## [0.0.7] — 2026-06-18

### Structural filtering — typeFilter applied to stress-test Q8

`stress-test/query.ts` Q8 ("Infrastructure deployment failure patterns"): added
`typeFilter: "discussion"` — top-1 now returns the post-outage multi-region
re-evaluation discussion (score ~0.428) instead of an IaC tooling decision
(0.545). Structural correctness win: the query asks for failure patterns /
lessons-learned / systemic gap, which is discussion-shaped, not decision-shaped.
No MCP server code change — existing `typeFilter` parameter applied. P@1 remains
15/15.

## [0.0.6] — 2026-06-18

### Result diversity — MMR reranking (opt-in)

`search_memory` gains an opt-in `diversify` parameter. When true, the tool
over-fetches 5x and applies Maximum Marginal Relevance (MMR) reranking with
lambda=0.7 (relevance-leaning). First pick = max similarity to query (P@1
preserved); subsequent picks trade off relevance vs novelty against
already-selected records. Addresses stress-test Q1/Q11 top-5 clustering
(same-template records dominating top-K).

Caller-decides trigger: the `diversify` flag is set by the caller based on
query intent, guided by the tool description heuristic ("set true for
survey/exploration queries with top_k >= 5; leave false for pinpoint lookups
or top_k <= 3"). No auto-trigger — magic behavior based on topK creates
debugging nightmares; Claude (the caller) is best positioned to judge intent
from user phrasing.

Pure `mmrRerank()` + `cosine()` functions in `utils.ts` (shared utility
pattern, matches `deriveOutcomeType`). Lambda hardcoded at 0.7 — not exposed
to MCP (too many knobs).

Decision: DECISION-2026-06-18-search-memory-mmr-reranking.
Files: utils.ts, db.ts, search_memory.ts, server.ts, query.ts, 2 test files,
README.md, mcp-integration.md, CHANGELOG.md.

## [0.0.5] — 2026-06-18

### Structural filtering pattern — outcomeTypeFilter

`search_memory` is now a hybrid semantic + structural tool. Structural metadata
gets a per-field DB column + exact-match filter parameter, composing with vector
search in a single call. `outcome_type_filter` is the first concrete instance:
a derived `outcomeType` column (none/phase/decision/roadmap) on discussion
records, filtered via exact-match WHERE clause. Closes the Q10 structural gap
from the stress-test baseline (score 0.355 — vector search cannot reliably
surface discussions by outcome type from content embeddings alone).

The per-field pattern is codified: each filter-worthy field gets (a) a dedicated
DB column in `LanceRecord`, (b) derivation at index time, (c) a filter parameter
in `search_memory` and `server.ts` tool schema, (d) an exact-match WHERE clause
in `db.ts`. Generic `metadataFilter` is deferred until 4+ filter-worthy fields
make the per-field pattern repetitive.

Decision: DECISION-2026-06-18-search-memory-structural-filtering.
Files: types.ts, utils.ts (deriveOutcomeType), index_discussion.ts,
rebuild_index.ts, search_memory.ts, db.ts, server.ts, query.ts, 2 test files.
76 tests pass, typecheck + lint clean.

## [0.0.4] — 2026-06-17

### Contradiction detection & intellectual honesty

The Agent Thinking Protocol now responds to user claims that contradict recorded
decisions through a three-tier system: Tier 1 cites the specific record by ID
and reasoning when the contradiction is direct; Tier 2 surfaces the tension and
asks for clarification when it is interpretive; Tier 3 acknowledges age and offers
an override path for decisions older than 30 days or predating the last two eras.
Override flow: warn once → write a superseding DECISION → move on. Prevents
re-litigation without silently complying. DECISION-2026-06-14-intellectual-honesty.

### Instruction gate re-injection

Active instructions are now re-injected at every gate checkpoint
(Pre-Implementation Gate, Pre-Close Gate, Discussion trigger, Topic Shift) in
addition to session start. Survives compaction and long contexts at ~2% additional
context cost per session. Supersedes session-start-only loading.
DECISION-2026-06-14-instruction-gate-injection (ADR 0018).

### Discussion gate — loss heuristic

The 25-55-10-10 weighted scoring gate has been replaced with a loss heuristic:
the question is now "would losing this discussion hurt us?" rather than additive
scoring. Removes structural bias toward saving long discussions regardless of
content quality. DECISION-2026-06-16-loss-heuristic supersedes
DECISION-2026-06-13-discussion-relevancy-scoring.

### Audit — Cat 8 create-only, Cat 12 deterministic

**Cat 8** now only detects missing ADR files — status sync was dropped. Tracking
decision status changes via ADR files produced spurious escalations without
practical value.

**Cat 12** tag inconsistency detection is now fully deterministic: Levenshtein
distance ≤ 2 replaces LLM judgment, matching the behavior already in the MCP
`run_audit` path. Combined with `audit_ignore` wildcard patterns, this eliminates
all non-deterministic audit output.

### apply_audit_fixes — new MCP tool

New MCP tool that deterministically executes the seven `PendingFix` variants
returned by `run_audit`: `annotate_orphan`, `assign_commit`,
`add_decision_index_row`, `fix_decision_index_status`, `assign_adr_id`,
`create_adr_file`, `create_phase_stub`. Source-of-truth-safe (reads only from
`.project-memory/` files, never from LanceDB, never synthesizes prose). Prose
cells remain as `<!-- TODO -->` markers for LLM completion. Idempotent. Both
`full/audit-mcp.md` and `lite/audit-mcp.md` route `pending_fixes` through it.
MCP server now has **11 tools** (previously 10, previously 9 before
`index_assignment` in v0.0.2).

### applies_globally — cross-cutting decisions in Pre-Impl Gate

`applies_globally: true|false` added to DECISION frontmatter. The
Pre-Implementation Gate surfaces `Global = Yes` decisions regardless of touches
overlap — ensuring cross-cutting policies (language convention, branch workflow,
maintainer role, ADR opt-in) are never silently missed. Rule 0 added to Decision
Resolution Rules. Seven existing cross-cutting decisions backfilled.
DECISION-2026-06-17-global-scope-decisions.

### Semantic conflict scan (optional interactive audit stage)

Optional final stage of interactive audit: after all deterministic categories
complete, `search_memory` is called with a semantic conflict query to surface
tension between recorded decisions that share no explicit `supersedes` relationship.
Results logged to `semantic_audit_log` in `config.yml` to avoid re-scanning.
MCP-only; never triggered automatically at session start.
DECISION-2026-06-17-semantic-conflict-scan.

### Skill file architecture — templates-records split

`templates-records.md` (367 lines, 5 record types) split into five dedicated
files: `templates-decisions.md`, `templates-discussions.md`,
`templates-instructions.md`, `templates-assignments.md`,
`templates-attribution.md`. Pure refactor; no schema changes.

### protocol.md cleanup

Four-phase isolated cleanup of `protocol.md`:
- **Structural (B1):** collapsed step 8 variants; extracted duplicate UX rules to
  canonical location in `conventions-records.md`; removed stale skill sub-files table.
- **Semantic (B2):** Tier 3 contradiction threshold made concrete; trigger criteria
  clarified; Session-start Ordering subsection (7-step checklist) added; era prompt
  extracted from proactive sync block.
- **Overlay/compaction honesty:** MCP variant reframed as "overlay (supplements,
  never replaces)"; compaction re-run claim dropped — no reliable in-band signal.
- **Cosmetic:** staleness disambiguation table (3 distinct thresholds, 3 distinct
  questions); Knowledge Preservation escape-valve note.

### README — long-term value + manual audit invitation

Two new sections added to README.md: "A long-term bet" (honest framing of
session overhead vs. long-run quality gain) and "Can you spare me five minutes?"
(invitation to run a manual audit once a month).

### Era 005 — Tiered Profiles, Protocol Hardening & Semantic Integrity

Era 005 written and indexed, covering phases 44–63 (2026-06-14 to 2026-06-17).
23 stale `audit_ignore` entries removed (era-based auto-clean, including
uncleaned leftovers from eras 001–004).

MCP server version bumped to `0.0.4`.

---

## [0.0.3] — 2026-06-16

### Tiered profiles (full / lite / minimal)

Three coherent profiles gate ceremony-bearing features so the skill scales down
for medium and short-lived projects without losing value on long-running ones.

**Profile matrix highlights:**

| Feature | `full` | `lite` | `minimal` |
|---|---|---|---|
| Phase files | 5-file | `phase.yml` + optional `plan.md` | none |
| Pre-Impl Gate | Steps 0–5 | Steps 0–4 | Step 0 only |
| Drift audit | 14 categories | 12 categories (Cat 9, 11 off; Cat 10 modified) | none |
| Summaries | 5 files | `roadmap.md` + `current-state.md` | inline `MEMORY.md` |
| Author attribution | `created_by` + `contributors` | `created_by` only | none |
| Topic-shift | on | off | n/a |

**Architecture — hybrid file split:** divergent files live under `full/` and `lite/`
(8 files each: `gates.md`, `protocol.md`, `audit-fs.md`, `audit-mcp.md`,
`templates-phase.md`, `templates-config.md`, `init.md`, `cheatsheet.md`).
`minimal/minimal.md` is a single self-contained spec. Shared lifecycle files
(decisions, discussions, records, attribution, MCP integration, record templates)
stay at the root. `SKILL.md` is the profile router; `profiles.md` holds the tier
matrix, init UX, and migration rules.

**Init UX:** first-run asks one question with three options and guidance criteria.
Default cursor: `lite`. Profile is recorded in `config.yml` with a `profile_history`
array (one entry per profile change with `effective_date` and `reason`).

**Change profile:** natural language — "switch project-memory to lite". SKILL.md
recognizes the intent, appends a `profile_history` entry, and updates the top-level
`profile` field. No past artifacts are deleted; only future behavior changes.

**Backward compatibility:** existing projects without a `profile` field in `config.yml`
are treated as `full`. No migration required.

**User-triggered features are NOT profile-bound:** discussions, issues, assignments,
instructions, eras, ADR mirror, and the MCP companion are opt-in regardless of profile.

### MCP server — `run_audit` profile parameter

`run_audit` now accepts a `profile` parameter (`"full"` | `"lite"` | `"minimal"`).
- `minimal` → returns empty findings immediately (minimal has no audit).
- `lite` → skips Cat 9 and Cat 11; reduces Cat 10 to `phase.yml`-only shape.
- `full` → unchanged behavior.

MCP server version bumped to `0.0.3`.

### English-only enforcement for skill files

All skill files must be written exclusively in English. This rule now has an
active instruction (`INSTRUCTION-2026-06-16-english-only-skill-files`) with zero
ambiguity: no non-English text anywhere in any skill file, including user-facing
prompts, trigger phrase examples, and inline comments. Proactive check required
on every skill file write.

---

## [0.0.2] — 2026-06-14

### Era 4 — Feature Completeness & Quality Gates (phases 33–43)

- **Maintainer role**: two-tier maintainer/developer system — era creation gated to maintainers only. DECISION-2026-06-13-maintainer-role.
- **Audit scalability**: wildcard `*` pattern support in `audit_ignore`; era-based auto-clean removes stale ignore entries on era creation. Skill auto-load fixed in init.md CLAUDE.md directive.
- **Discussion relevancy scoring**: 25-55-10-10 weighted gate (conclusion / long-term impact / discussion fill / decision fill). Score < 60 → silent drop; 60–80 → escalate; ≥ 80 → auto-save. Safety rule: impact subscore > 41/55 always escalates. DECISION-2026-06-13-discussion-relevancy-scoring.
- **Provenance field**: `provenance: directive | collaborative` added to DECISION and DISCUSSION frontmatter. DECISION-2026-06-13-provenance-field.
- **Security fix**: `@xenova/transformers` → `@huggingface/transformers` — resolved 4 transitive vulnerabilities (1 critical, 3 high).
- **Hybrid search**: `touches_filter` and `tags_filter` parameters in `search_memory` — SQL LIKE pre-filter on JSON columns before vector ranking.
- **ADR optional**: `adr_enabled` flag in config.yml (default: false on new projects). Cat 8 and run_audit skip when disabled. Re-enable triggers catch-up auto-fix.
- **ASSIGNMENT record type**: sixth record type — cross-user task delegation with persistent session-start notifications. State machine: pending → accepted → ongoing → completed / rejected → assigner loop. Audit Category 14. `index_assignment` MCP tool. `assigned_to_email` / `assigned_by_email` search filters.
- **MCP index fixes**: null-safe `.join()` in utils.ts; LanceDB dummy record schema completed; rebuild_index tagsJson/touchesJson populated. 78/78 records now index cleanly on fresh install.
- **Skill file split**: dispatcher architecture applied to 4 largest skill files (audit.md, templates.md, conventions.md + new mcp-integration.md). Session load: ~1700 → ~650 lines (−62%). 22 total skill files.
- **MCP server quality gates**: pre-commit hook (Husky + lint-staged), ESLint + TypeScript-ESLint, Vitest unit tests (3 files, 25 tests), `--noEmit` typecheck, coverage via @vitest/coverage-v8.

## [0.0.1] — 2026-06-08 (continuously updated)

### 2026-06-13
- **MCP Installation Guide** (`mcp-server/INSTALL.md`): manual and automated install paths for OpenCode and Claude Desktop
- **Version tracking**: `version: 0.0.1` in SKILL.md; `mcp_install_offered_for_version` in config.yml for one-time install offer
- **Combined changelog** (this file)
- **ADR 0008 — Branch-Per-Phase Workflow**: every phase gets its own git branch; rejected trunk-based and fork-based alternatives
- **Era 2** (`era-002.md`): narrative covering phases 11–21 (memory scalability through fix-open-issues)
- **Era creation trigger** in cheatsheet.md and protocol.md: auto-create era when ~10 phases accumulate
- **Author attribution** — structured `created_by` + `contributors` ({name, email}) added to phase / decision / discussion / issue frontmatter. LLM captures git identity at write time; missing → `unknown` sentinel (no escalation). MCP record schema extended with `createdByName`, `createdByEmail`, `contributorsJson`; rebuild_index required after backfill. Era / summaries / ADR / index files unchanged. See DECISION-2026-06-13-author-attribution and ADR 0010.

### Era 3 — Stabilization & Polish (phases 22–32)

- **Bugfix cohort:** Fixed 6 audit bugs — Cat 1 infinite loop, Cat 4 branch:null boundary, Cat 4 same-day exclusion, CRLF parser, BOM parser, Cat12 ignore key prefix mismatch. Eliminated all false-positive audit escalations.
- **Branch-per-phase workflow:** ADR 0008 — every phase gets its own git branch. DECISION-2026-06-13-branch-per-phase.
- **MCP install guide:** mcp-server/INSTALL.md with version-aware one-time offer.
- **INSTRUCTION record type:** User-scoped workflow preferences separated from architectural decisions. index_instruction MCP tool. search_memory created_by_email filter.
- **Author attribution:** created_by + contributors frontmatter across all record types. MCP schema extended. 50-record backfill script.
- **Cat 1 frictionless:** Author-filtered orphan commits, 3-day age boundary, informational notice pattern.
- **Documentation:** README, mcp-server/README, CHANGELOG, and all summaries synced to current state.

### 2026-06-12
- **Audit expansion**: 6 → 13 categories (Cat 7 orphan commits, Cat 8 ADR sync, Cat 9 discussion index drift, Cat 10 phase completeness, Cat 11 discussion expiry, Cat 12 tag inconsistency, Cat 13 MCP consistency)
- **Severity model**: high/medium/low with 3-day time boundary for medium findings; permanent skip via `audit_ignore` in config.yml
- **Report-only → auto-fix**: eliminated passive noise tier; 7 new auto-fix rules added
- **MCP Companion Server** — 4-phase pipeline:
  - **Phase 1 (MVP)**: 5 tools — search_memory, index_phase, index_decision, check_consistency, rebuild_index
  - **Phase 2**: +2 tools — index_discussion, find_similar_commit (squash/rebase recovery)
  - **Phase 3**: +1 tool — index_era, era summary system, proactive session-start sync, search_memory commit filter
  - **Phase 4**: +1 tool — run_audit (deterministic audit delegation, 13 categories in 1 call)
- **ADR Support**: MADR-aligned decision body, adr/ directory, Cat 8 sync audit
- **Repo visibility**: .project-memory/ and adr/ committed to skill repo (self-demonstrating)
- **Memory scalability**: tag-aware phase loading, superseded decision filtering, discussion expiry archiving, rolling summaries cap (20 entries)
- **6 open issues resolved**: outcome format, unbounded git log, DB upsert atomicity, version mismatch, stale category count, DB code quality

### 2026-06-11
- **Discussion feature**: explicit/implicit triggers, 4 outcome types, resume, Pre-Implementation Gate integration
- **SKILL.md refactor**: split into gates.md (174L), protocol.md (94L), cheatsheet.md (61L); entry point reduced 54%
- **Phase naming standardization**: unified `phase-YYYYMMDD-slug` format

### 2026-06-09
- **AGENTS.md support**: init.md now checks both CLAUDE.md and AGENTS.md independently
- **Branch fallback**: main→master→staging chain replaces hard-coded staging fallback

### 2026-06-08
- **Initial release**: SKILL.md, gates.md, protocol.md, cheatsheet.md, init.md, audit.md, templates.md, conventions.md
- Phase management with planning → implementation → review → completed lifecycle
- Decision cross-reference mechanism (Pre-Implementation Gate)
- English-only convention for skill files
- Roadmap & follow-up cleanup

### MCP Server (all under v0.0.1)
- **Phase 4** — `run_audit` tool (deterministic audit delegation, all 13 categories); Cat 5/11 file-move auto-fixes executed in MCP; Cat 7 returned as pending_fixes; Cat 12 Levenshtein pre-filter; `AuditFinding.interactive` pre-computed
- **Phase 3** — `index_era` tool (8th tool); `search_memory` excludes type=commit by default; proactive `check_consistency` + auto-index at session start; era summary system (eras/ dir, era-NNN.md, eras/index.yml)
- **Phase 2** — `index_discussion` and `find_similar_commit` tools (7 total); per-commit vector records; hex validation on commit hashes
- **Phase 1 (MVP)** — LanceDB + all-MiniLM-L6-v2 local embeddings; 5 tools: search_memory, index_phase, index_decision, check_consistency, rebuild_index; graceful degradation without MCP
