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
- `planning → implementation`: first significant commit lands
- `implementation → review`: user requests review, or pre-close gate is triggered
- `review → completed`: pre-close gate passes (all three files complete and non-stub)
- `any → abandoned`: user declares work cancelled, branch deleted without merge, or work superseded by a new phase

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

```md
# Decisions Index

| Date | ID | Scope | Status | Touches | Claim |
|---|---|---|---|---|---|
| 2026-06-08 | DECISION-2026-06-08-decision-cross-reference-mechanism | skill | active | decisions, pre-impl-gate, touches | Decision cross-reference is mandatory pre-implementation step; supersedes is primary, recency is fallback |
```

Maintenance rules:
- Every new `DECISION-*.md` file gets a row added in the same write batch.
- When a decision is superseded, update its `Status` cell to `superseded` (do not delete the row — historical context).
- Claim column is one short sentence — the testable assertion the decision makes. Not a description of the topic.
- Rows sorted newest first.

---

## DECISION-YYYY-MM-DD-slug.md

See `conventions.md` for the required frontmatter schema (`id`, `status`, `primary_scope`, `touches`, `supersedes`, `superseded_by`) and Decision Resolution Rules.

---

## project-memory.md

Target size: 500–1500 words.

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
  - Architectural questions → architecture.md + DECISION-YYYY-MM-DD-* files
  - Active work → current-state.md + open phase directory
  - History in a specific area → filter phases/index.yml by tag
  - Known issues → active-issues.md → issues/open/ (open) or issues/closed/ (resolved)
  - Past tradeoffs → decisions/
  - Project philosophy → project-memory.md
```
