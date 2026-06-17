---
name: project-memory-templates-discussions
description: Templates for DISCUSSION records and discussions/index.md. Author Attribution schema in templates-attribution.md.
---

# Discussion Templates

## DISCUSSION-YYYY-MM-DD-slug.md

**Frontmatter (required):**
```yaml
---
id: DISCUSSION-YYYY-MM-DD-short-slug
title: Human readable title
date: YYYY-MM-DD
status: open | concluded
provenance: directive | collaborative  # directive = user-imposed; collaborative = joint design
summary: Brief summary of the discussion
conclusion: What was decided or resolved
outcome:
  type: phase | decision | issue | roadmap | none
  id: phase-YYYYMMDD-... | DECISION-YYYY-... | ISSUE-YYYY-... | null
  summary: ""               # free-text for roadmap entries; null otherwise
tags: []
created_by:                 # required — see templates-attribution.md
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:               # required — appended on resume / close
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
---
```

**Body:**
```md
# Context
Why this discussion started.

# Discussion Points
What was debated. Key questions and answers. Alternatives floated.

# Conclusions
What was decided. What was ruled out and why.

# Follow-up Actions
What should happen next as a result of this discussion.
```

**Outcome types:**

| type | id field | summary field | Behavior |
|------|----------|---------------|----------|
| phase | phase-YYYYMMDD-slug | null | Discussion triggered a new phase |
| decision | DECISION-YYYY-MM-DD-slug | null | Discussion resulted in a formal decision |
| issue | ISSUE-YYYY-MM-DD-slug | null | Discussion identified a bug or problem |
| roadmap | null | free-text entry | Discussion produced a roadmap item (no immediate phase) |
| `none` | null | null | Discussion was exploratory; no concrete artifact produced |

**Resume rule:** When the user says "continue this discussion", load the existing file, continue, and UPDATE it at close. Do NOT create a new DISCUSSION file for the same topic.

---

## discussions/index.md

One-row-per-discussion summary table. Loaded at session start by SKILL.md Memory Loading Strategy. Consulted during the Pre-Implementation Gate alongside decisions/index.md.

```md
# Discussions Index

| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|
| 2026-06-11 | DISCUSSION-2026-06-11-slug | concluded | phase-20260611-... | feature, discussion | Brief one-line summary |
```

Maintenance rules:
- Every new DISCUSSION-*.md file gets a row added in the same write batch.
- When a discussion is concluded, update its Status to `concluded`.
- Outcome column shows the linked artifact ID or `none`.
- Rows sorted newest first.
- Expired discussions (`outcome: none` AND older than 30 days) are removed from this index and moved to `discussions/archive/`. See `conventions.md` Expiry rule.
