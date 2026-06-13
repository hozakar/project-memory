---
name: project-memory-templates
description: Template dispatcher for project-memory. Each record type's templates live in a dedicated sub-file to keep per-session token load low. Read the relevant sub-file when creating new records.
---

# Templates — Index

This file is a dispatcher. Read the appropriate sub-file for the record type you need:

| Record Type | Template File | Contains |
|-------------|--------------|----------|
| **Phase** | `templates-phase.md` | `phase.yml`, `plan.md`, `implementation.md`, `review-and-fixes.md`, `followup.md`, era summary (`era-NNN.md`) |
| **Decision, ADR** | `templates-records.md` | `DECISION-*.md`, `adr/NNNN-*.md`, `decisions/index.md` |
| **Discussion** | `templates-records.md` | `DISCUSSION-*.md`, `discussions/index.md` |
| **Instruction** | `templates-records.md` | `INSTRUCTION-*.md` |
| **Assignment** | `templates-records.md` | `ASSIGNMENT-*.md`, `assignments/index.yml` |
| **Author Attribution** | `templates-records.md` | `created_by` + `contributors` schema (shared across all records) |
| **Config** | `templates-config.md` | `.project-memory/config.yml`, `maintainers.md` |
| **Summaries** | `templates-config.md` | `project-memory.md` (including rolling summaries rule) |

---

# Quick Reference

```
Creating a phase?           → read templates-phase.md
Creating a decision?        → read templates-records.md (DECISION + adr/ + decisions/index.md)
Creating a discussion?      → read templates-records.md (DISCUSSION + discussions/index.md)
Creating an instruction?    → read templates-records.md (INSTRUCTION)
Creating an assignment?     → read templates-records.md (ASSIGNMENT + assignments/index.yml)
Setting up config?          → read templates-config.md (config.yml + maintainers.md)
Writing summaries?          → read templates-config.md (project-memory.md)
Need attribution fields?    → read templates-records.md (Author Attribution section)
Creating an era?            → read templates-phase.md (Era Summary section)
```
