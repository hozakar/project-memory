# project-memory

A Claude Code skill that gives your AI assistant persistent engineering memory across sessions, team members, and context resets.

## What It Does

`project-memory` separates two concerns git cannot address:

- **Git** answers: what changed, where, when, what is the diff.
- **Project Memory** answers: why it was changed, what alternatives were rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, what should happen next.

The skill maintains a `.project-memory/` directory in your project root. It loads automatically at session start, runs a drift audit, and injects relevant context — all without you having to ask. You work normally; the skill keeps the record.

## Structure

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

## Key Concepts

### Phases

A phase is a logical unit of work. It opens automatically when significant work begins and closes when that unit is complete. The skill tracks which commits belong to which phase, flags gaps, and maintains the phase record — you don't manage this manually.

Each phase directory holds five documents: a plan written before implementation, an implementation log updated as commits land, a review-and-fixes record, a followup for deferred items, and a `phase.yml` with metadata. The skill enforces that all five are complete before a phase can close, and ensures a phase exists before significant implementation work starts. Both gates are handled by the skill itself — not by you.

### Summaries

`summaries/` contains living documents updated automatically at every phase close:

| File | Purpose |
|---|---|
| `project-memory.md` | Core context: history, decisions, tensions, anti-patterns, priorities |
| `current-state.md` | Features, components, debt, risks, next actions |
| `architecture.md` | Module inventory, updated when structure changes |
| `active-issues.md` | Open issues index |
| `roadmap.md` | Upcoming work, fed from `followup.md` at phase close |

### Decisions

When the team makes an architectural or design choice, the skill records it as a `DECISION-YYYY-MM-DD-slug.md` file. Rejected alternatives are logged alongside the chosen path so future sessions don't re-litigate settled choices.

Before any significant implementation, the skill automatically cross-references what you're about to touch against active decisions. If a conflict is detected, it surfaces a single batched question — not a stream of prompts. If there's no conflict, it proceeds silently.

### Discussions

Exploratory conversations between you and the assistant are captured as `DISCUSSION-YYYY-MM-DD-slug.md` files. At close, a discussion links to its downstream artifact — a new phase, a decision, an issue, or a roadmap entry. Discussions can be resumed across sessions; the existing file is updated rather than duplicated.

The skill scores each discussion for relevancy before saving. Low-signal conversations are dropped silently; high-signal ones are saved automatically; borderline cases are escalated with a yes/no question.

### Instructions

Workflow preferences and agent behavior rules live in `.project-memory/instructions/`. Unlike decisions (which constrain the project), instructions constrain the agent's behavior for a specific user. Each instruction is a short prompt, scoped to the user who created it by email — other team members' instructions are never loaded into your session. Instructions can be dropped when no longer needed, and shared across users via a fork model.

**Example:** `"Before each phase, create a dedicated git branch. At phase close, merge back to main and delete the branch."` — once saved as an instruction, the assistant follows this automatically every session without being reminded.

### ADR Support

Architecture Decision Records can be maintained in parallel with `DECISION-*.md` files, in a format compatible with standard ADR tooling (MADR). ADR support is opt-in: during initialization you choose whether to enable it and where to store the files (default: `adr/` in the project root).

When enabled, every decision automatically gets a corresponding `adr/NNNN-slug.md` file. The drift audit (Category 8) keeps the two in sync. ADR support can be toggled at any time via `.project-memory/config.yml`.

### Eras

As phases accumulate, the skill periodically writes an `era-NNN.md` narrative summarizing that period's work. Eras provide long-term continuity: when a project has hundreds of phases, era summaries let the skill load a compressed view of history rather than scanning everything. Eras are indexed for semantic search alongside phases, decisions, and discussions. Era creation is gated to maintainers (see below).

### Author Attribution

All record types carry structured `created_by` and `contributors` frontmatter with `{name, email}` identity pairs. The skill captures git identity at write time and soft-fails to an `unknown` sentinel if identity cannot be determined — no escalation, no blocked workflow. This makes multi-contributor history queryable without any manual bookkeeping.

