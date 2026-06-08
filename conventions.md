---
name: project-memory-conventions
description: Naming conventions and lifecycle rules for DECISION and ISSUE files. Read when creating or closing decisions or issues.
---

# Conventions

## Architectural Decision Records

Create when architecture changes, major dependencies are introduced, important tradeoffs are made, or a significant alternative was rejected.

**Naming:** `DECISION-YYYY-MM-DD-<short-slug>.md`
- Date first — chronological sort order in directory listings
- Slug describes the decision topic, not the outcome (e.g. `no-auth-profile-only`, `stop-failed-cancel-cancelled`)
- Use kebab-case
- Example: `DECISION-2026-06-06-no-auth-profile-only.md`

```md
# Decision
# Context
# Alternatives Considered
  Option A — why rejected
  Option B — why rejected
# Chosen Solution
# Reasoning
# Consequences
  Benefits / Tradeoffs / Future implications
```

Rejected alternatives are first-class content. Future agents need to know what was tried and why it didn't fit.

**After writing any DECISION file:** immediately add a one-liner per rejected alternative to `project-memory.md` → Rejected Decisions. The DECISION file has the full reasoning; the summary entry is a one-line pointer (using the full DECISION-YYYY-MM-DD-slug identifier) so future agents know to look there.

---

## Issues

Issues track bugs and problems that need fixing. Open issues live in `issues/open/`, resolved issues in `issues/closed/`.

**Naming:** `ISSUE-YYYY-MM-DD-<short-slug>.md`
- Date = discovery date
- Slug describes the problem
- Use kebab-case
- Example: `ISSUE-2026-06-07-nothing-to-commit-detection.md`

**Frontmatter:**
```yaml
---
id: ISSUE-YYYY-MM-DD-short-slug
title: Human readable title
severity: critical | high | medium | low
status: open | closed
area: pipeline | git | ui | config | ...
discovered: YYYY-MM-DD
resolved: YYYY-MM-DD          # set when closing
resolved_in: phase-id (commit hash)   # set when closing
---
```

**On close:** update `status` to `closed`, add `resolved` and `resolved_in` fields, then move the file from `issues/open/` to `issues/closed/`.
