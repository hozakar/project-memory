---
name: project-memory-templates
description: Template dispatcher for project-memory. Profile-aware for phase and config/summary templates (which differ across standard/minimal); record templates are shared. Read the relevant sub-file when creating new records.
---

# Templates — Index

This file is a dispatcher. Phase and config templates live under `<profile>/` because they diverge across profiles; record templates and attribution schemas are shared at the root.

| Record Type | Template File | Contains |
|---|---|---|
| **Phase** | `<profile>/templates-phase.md` | standard: `phase.yml` + optional `plan.md`; minimal: n/a (use `MEMORY.md` log) |
| **Decision, ADR** | `templates/decisions.md` | `DECISION-*.md`, `adr/NNNN-*.md`, `decisions/index.md` |
| **Discussion** | `templates/discussions.md` | `DISCUSSION-*.md`, `discussions/index.md` |
| **Instruction** | `templates/instructions.md` | `INSTRUCTION-*.md` |
| **Assignment** | `templates/assignments.md` | `ASSIGNMENT-*.md`, `assignments/index.yml` |
| **Note** | `templates/notes.md` | `NOTE-*.md` — personal, deletable, user-scoped |
| **Author Attribution** | `templates/attribution.md` | `created_by` + `contributors` schema (standard omits `contributors`; minimal omits both) |
| **Config** | `<profile>/templates-config.md` | `.project-memory/config.yml`, `maintainers.md`, summary scaffolding |
| **Summaries** | `<profile>/templates-config.md` | standard: roadmap + current-state; minimal: inline `MEMORY.md` sections |
| **Era** | `<profile>/templates-phase.md` | Era summary (`era-NNN.md`) — standard only |

`<profile>` is `standard`. For `minimal`, all template needs are covered by `minimal/minimal.md`.

---

# Quick Reference

```
Creating a phase?           → read <profile>/templates-phase.md
Creating a decision?        → read templates/decisions.md (DECISION + decisions/index.md; ADR if adr_enabled)
Creating a discussion?      → read templates/discussions.md (DISCUSSION + discussions/index.md)
Creating an instruction?    → read templates/instructions.md
Creating an assignment?     → read templates/assignments.md (ASSIGNMENT + assignments/index.yml)
Creating a note?            → read templates/notes.md
Setting up config?          → read <profile>/templates-config.md (config.yml + maintainers.md)
Writing summaries?          → read <profile>/templates-config.md
Need attribution fields?    → read templates/attribution.md (note profile-specific scope)
Creating an era?            → read <profile>/templates-phase.md (Era Summary section, standard only)
```
