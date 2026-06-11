# project-memory

A Claude Code skill that provides persistent engineering memory and phase management for software projects.

## What It Does

`project-memory` separates two concerns git cannot address:

- **Git** answers: what changed, where, when, what is the diff.
- **Project Memory** answers: why it was changed, what alternatives were rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, what should happen next.

The skill maintains a `.project-memory/` directory in your project root, structured to preserve engineering reasoning across sessions, team members, and context resets.

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

A phase is a logical unit of work (not a branch). It opens when significant work begins and closes when that work unit is complete.

**Mandatory gates:**
- **Pre-Implementation:** A phase must exist before any significant implementation work starts.
- **Pre-Close:** `implementation.md`, `review-and-fixes.md`, and `followup.md` must all be complete before a phase can close.

### Summaries

`summaries/` contains living documents updated at every phase close:

| File | Purpose |
|---|---|
| `project-memory.md` | Core context: history, decisions, tensions, anti-patterns, priorities |
| `current-state.md` | Features, components, debt, risks, next actions |
| `architecture.md` | Module inventory, updated when structure changes |
| `active-issues.md` | Open issues index |
| `roadmap.md` | Upcoming work, fed from `followup.md` at phase close |

### Decisions

Architectural and design decisions are recorded as `DECISION-YYYY-MM-DD-slug.md` files. Rejected alternatives are logged to prevent re-litigating settled choices. A live summary table at `decisions/index.md` is loaded at session start and consulted during the Pre-Implementation Gate; when a planned change touches the same entities as an active decision, the gate batches any directional conflicts into a single question before implementation proceeds.

## Skill Files

| File | Purpose |
|---|---|
| `SKILL.md` | Entry point — on-load flow, argument handling, critical gates |
| `init.md` | First-run initialization procedure |
| `audit.md` | Drift detection and repair procedures |
| `templates.md` | File templates for phases, decisions, issues, summaries |
| `conventions.md` | Naming conventions, lifecycle rules, decision-resolution rules, and language policy |

## Usage

The skill activates automatically at session start via the `project-memory` skill entry. On load it:

1. Emits `[🧠] PROJECT MEMORY LOADED`
2. Reads active phase context if one is open
3. Runs a drift audit across 6 detection categories (including decision-index drift) and auto-fixes or escalates findings

To run an interactive audit manually:

```
Skill project-memory audit
```
