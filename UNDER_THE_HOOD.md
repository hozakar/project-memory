# Under the Hood

How project-memory actually works — for the technically curious, and for AI
assistants loading this skill.

---

## What git tracks vs. what I track

- **Git** answers: what changed, where, when, what is the diff.
- **I** answer: why it was changed, what alternatives were rejected, what
  constraints existed, what tensions are unresolved, what approaches have
  proven harmful, what should happen next.

---

## Directory structure

> **These files are mine.** I create them, I maintain them, I read them. If you
> edit them manually, I may get confused — I trust what's in there. If something
> looks wrong, just tell me; I can fix it.

```
.project-memory/
├── phases/
│   ├── index.yml
│   └── phase-YYYYMMDD-short-title/
│       ├── phase.yml
│       ├── plan.md
│       ├── implementation.md
│       ├── review-and-fixes.md
│       └── followup.md
├── decisions/
│   ├── index.md
│   └── DECISION-YYYY-MM-DD-slug.md
├── discussions/
│   ├── index.md
│   └── DISCUSSION-YYYY-MM-DD-slug.md
├── eras/
│   ├── index.yml
│   └── era-NNN.md
├── instructions/
│   └── INSTRUCTION-YYYY-MM-DD-slug.md
├── assignments/
│   ├── index.yml
│   └── ASSIGNMENT-YYYY-MM-DD-slug.md
├── issues/
│   ├── open/
│   └── closed/
└── summaries/
    ├── project-memory.md
    ├── current-state.md
    ├── architecture.md
    ├── active-issues.md
    └── roadmap.md
```

---

## Phases

A phase is a logical unit of work. It opens before significant implementation
begins and closes when that unit is complete. I track which commits belong to
which phase, flag gaps, and maintain the phase record.

Each phase directory holds five documents: a plan written before implementation,
an implementation log updated as commits land, a review-and-fixes record, a
followup for deferred items, and a `phase.yml` with metadata.

**Pre-Implementation Gate:** I cross-reference what you're about to build
against active decisions before any code is written. If a conflict is detected,
I surface a single batched question — not a stream of prompts.

**Pre-Close Gate:** I verify all five phase documents are complete before a
phase can close.

---

## Summaries

`summaries/` contains living documents updated automatically at every phase close:

| File | Purpose |
|---|---|
| `project-memory.md` | Core context: history, decisions, tensions, anti-patterns, priorities |
| `current-state.md` | Features, components, debt, risks, next actions |
| `architecture.md` | Module inventory, updated when structure changes |
| `active-issues.md` | Open issues index |
| `roadmap.md` | Upcoming work, fed from `followup.md` at phase close |

---

## Decisions

When the team makes an architectural or design choice, I record it as a
`DECISION-YYYY-MM-DD-slug.md` file. Rejected alternatives are logged alongside
the chosen path so future sessions don't re-litigate settled choices.

Before any significant implementation, I automatically cross-reference what
you're about to touch against active decisions. If a conflict is detected, I
surface a single batched question. If there's no conflict, I proceed silently.

---

## Discussions

Exploratory conversations are captured as `DISCUSSION-YYYY-MM-DD-slug.md` files.
At close, a discussion links to its downstream artifact — a new phase, a decision,
an issue, or a roadmap entry. Discussions can be resumed across sessions.

I score each discussion for relevancy before saving. Low-signal conversations
are dropped silently; high-signal ones are saved automatically; borderline cases
are escalated with a yes/no question.

---

## Instructions

Workflow preferences and agent behavior rules live in
`.project-memory/instructions/`. Unlike decisions (which constrain the project),
instructions constrain the agent's behavior for a specific user. Each instruction
is scoped to the user who created it by email — other team members' instructions
are never loaded into your session.

---

## Assignments

Cross-user task delegation lives in `.project-memory/assignments/`. Two variants:
direct (linked to existing records) and freeform (standalone tasks). State machine:
`pending → accepted → ongoing → completed / rejected`. Session-start notifications
are passive — one line per direction, details on demand.

---

## Eras

