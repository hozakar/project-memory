---
name: project-memory-templates-phase-lite
description: Lite-profile phase templates. phase.yml is required; plan.md is optional. No implementation/review/followup files.
---

# Phase Templates (lite)

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
tags: []
created_by:                  # required — see conventions-maintainer.md (Author Attribution → lite scope)
  name: "Hakan Ozakar"
  email: "hozakar@gmail.com"
# contributors field omitted in lite
```

**Differences from full:**
- No `contributors` field. Lite only writes `created_by`. See `conventions-maintainer.md` → Author Attribution → lite scope.
- `summary` is still required at Pre-Close, but the suggested length is 1-2 sentences (not 2-3).
- `tags` are still useful for tag-aware filtering in `phases/index.yml` — keep them populated.

**Orphan annotation format:** Same as full. Audit Cat 7 annotates orphaned hashes as `<hash> [orphaned YYYY-MM-DD]`. Do not delete annotated entries.

**Sorting rule:** Phases sorted newest first in `index.yml`. Prepend new entries.

Status values: `planning` / `implementation` / `review` / `completed` / `abandoned`

Status transitions (lite — simpler):
- `planning → implementation`: first commit lands.
- `implementation → completed`: Pre-Close Gate passes (commits sanity + summary filled).
- `review` is rarely used in lite — there is no review-and-fixes.md to gate on. Most lite phases go directly `implementation → completed`.
- `any → abandoned`: work cancelled. Add `abandoned_reason` and `closed_at`.

---

## plan.md (optional)

```md
# Goal
# Context
# Planned Changes
# Success Criteria
```

Lite drops the `Historical Context`, `Existing Constraints`, and `Risk Analysis` sections from the full template. If you find yourself wanting them, you're probably planning more deeply than lite is intended for — consider upgrading to `full`.

`plan.md` is **optional** in lite. Skip it for:
- Short refactors with a single, obvious goal.
- Bug fixes where the fix itself is the explanation.
- Doc updates.

Write it for:
- Multi-step work where intent matters before the diff.
- Anything that touches multiple modules.
- Anything where you want a checklist of TODOs (the Pre-Close Gate scans for unchecked items).

---

## Files NOT in lite phases

- `implementation.md` — full's "engineering intent summary" file. In lite, intent goes into `phase.yml.summary` (one or two sentences) or directly into commit messages.
- `review-and-fixes.md` — full's review-round log. Lite expects reviews to happen in PR comments, code-review chat, or directly on the commit. No separate file.
- `followup.md` — full's "what remains" file. Lite adds remaining items directly to `summaries/roadmap.md` as the work progresses, not at close.

If a phase grows complex enough to need any of these files, that's a signal to upgrade to `full`.

---

# Era Summary

Eras are an orthogonal maintainer feature. The lite era template is identical to full. See `full/templates-phase.md` → Era Summary if you opt into eras under lite.
