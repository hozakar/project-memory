# Under the Hood

How project-memory actually works — for the technically curious, and for AI
assistants loading this skill.

---

## What git tracks vs. what the skill tracks

- **Git** answers: what changed, where, when, what is the diff.
- **The skill** answers: why it was changed, what alternatives were rejected,
  what constraints existed, what tensions are unresolved, what approaches have
  proven harmful, what should happen next.

---

## Profiles

Project-memory supports two profiles. The profile controls ceremony — how much
overhead the skill introduces automatically. Choose at first run; switch at any time.

| | `standard` | `minimal` |
|---|---|---|
| Pre-Impl Gate | Steps 0–3 (GATE 0 + Steps 1–3) | Step 0 only |
| Drift audit | 8 categories | none |
| Summaries | `roadmap.md` + `current-state.md` | inline in `MEMORY.md` |
| Author attribution | `created_by` only | none |
| Topic-shift detection | off | n/a |

Features you trigger explicitly — discussions, issues, assignments, instructions,
ADR, MCP — are available in all profiles regardless of which you choose.

---

## Directory structure

> **These files are managed by the skill.** The skill creates, maintains, and
> reads them. Manual edits can desync the index — the skill trusts what's in
> there. If something looks wrong, just say so; it can be fixed.

**Standard profile** uses a `.project-memory/` directory (scaffolds a
leaner tree at init — no `discussions/`, `issues/`, `assignments/`, or
`instructions/` until you use those features for the first time):

```
.project-memory/
├── decisions/
│   ├── index.md
│   └── DECISION-YYYY-MM-DD-slug.md
├── discussions/
│   ├── index.md
│   └── DISCUSSION-YYYY-MM-DD-slug.md
├── instructions/
│   └── INSTRUCTION-YYYY-MM-DD-slug.md
├── assignments/
│   ├── index.yml
│   └── ASSIGNMENT-YYYY-MM-DD-slug.md
├── issues/
│   ├── open/
│   └── closed/
└── summaries/
    ├── current-state.md
    └── roadmap.md
```

**Minimal profile** uses the same `.project-memory/` directory but with just two files:

```
.project-memory/
├── config.yml     ← profile: minimal + profile_history
└── MEMORY.md      ← three sections: ## Roadmap, ## Decisions, ## Log
```

User-triggered features (discussions, issues, assignments, instructions) create their
own subdirectories inside `.project-memory/` on first use, same as other profiles.

---

## Write triggers

The skill acts at three kinds of moments, not at phase boundaries:

- **Session start** — load context (summaries, decisions, discussions, instructions,
  assignments), cross-reference active decisions against the working tree, log the
  session. No phase ceremony — just memory loading and conflict detection.

