---
name: project-memory-templates-phase
description: Phase-related document templates for the standard profile. phase.yml is required; plan.md is optional. No implementation/review/followup files.
---

# Phase Templates (standard)

## phase.yml

```yaml
id: phase-YYYYMMDD-short-title
title: Human Readable Title
created_at: YYYY-MM-DD
status: planning
summary: null                # write before close: 1-2 sentences — what was done and why
branch: null
related_phases: []
commits: []
merge_commit: null
closed_at: null
abandoned_reason: null
issues_created: []
issues_resolved: []
decisions_referenced: []
implements_decision: null    # DECISION-YYYY-MM-DD-slug this phase directly implements; null if not decision-driven
tags: []
created_by:                  # required — see conventions/maintainer.md (Author Attribution)
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
# contributors field omitted in standard
```

**Differences from legacy full:**
- No `contributors` field. Standard only writes `created_by`.
- `summary` is still required before close, but the suggested length is 1-2 sentences (not 2-3).
- `tags` are still useful for tag-aware filtering in `phases/index.yml` — keep them populated.

**Orphan annotation format:** Audit Cat 7 annotates orphaned hashes as `<hash> [orphaned YYYY-MM-DD]`. Do not delete annotated entries.

**Sorting rule:** Phases sorted newest first in `index.yml`. Prepend new entries.

Status values: `planning` / `implementation` / `review` / `completed` / `abandoned`

Status transitions:
- `planning → implementation`: first commit lands.
- `implementation → completed`: Pre-Commit Gate passes (commits sanity + summary filled).
- `review` is rarely used — there is no review-and-fixes.md to gate on.
- `any → abandoned`: work cancelled. Add `abandoned_reason` and `closed_at`.

---

## plan.md (optional)

```md
# Goal
# Context
# Planned Changes
# Success Criteria
```

Standard drops the `Historical Context`, `Existing Constraints`, and `Risk Analysis` sections from the legacy full template.

`plan.md` is **optional** in standard. Skip it for:
- Short refactors with a single, obvious goal.
- Bug fixes where the fix itself is the explanation.
- Doc updates.

Write it for:
- Multi-step work where intent matters before the diff.
- Anything that touches multiple modules.
- Anything where you want a checklist of TODOs.

---

## Files NOT in standard phases

- `implementation.md` — legacy full's "engineering intent summary" file. In standard, intent goes into `phase.yml.summary` (one or two sentences) or directly into commit messages.
- `review-and-fixes.md` — legacy full's review-round log. Reviews happen in PR comments, code-review chat, or directly on the commit. No separate file.
- `followup.md` — legacy full's "what remains" file. Remaining items go directly into `summaries/roadmap.md`.

---

# Era Summary

Eras are an orthogonal maintainer feature. New era files (era-NNN.md) use this frontmatter:

```yaml
id: era-NNN
title: "Era N — Short Title"
date_range: "YYYY-MM-DD to YYYY-MM-DD"
records:
  - DECISION-YYYY-MM-DD-slug
  - DISCUSSION-YYYY-MM-DD-slug
created_by:
  name: "Your Name"
  email: "your@email.com"
```

The era trigger is: ~6 weeks since last era OR ~30 significant commits since last era, maintainer-confirmed as today. See `conventions/maintainer.md` → Maintainer Role for the full cadence rule.

**Legacy note:** Existing era files under `.project-memory/eras/` carry a `phases:` field which is historical metadata. Do not remove or modify `phases:` in existing era files.
