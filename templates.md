---
name: project-memory-templates
description: Document templates for project-memory phases and summaries. Read when creating new phase files or summary stubs.
---

# Document Templates

## phase.yml

```yaml
id: phase-YYYYMMDD-short-title
title: Human Readable Title
created_at: YYYY-MM-DD
status: planning
branch: null                 # set if a dedicated branch exists; null for direct commits
related_phases: []
commits: []
merge_commit: null           # set only if branch was merged; null for direct-commit phases
closed_at: null              # set to YYYY-MM-DD when phase completes or is abandoned (non-merge)
abandoned_reason: null       # set only when status: abandoned
issues_created: []
issues_resolved: []
decisions_referenced: []
tags: []
```

**Sorting rule:** Phases are sorted newest first in `index.yml`. When a new phase is created, prepend it to the `phases` array. This matches the convention in `decisions/index.md` and ensures the Memory Loading Strategy can truncate safely.

Status values: `planning` / `implementation` / `review` / `completed` / `abandoned`

Status transitions:
- `planning â†’ implementation`: first significant commit lands
- `implementation â†’ review`: user requests review, or pre-close gate is triggered
- `review â†’ completed`: pre-close gate passes (all three files complete and non-stub)
- `any â†’ abandoned`: user declares work cancelled, branch deleted without merge, or work superseded by a new phase

When setting `abandoned`: add `abandoned_reason: <brief description>` field and set `closed_at` to today.

---

## plan.md

```md
# Goal
# Context
# Historical Context
  Relevant phases (from index.yml tags)
  Relevant decisions
  Relevant issues
# Existing Constraints
  Architecture constraints / dependencies / technical debt
  Active tensions that affect this plan
# Planned Changes
# Risk Analysis
  Potential side effects / known anti-patterns to avoid
# Success Criteria
```

---

## implementation.md

Do not copy diffs from git. Summarize engineering intent.

```md
# Summary
# Related Commits
# Architectural Impact
# Deviations From Plan
# Notes
# Lessons Learned
```

---

## review-and-fixes.md

```md
# Review & Fix Log

## Round 1
### Findings
(Critical / High / Medium / Low)
### Actions Taken
```

---

## followup.md

```md
# Remaining Open Issues
# Technical Debt Introduced
# Recommended Next Phases
# Refactoring Opportunities
# Testing Improvements
# Architectural Improvements
```

---

## decisions/index.md

One-row-per-decision summary table. Loaded by Claude at session start and consulted during the Pre-Implementation Gate. Each row mirrors the frontmatter of its DECISION file.

The index has two sections: **Active** (scanned during Pre-Implementation Gate) and **Superseded** (historical context only, loaded on demand).

```md
# Decisions Index

One row per decision. Loaded at session start by Memory Loading Strategy step 8. Primary input to the Pre-Implementation Gate's decision check.

Rows sorted newest first. `Status: superseded` rows remain in the Superseded section for historical context but are not active constraints. `Touches` column lists concrete entities — match against an implementation's affected entities to find candidates.

| Date | ID | Scope | Status | Touches | Claim |
|---|---|---|---|---|---|
| 2026-06-08 | DECISION-2026-06-08-decision-cross-reference-mechanism | skill | active | decisions, pre-impl-gate, touches | Decision cross-reference is mandatory pre-implementation step; supersedes is primary, recency is fallback |

## Superseded

| Date | ID | Scope | Status | Touches | Claim | Superseded By |
|---|---|---|---|---|---|---|
```

Maintenance rules:
- Every new `DECISION-*.md` file gets a row added to the Active section in the same write batch.
- When a decision is superseded, move its row from the Active section to the **Superseded** section; update Status to `superseded`; add the Superseded By entry.
- Do not delete rows — historical context is preserved in the Superseded section.
- Claim column is one short sentence — the testable assertion the decision makes. Not a description of the topic.
- Rows sorted newest first within each section.
- Pre-Implementation Gate scans ONLY the Active section. Superseded section is loaded on explicit historical lookup only.

---

## DECISION-YYYY-MM-DD-slug.md

See `conventions.md` for the required frontmatter schema (`id`, `status`, `primary_scope`, `touches`, `supersedes`, `superseded_by`) and Decision Resolution Rules.

---

## DISCUSSION-YYYY-MM-DD-slug.md

**Frontmatter (required):**
```yaml
---
id: DISCUSSION-YYYY-MM-DD-short-slug
title: Human readable title
date: YYYY-MM-DD
status: open | concluded
summary: Brief summary of the discussion
conclusion: What was decided or resolved
outcome:
  type: phase | decision | issue | roadmap | none
  id: phase-YYYYMMDD-... | DECISION-YYYY-... | ISSUE-YYYY-... | null
  summary: ""               # free-text for roadmap entries; null otherwise
tags: []
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
- When a discussion is concluded, update its Status to concluded.
- Outcome column shows the linked artifact ID or `none`.
- Rows sorted newest first.

## project-memory.md

Target size: 500â€“1500 words.

```md
# Project Memory

## Project Purpose
## Current Architecture
## Active Tensions
  Unresolved tradeoffs the project is navigating.
## Anti-Patterns
  Agent adds entries autonomously when pattern observed with high confidence.
## Rejected Decisions
  Alternatives not taken. One-liner per entry pointing to the full DECISION-YYYY-MM-DD-slug.md file.
  Agent asks user "why did we not go with X?" when reason is unknown.
## Open Problems
## Technical Debt
## Important Constraints
## Recent Completed Work
## Current Priorities
## Recommended Next Phase
## Navigation Map
  - Architectural questions â†’ architecture.md + DECISION-YYYY-MM-DD-* files
  - Active work â†’ current-state.md + open phase directory
  - History in a specific area â†’ filter phases/index.yml by tag
  - Known issues â†’ active-issues.md â†’ issues/open/ (open) or issues/closed/ (resolved)
  - Past tradeoffs â†’ decisions/
  - Project philosophy â†’ project-memory.md
```

