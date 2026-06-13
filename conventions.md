---
name: project-memory-conventions
description: Conventions dispatcher for project-memory. Routes to topic-specific sub-files to keep per-session token load low. Read the relevant sub-file for the record type or rule you need.
---

# Conventions — Index

This file is a dispatcher. Read the appropriate sub-file:

| Topic | File | Contains |
|-------|------|----------|
| **Decisions, ADR** | `conventions-decisions.md` | Decision lifecycle, ADR creation steps (adr_enabled gate), ADR Status mapping, Decision Resolution Rules (supersession → active conflict → refinement → recency), Touches Field Guidance |
| **Discussions** | `conventions-discussions.md` | Discussion lifecycle, relevancy scoring gate (25-55-10-10), safety rule, long-term impact rubric, outcome chain, resume, expiry (30-day), Pre-Implementation Gate integration |
| **Issues** | `conventions-records.md` | Issue lifecycle (open → close), frontmatter schema, move-to-closed procedure |
| **Instructions** | `conventions-records.md` | Instruction lifecycle (active ↔ dropped), session loading, cross-user fork model, scope limits |
| **Assignments** | `conventions-records.md` | Assignment state machine (pending → accepted → ongoing → completed/rejected), session-start UX, completion rules, permission model |
| **Language** | `conventions-maintainer.md` | English-only rule for skill files, rationale |
| **Author Attribution** | `conventions-maintainer.md` | `created_by` + `contributors` capture rules, soft-fail to `unknown`, dedup by email, growth triggers per record type, out-of-scope records |
| **Maintainer Role** | `conventions-maintainer.md` | Two-role system (maintainer/developer), era creation gating, `maintainers.md` format, role determination |

---

# Quick Reference

```
Creating a decision?        → read conventions-decisions.md (ADR steps + touches guidance)
Resolving decision overlap? → read conventions-decisions.md (Decision Resolution Rules)
Closing a discussion?       → read conventions-discussions.md (relevancy scoring + outcome types)
Opening/closing an issue?   → read conventions-records.md (Issues section)
Creating an instruction?    → read conventions-records.md (Instructions section)
Creating an assignment?     → read conventions-records.md (Assignments section)
Need attribution fields?    → read conventions-maintainer.md (Author Attribution)
Checking your role?         → read conventions-maintainer.md (Maintainer Role)
```