As phases accumulate, I periodically write an `era-NNN.md` narrative summarizing
that period's work. Eras provide long-term continuity — when a project has hundreds
of phases, era summaries let me load a compressed view of history rather than
scanning everything. Era creation is gated to maintainers.

---

## Author attribution

All record types carry structured `created_by` and `contributors` frontmatter with
`{name, email}` identity pairs. I capture git identity at write time and soft-fail
to an `unknown` sentinel if identity cannot be determined — no escalation, no
blocked workflow.

---

## Maintainer role

A lightweight two-role system controls who receives era creation prompts.
**Maintainers** are listed in `.project-memory/maintainers.md` by email; they
get prompted when ~10 phases accumulate since the last era. **Developers** work
identically — they just don't see era maintenance prompts.

---

## ADR support

When enabled, every decision automatically gets a corresponding `adr/NNNN-slug.md`
file in MADR format, compatible with standard ADR tooling. The drift audit
(Category 8) keeps the two in sync. ADR support is opt-in and can be toggled
at any time via `.project-memory/config.yml`.

---

## Drift audit

I run a 14-category drift audit at every session start:

| Category | Description | Resolution |
|---|---|---|
| 1 | Orphan commits (not attached to any phase) | Auto-classify if aged >3d; notice if fresh |
| 2 | Stale summary files | Auto-fix if aged >3d; escalate if fresh |
| 3 | Stub placeholders in summary files | Auto-fix |
| 4 | Open phase with no recent commits | Escalate |
| 5 | Issue files in wrong directory | Auto-fix (file move) |
| 6 | Decision index drift | Auto-fix if aged >3d; escalate if fresh |
| 7 | Orphan commit references in phase.yml | Auto-annotate |
| 8 | ADR sync drift (when ADR enabled) | Auto-fix if aged >3d; escalate if fresh |
| 9 | Discussion index drift | Auto-fix |
| 10 | Completed phase missing required files | Escalate |
| 11 | Expired discussions | Auto-archive |
| 12 | Tag inconsistency | Auto-suppress or escalate |
| 13 | DB/filesystem consistency | Auto-index missing entries |
| 14 | Assignment orphans / stale pending | Escalate |

---

## MCP Companion Server

An optional MCP server (`mcp-server/`) that dramatically improves memory quality
and session performance. Strongly suggested for any project beyond the first few
phases.

Without MCP I read files sequentially. With MCP I run semantic vector search over
all record types in a single call — finding relevant prior decisions, similar past
phases, and conflicting discussions with high accuracy, even when keyword overlap
is low.

**Tools provided:**
- `search_memory` — semantic search across all record types with filters
- `run_audit` — all 14 audit categories in a single deterministic call
- `index_phase`, `index_decision`, `index_discussion`, `index_era`,
  `index_instruction`, `index_assignment` — upsert records into the vector index
- `find_similar_commit` — squash/rebase recovery via diff-based similarity search
- `check_consistency` and `rebuild_index` — DB/filesystem sync and full index rebuild

**Stack:** LanceDB + `all-MiniLM-L6-v2` local embeddings. No API key, no external
service. Runs locally alongside the skill.

**Graceful degradation:** the filesystem is always the source of truth. MCP is a
derived read-optimized index. If the server is unavailable, I fall back to
file-based operation without data loss.

---

## Skill files

| File | Purpose |
|---|---|
| `SKILL.md` | Entry point — on-load flow, argument dispatch (`audit`, `discuss`), core concepts |
| `gates.md` | Pre-Implementation Gate, Pre-Close Gate, commit significance, topic shift |
| `protocol.md` | Agent thinking protocol, memory loading strategy, knowledge preservation |
| `cheatsheet.md` | Quick reference, event-based trigger table |
| `audit.md` | Drift audit dispatcher → `audit-mcp.md` or `audit-fs.md` |
| `init.md` | First-run initialization procedure |
| `templates.md` | File templates dispatcher |
| `conventions.md` | Naming conventions, lifecycle rules, decision resolution |
| `mcp-integration.md` | MCP tool catalog, proactive sync, degradation rules |
