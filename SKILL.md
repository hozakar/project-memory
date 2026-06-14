---
name: project-memory
version: 0.0.2
description: Project memory and phase management system. Loads at every session start to provide engineering context → history, decisions, active tensions, anti-patterns. Use when planning, implementing, reviewing, or closing phases. Always active in this project.
---

# On Load

When this skill activates:

1. Output exactly this line:
   🧠 PROJECT MEMORY LOADED

2. Check whether `.project-memory/` exists in the project root.
   - **Does not exist:** read `init.md` and follow its instructions.
   - **Exists:** read `protocol.md` for the Memory Loading Strategy and follow it — loads summaries, active phase, instructions, assignments, and determines role (maintainer/developer).

3. Run Drift Audit — read `audit.md` for the dispatcher (routes to `audit-mcp.md` or `audit-fs.md` based on MCP availability). Auto-fix findings silently. Interactive triage only on Cat 4 edge cases.

4. Continue with the session. Do not ask the user for anything at this step.

---

# Arguments

## audit

When invoked as `Skill project-memory audit`, enter **Interactive Audit Mode**: read `audit.md` → Interactive Mode. Prompt user per finding; re-run detection; loop until clean.

## discuss

When invoked as `Skill project-memory discuss`, or on implicit triggers (e.g. "tartışalım", "let's discuss"), enter **Discussion Mode**: read `conventions-discussions.md` for the full lifecycle. Load `discussions/index.md` for prior context. At close, apply relevancy scoring gate (25-55-10-10). If saving: write DISCUSSION file, update index.

**Implicit triggers:** Turkish and English planning/brainstorming phrases. Lenient detection.

**Resume:** "continue this discussion" → load existing DISCUSSION file, UPDATE it at close.

---

# MCP Companion

The optional `mcp-server/` subdirectory provides semantic search and deterministic audits. Read `mcp-integration.md` for availability detection, tool catalog, proactive sync, and degradation rules. MCP is an accelerator, never a requirement.

---

# CRITICAL GATES

```
BEFORE IMPLEMENTATION → phase must exist → create it first
BEFORE MERGE/CLOSE    → Pre-Close Gate must pass (3 files complete)
BEFORE SESSION END    → if significant commits landed, phase must be updated
PIPELINE SUBMISSION   → counts as implementation → phase must exist before submit
```

For detailed gate procedures, commit significance, topic shift → read `gates.md`.
For agent thinking protocol and memory loading → read `protocol.md`.
For quick reference cheatsheet → read `cheatsheet.md`.

---

# Core Principles

Git answers: what changed, where, when, what is the diff.

Project Memory answers: why it was changed, what alternatives were considered and rejected, what constraints existed, what tensions are unresolved, what approaches have proven harmful, what should happen next.

Git is the source of truth for code changes. `.project-memory/` is the source of truth for engineering reasoning.

Records carry author attribution via `created_by` and `contributors` frontmatter fields. Full rules: `conventions-maintainer.md` → Author Attribution.

---

# Project Structure

## `.project-memory/` (per-project data)

```
.project-memory/
├── phases/           phase-YYYYMMDD-slug/{phase.yml, plan.md, implementation.md, review-and-fixes.md, followup.md}
├── decisions/        DECISION-YYYY-MM-DD-slug.md + index.md
├── discussions/      DISCUSSION-YYYY-MM-DD-slug.md + index.md
├── issues/           open/ + closed/
├── instructions/     INSTRUCTION-YYYY-MM-DD-slug.md
├── assignments/      ASSIGNMENT-YYYY-MM-DD-slug.md + index.yml
├── eras/             era-NNN.md + index.yml
└── summaries/        project-memory, current-state, architecture, active-issues, roadmap
```

## Skill Files (read-only reference)

```
.claude/skills/project-memory/
├── SKILL.md                   ← Entry point (this file)
├── gates.md                   ← Implementation gates, commit rules, phase lifecycle
├── protocol.md                ← Agent thinking protocol, memory loading, knowledge preservation
├── cheatsheet.md              ← Quick reference, event-based triggers
├── audit.md                   ← Drift audit dispatcher → audit-mcp.md or audit-fs.md
├── audit-mcp.md               ← MCP-driven drift detection (run_audit fast path)
├── audit-fs.md                ← File-system drift detection (14 categories)
├── mcp-integration.md         ← MCP tool catalog, proactive sync, degradation rules
├── init.md                    ← First-run initialization
├── templates.md               ← Template dispatcher → templates-phase / -records / -config
├── templates-phase.md         ← Phase and era templates
├── templates-records.md       ← Decision, discussion, instruction, assignment templates
├── templates-config.md        ← Config and summary templates
├── conventions.md             ← Conventions dispatcher → -decisions / -discussions / -records / -maintainer
├── conventions-decisions.md   ← Decision lifecycle, ADR, touches, resolution rules
├── conventions-discussions.md ← Discussion lifecycle, relevancy scoring, expiry
├── conventions-records.md     ← Issues, Instructions, Assignments lifecycles
├── conventions-maintainer.md  ← Language, Author Attribution, Maintainer Role
└── README.md                  ← Human-readable overview
```

---

# Phase Lifecycle

```
Significant work begins → Phase created (status: planning)
          ↓
Commits accumulate → phase.yml updated with commit hashes
          ↓
Work unit complete → Phase closes (status: completed)
                     followup.md → roadmap.md transfer (mandatory)
```

**Key rules:**
- Phase created BEFORE first significant commit → see `gates.md` for commit significance.
- Required files: `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`. Templates in `templates-phase.md`.
- Phase status transitions and close criteria in `gates.md`.
- Phases sorted newest first in `index.yml`. Prepend on creation.

---

# Records & Conventions

For naming conventions, file templates, lifecycle rules, and the Decision Resolution Rules → read `conventions.md` (dispatcher — routes to topic-specific sub-files).

For decision lifecycle, ADR steps, touches guidance → `conventions-decisions.md`.
For discussion lifecycle, relevancy scoring, expiry → `conventions-discussions.md`.
For issue, instruction, assignment lifecycles → `conventions-records.md`.
For language policy, author attribution, maintainer role → `conventions-maintainer.md`.

---

# Quick Reference

```
About to commit?          → Classify significance, check phase exists
About to open a phase?    → phase.yml + plan.md stub + index.yml entry
About to close a phase?   → Verify 3 files: implementation + review + followup
About to close discussion?→ Determine outcome, write file, update index
About to assign work?     → Create ASSIGNMENT-YYYY-MM-DD-slug.md + index entry
About to implement?       → Pre-Implementation Gate (gates.md)
About to receive assignment?→ Accept / Reject / Remind at session start
```

For the full quick reference → read `cheatsheet.md`.
