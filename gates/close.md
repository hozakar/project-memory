---
name: project-memory-gates-close
description: Pre-Close Gate and End-of-Phase Maintenance for the standard profile.
---

# Pre-Close Gate

## Standard Profile

**Before closing any phase** (merge, logical completion, or explicit user declaration), verify the following:

1. **`phase.yml.commits` non-empty.** If empty, ask once: "This phase has no commits recorded. Close anyway?" (sanity check).
2. **`plan.md` TODO scan** (if `plan.md` exists). Count unchecked `- [ ]` lines. If > 0, emit a one-line warning: "N TODO items remain in plan.md — proceeding anyway." Do NOT block.
3. **`phase.yml.summary` non-empty** — fill if missing (1-2 sentences).
4. **Set `status: completed` and `closed_at: today`** (or `merge_commit` if branch merged).

Standard does NOT:
- Verify `implementation.md` / `review-and-fixes.md` / `followup.md` (these files don't exist).
- Re-inject active instructions (this happens at Pre-Impl Gate Step 0 only).

---

# End-of-Phase Maintenance

## Standard Profile

At phase completion:

**Always update:**
```
1. phase.yml — set status: completed, set merge_commit if branch merged, closed_at if direct close
2. phases/index.yml — update phase entry
3. summaries/current-state.md — update current state if the work changed it (features, components, debt, risks)
4. MCP index on close (if available) — call `index_phase` with whatever exists: planText (or empty), implementationText empty, commitDiffs for recorded commits, status "completed"
```

**Update if applicable:**
```
5. summaries/roadmap.md — confirm any roadmap entries added during the phase are still relevant
```

Standard does NOT auto-update `project-memory.md`, `architecture.md`, `active-issues.md` — those files don't exist in the standard scaffolding (see `standard/templates-config.md`).
