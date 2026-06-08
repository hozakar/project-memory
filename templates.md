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
affected_areas: []
files_expected: []
commits: []
merge_commit: null           # set only if branch was merged; null for direct-commit phases
closed_at: null              # set to YYYY-MM-DD when phase completes (non-merge close)
issues_created: []
issues_resolved: []
decisions_referenced: []
tags: []
```

Status values: `planning` / `implementation` / `review` / `completed`

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

## project-memory.md

Target size: 500–1500 words.

```md
# Project Memory

## Project Purpose
## Current Architecture
## Major Decisions
## Active Tensions
  Unresolved tradeoffs the project is navigating.
## Anti-Patterns
  Agent adds entries autonomously when pattern observed with high confidence.
## Rejected Decisions
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