- **Turn boundary** — at the end of each turn, a sweep asks "did this turn include
  a commit?". If no → move on (no memory writes). If yes → update
  `summaries/current-state.md` once (covering the turn's commits) and
  `summaries/roadmap.md` when the turn changed scope. This is the only write trigger
  for summary files — one judgment per turn, not per commit. Decisions are captured
  when made (mid-turn) per decision-moment awareness, not by this sweep.

- **Decision moment** — whenever an architectural or design choice is made, a
  `DECISION-YYYY-MM-DD-slug.md` is created, indexed, and cross-referenced. This is
  the primary value-carrier: the "why" that git cannot capture.

In the `standard` profile, the Pre-Implementation Gate cross-references against
active decisions before any work starts. The gate has 4 steps (GATE 0 + Steps 1–3).
In `minimal`, only Step 0 (instruction re-injection) runs.

There is no phase concept. Work continuity across sessions is provided by
`current-state.md` (what exists now) and `roadmap.md` (what's next).
If a named unit of work is useful for
your team, capture it as a DECISION or DISCUSSION — that's what they're for.

---

## Summaries

`summaries/` contains living documents updated automatically at every commit.
The set of files depends on the active profile:

|**Standard profile** (2 files): `current-state.md` and `roadmap.md`. Roadmap
entries are added incrementally during work.

**Minimal profile**: no `summaries/` directory. The `## Roadmap` section of
`MEMORY.md` serves the same purpose, edited directly.

---

## Decisions

When the team makes an architectural or design choice, the skill records it as a
`DECISION-YYYY-MM-DD-slug.md` file. Rejected alternatives are logged alongside
the chosen path so future sessions don't re-litigate settled choices.

Before any significant implementation, the skill automatically cross-references
what you're about to touch against active decisions. If a conflict is detected,
it surfaces a single batched question. If there's no conflict, it proceeds
silently.

---

## Discussions

Exploratory conversations are captured as `DISCUSSION-YYYY-MM-DD-slug.md` files.
At close, a discussion links to its downstream artifact — a decision,
an issue, or a roadmap entry. Discussions can be resumed across sessions.

The skill scores each discussion for relevancy before saving. Low-signal
conversations are dropped silently; high-signal ones are saved automatically;
borderline cases are escalated with a yes/no question.

---

## Instructions

Workflow preferences and agent behavior rules live in
`.project-memory/instructions/`. Unlike decisions (which constrain the project),
instructions constrain the agent's behavior for a specific user. Each instruction
is scoped to the user who created it by email — other team members' instructions
are never loaded into your session.

---

## Assignments

A lightweight safety net for open work — not a task tracker. The typical use case:
a team member leaves the project with open decisions or discussions in flight. Assignments
let you hand off those loose ends so nothing gets orphaned. Two variants: direct
(linked to an existing record) and freeform (standalone). State machine:
`pending → accepted → ongoing → completed / rejected`. Session-start notifications
are passive — one line per direction, details on demand. This is a once-in-a-blue-moon
feature; for day-to-day task management, use your existing tools.

---

---

## Author attribution

Attribution depth depends on the active profile:

- **Standard:** all record types carry `created_by` — `contributors` is omitted.
- **Minimal:** no attribution — git already records authorship per commit.

In all cases git identity is captured at write time, soft-failing to an
`unknown` sentinel if identity cannot be determined — no escalation, no blocked
workflow.

---

---

## ADR support

When enabled, every decision automatically gets a corresponding `adr/NNNN-slug.md`
file in MADR format, compatible with standard ADR tooling. The drift audit
(Category 8) keeps the two in sync. ADR support is opt-in and can be toggled
at any time via `.project-memory/config.yml`.

---

## Drift audit

The skill runs an 8-category drift audit each session, deferred to after the
first user response so it doesn't add latency to session start. One exception
runs synchronously: explicit `Skill project-memory audit` invocation.

**How the two paths differ materially — not just in speed:**

- **With the MCP companion server (standard profile only used nontrivially):**
  the audit is *deterministic, instant, and costs zero tokens / zero LLM
  judgment.* At session open the skill calls
  `run_audit(…, background: true)`, gets back `{ status: 'running' }` (or
  `'done'`) immediately, and emits a single ack line. The server runs the full
  pipeline silently in a background worker — `run_audit → apply_audit_fixes →
  re-run until clean` (max 5 iterations) — applying all fixes with no further
  involvement from the LLM. No Glob/Read churn, no per-finding reasoning, no
  report block. The skill just moves on.
- **Without MCP (standard profile):** the same 8 categories fire, but every one
  of them is driven by the LLM issuing `Glob` / `Read` calls, interpreting
  frontmatter and index rows, and writing fixes token-by-token. The *detection
  rules* are deterministic, but the *operation* is not free: each pass costs
  tokens, wall-clock time, and LLM judgment. On a project with many decisions
  and discussions, the per-session audit becomes a noticeable overhead item —
  the most concrete reason to install MCP in standard.
- **Minimal profile:** no audit at all, with or without MCP.

In short: MCP isn't "faster audits" — it's *audits that don't draw on the LLM
at all*. The LLM-facing path exists as a fallback, but it is the expensive one.

| Category | Description | Resolution |
|---|---|---|
| 5 | Issue files in wrong directory | Auto-fix (file move) |
| 6 | Decision index drift | Auto-fix (orphan rows) + pending fixes (missing rows, status mismatches) |
| 8 | ADR sync drift (when ADR enabled) | Pending fixes (missing adr_id, missing ADR files) |
| 9 | Discussion index drift (low, non-interactive report) | Low/non-interactive report |
| 11 | Discussion expiry auto-archive | Auto-archive |
| 13 | MCP consistency (conditional, auto-fix) | Auto-index missing entries |
| 14 | Assignment orphans / stale pending | Auto-fix |
| 15 | Decision supersession integrity: dangling pointers + zombie-active + asymmetric + circular + orphan-superseded | Auto-fix (pending fixes) |

---

## MCP Companion Server

An optional MCP server (`mcp-server/`) that dramatically improves memory quality
and session performance. Strongly suggested for any project beyond the first few
sessions.

Without MCP the skill reads files sequentially. With MCP it runs semantic
vector search over all record types in a single call — finding relevant prior
decisions, discussions, and past work with high accuracy, even when keyword
overlap is low.

**Tools provided:**
- `search_memory` — semantic search across all record types with filters
- `run_audit` — all 8 audit categories in a single deterministic call
- `index_decision`, `index_discussion`,
  `index_instruction`, `index_assignment`, `index_note`, `delete_note` — upsert and
  delete records in the vector index
- `apply_audit_fixes` — deterministic execution of all `PendingFix` variants from `run_audit`; source-of-truth-safe, idempotent, prose cells left as `<!-- TODO -->` markers
- `find_similar_commit` — squash/rebase recovery via diff-based similarity search
- `check_consistency` and `rebuild_index` — DB/filesystem sync and full index rebuild
- `list_contributors` — deduplicated contributor list across all record types
- `find_decision_conflicts` — find candidate semantically-conflicting decision pairs for manual review

**Stack:** LanceDB + `all-MiniLM-L6-v2` local embeddings. No API key, no external
service. Runs locally alongside the skill.

**Graceful degradation:** the filesystem is always the source of truth. MCP is a
derived read-optimized index. If the server is unavailable, the skill falls back to
file-based operation without data loss.

---

## Skill files

Skill files are organized into a shared root plus per-profile directories. Profile-
specific behavior lives under `standard/` or `minimal/`; shared lifecycles
that don't diverge across profiles stay at the root.

**Entry point and profile routing:**

| File | Purpose |
|---|---|
| `SKILL.md` | Profile router — on-load flow, profile detection, argument dispatch (`audit`, `discuss`, `change profile`), critical gates summary |
| `profiles.md` | Tier matrix, init UX, migration mechanism, `profile_history` schema |

**Per-profile files** (each profile has its own copy under `standard/` or `minimal/`):

| File | Purpose |
|---|---|
| `gates.md` | Pre-Implementation Gate + turn-boundary sweep per standard/gates.md |
| `protocol.md` | Agent thinking protocol, memory loading strategy, knowledge preservation |
| `cheatsheet.md` | Quick reference, event-based trigger table |
| `audit-fs.md` | Drift audit — filesystem detection path |
| `audit-mcp.md` | Drift audit — MCP fast path |
| `templates-config.md` | `config.yml` schema and summary file templates |
| `init.md` | First-run initialization procedure |

`minimal/` has a single file (`minimal/minimal.md`) that covers everything above for that profile.

**Shared root files** (same behavior across all profiles):

| File | Purpose |
|---|---|
| `audit.md` | Dispatcher — routes to `<profile>/audit-mcp.md` or `<profile>/audit-fs.md` |
| `templates/index.md` | Dispatcher — routes to profile-specific template files |
| `conventions/index.md` | Dispatcher — routes to shared convention sub-files |
| `conventions/decisions.md` | Decision lifecycle, ADR steps, touches guidance |
| `conventions/discussions.md` | Discussion lifecycle, relevancy scoring, expiry |
| `conventions/records.md` | Issue, instruction, assignment lifecycles |
| `conventions/maintainer.md` | Language policy, author attribution rules |
| `templates/decisions.md` | DECISION + ADR + decisions/index.md templates |
| `templates/discussions.md` | DISCUSSION + discussions/index.md templates |
| `templates/instructions.md` | INSTRUCTION template |
| `templates/assignments.md` | ASSIGNMENT + assignments/index.yml templates |
| `templates/attribution.md` | Shared `created_by` / `contributors` schema |
| `mcp-integration.md` | MCP tool catalog, proactive sync, degradation rules |