### Maintainer Role

A lightweight two-role system controls who receives era creation prompts. **Maintainers** are listed in `.project-memory/maintainers.md` by email; they get prompted when ~10 phases accumulate since the last era. **Developers** work identically — they just don't see era maintenance prompts. All other operations (phases, decisions, discussions, audit) are unrestricted for both roles.

---

## MCP Companion Server

An optional MCP server (`mcp-server/`) that dramatically improves memory quality and session performance. **Strongly suggested for any project beyond the first few phases.**

Without MCP the skill reads files sequentially. With MCP it runs semantic vector search over all record types in a single call — finding relevant prior decisions, similar past phases, and conflicting discussions with high accuracy, even when keyword overlap is low.

**What it provides:**
- `search_memory` — semantic search across phases, decisions, discussions, eras, and instructions, with `type_filter`, `created_by_email`, `touches_filter`, and `tags_filter` support
- `run_audit` — all 13 audit categories in a single deterministic call (vs. ~15 sequential LLM tool calls)
- `index_phase`, `index_decision`, `index_discussion`, `index_era`, `index_instruction` — upsert records into the vector index on write
- `find_similar_commit` — squash/rebase recovery via diff-based similarity search
- `check_consistency` and `rebuild_index` — DB/filesystem sync and full index rebuild

**Stack:** LanceDB + `all-MiniLM-L6-v2` local embeddings. No API key, no external service. Runs locally alongside the skill.

**Graceful degradation:** the file system is always the source of truth. MCP is a derived read-optimized index. If the server is unavailable, the skill falls back to file-based operation without data loss.

See `mcp-server/INSTALL.md` for setup instructions.

---

## Skill Files

| File | Purpose |
|---|---|
| `SKILL.md` | Entry point — on-load flow, argument dispatch (`audit`, `discuss`), core concepts, project structure |
| `gates.md` | Implementation gates (Pre-Implementation, Pre-Close), commit significance, topic shift, end-of-phase maintenance |
| `protocol.md` | Agent thinking protocol, memory loading strategy with token budgets, knowledge preservation |
| `cheatsheet.md` | Quick reference cheatsheet, event-based trigger table |
| `audit.md` | Drift detection and repair (13 categories, severity model, permanent skip via `audit_ignore`) |
| `init.md` | First-run initialization procedure |
| `templates.md` | File templates for phases, decisions, issues, discussions, eras, config |
| `conventions.md` | Naming conventions, lifecycle rules, decision resolution, discussion lifecycle, language policy |

---

## Usage

### First run

On first use in a project, the skill initializes `.project-memory/` and walks you through a short setup:

1. Asks for the project maintainer email
2. Asks whether to enable ADR support (and where to store files if yes)
3. Offers to install the MCP companion server if available
4. Creates stub summary files
5. Opens the first phase for whatever work is about to begin

After that, every session starts with `🧠 PROJECT MEMORY LOADED` and a drift audit that runs silently in the background.

### Everyday triggers

| You do this | Skill does this |
|---|---|
| Start significant work | Checks a phase is open; creates one if not |
| Make a commit | Classifies significance; attaches to the open phase |
| Plan a change touching a past decision | Surfaces any directional conflicts before you implement |
| Say "let's discuss X" or "tartışalım" | Enters discussion mode; saves outcome at close |
| Close a phase | Verifies all five phase documents are complete |
| ~10 phases since last era (maintainer only) | Prompts to create a new era summary |

### Instructions

Instructions let you encode persistent behaviors without editing any skill file. Tell the assistant what you want to happen automatically, and it saves it as an INSTRUCTION record scoped to your git email.

```
"From now on, create a dedicated git branch before each phase
(branch name = phase ID), and merge + delete it at phase close."
```

That instruction is loaded every session and followed without reminders. To stop following it: `"drop instruction branch-per-phase"`.

### Manual commands

```
# Run interactive drift audit
Skill project-memory audit

# Enter discussion mode explicitly
Skill project-memory discuss
```
