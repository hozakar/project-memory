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
â”œâ”€â”€ phases/
â”‚   â”œâ”€â”€ index.yml
â”‚   â””â”€â”€ phase-YYYYMMDD-short-title/
â”‚       â”œâ”€â”€ phase.yml
â”‚       â”œâ”€â”€ plan.md
â”‚       â”œâ”€â”€ implementation.md
â”‚       â”œâ”€â”€ review-and-fixes.md
â”‚       â””â”€â”€ followup.md
â”œâ”€â”€ decisions/
â”‚   â”œâ”€â”€ index.md
â”‚   â””â”€â”€ DECISION-YYYY-MM-DD-slug.md
â”œâ”€â”€ discussions/
â”‚   â”œâ”€â”€ index.md
â”‚   â””â”€â”€ DISCUSSION-YYYY-MM-DD-slug.md
â”œâ”€â”€ issues/
â”‚   â”œâ”€â”€ open/
â”‚   â””â”€â”€ closed/
â””â”€â”€ summaries/
    â”œâ”€â”€ project-memory.md
    â”œâ”€â”€ current-state.md
    â”œâ”€â”€ architecture.md
    â”œâ”€â”€ active-issues.md
    â””â”€â”€ roadmap.md
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
| File | Purpose |
|---|---|
| `SKILL.md` | Entry point — on-load flow, argument dispatch (audit, discuss), core concepts, project structure |
| `gates.md` | Implementation gates (Pre-Implementation, Pre-Close), commit significance, topic shift, end-of-phase maintenance |
| `protocol.md` | Agent thinking protocol, memory loading strategy with token budgets, knowledge preservation |
| `cheatsheet.md` | Quick reference cheatsheet, event-based trigger table |
| `audit.md` | Drift detection and repair procedures (6 categories) |
| `init.md` | First-run initialization procedure |
| `templates.md` | File templates for phases, decisions, issues, discussions, indexes |
| `conventions.md` | Naming conventions, lifecycle rules, decision resolution rules, discussion lifecycle, language policy |

## Usage

The skill activates automatically at session start via the `project-memory` skill entry. On load it:

1. Emits `[âœ…] PROJECT MEMORY LOADED`
2. Reads active phase context if one is open
3. Runs a drift audit across 6 detection categories (including decision-index drift) and auto-fixes or escalates findings

To run an interactive audit manually:

```
Skill project-memory audit
```
