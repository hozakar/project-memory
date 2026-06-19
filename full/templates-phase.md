---
name: project-memory-templates-phase
description: Phase-related document templates for project-memory. Covers phase.yml, plan.md, implementation.md, review-and-fixes.md, followup.md, and era summaries.
---

# Phase Templates

## phase.yml

```yaml
id: phase-YYYYMMDD-short-title
title: Human Readable Title
created_at: YYYY-MM-DD
status: planning
summary: null                # written at Pre-Close Gate: 2-3 sentences — what was done and why
branch: null                 # set if a dedicated branch exists; null for direct commits
related_phases: []
commits: []                  # list of commit hashes; orphaned entries annotated as: abc1234 [orphaned YYYY-MM-DD]
    merge_commit: null           # set only if branch was merged; null for direct-commit phases; orphaned form: abc1234 [orphaned YYYY-MM-DD]
    # --- Phase dependency graph (C3) ---
    depends_on: []               # Phase IDs that must complete before this one can start
    enables: []                  # Phase IDs this phase unblocks when completed
    conflicts_with: []           # Phase IDs that may conflict (same files, competing approaches)
closed_at: null              # set to YYYY-MM-DD when phase completes or is abandoned (non-merge)
abandoned_reason: null       # set only when status: abandoned
issues_created: []
issues_resolved: []
decisions_referenced: []
implements_decision: null    # DECISION-YYYY-MM-DD-slug this phase directly implements; null if not decision-driven
tags: []
created_by:                  # required — see templates-attribution.md
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
contributors:                # required — list grows on status-changing writes
  - name: "Hakan Ozakar"
    email: "hozakar@gmail.com"
```

**Orphan annotation format:** When a commit hash stored in `commits:` or `merge_commit` no longer exists in git (due to rebase, squash, or force-push), the drift audit (Category 7) annotates it in place: `<hash> [orphaned YYYY-MM-DD]`. Do NOT delete orphaned entries — the annotation preserves the historical record while making the broken linkage explicit. Annotated hashes are skipped in subsequent audit passes.

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

# Era Summary (era-NNN.md)

Stored in `.project-memory/eras/era-NNN.md`. Created when a cohort of ~10 phases forms a natural narrative arc. Indexed into the vector DB via `index_era`. Template in `templates.md` → Era Summary.
