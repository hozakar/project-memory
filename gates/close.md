---
name: project-memory-gates-close
description: Pre-Close Gate and End-of-Phase Maintenance for both full and lite profiles.
---

# Pre-Close Gate

## Full Profile

**Before closing any phase** (merge, logical completion, or explicit user declaration), verify and complete the following. Phase may not close until all four are done:

**Step 0 — Load active instructions:**
Same as GATE 0 in `gates/implementation.md` — load and prepend active instructions before proceeding.

1. `implementation.md` — written and reflects the actual implementation (not a stub)
2. `review-and-fixes.md` — all review rounds closed; findings and actions recorded
3. `followup.md` — debt, open issues, and recommended next phases captured
4. **`summary` field in `phase.yml`** — write a 2-3 sentence summary of what was done and why. This enables informed tag-aware filtering without loading the full phase directory.
5. **`contributors` in `phase.yml`** — append the current git identity (dedup by email). See `conventions.md` → Author Attribution.

If any of these are missing or stub-only, write them first, then close.

**MANDATORY:** Update `implementation.md` after each significant commit. Do NOT defer to close time. A phase closed without incremental updates is a memory failure — retroactive writing is always incomplete.

## Lite Profile

**Before closing any phase**, verify the following. The lite version is much lighter than full — there is no 3-file verify and no instruction re-injection.

1. **`phase.yml.commits` non-empty.** If empty, ask once: "This phase has no commits recorded. Close anyway?" (sanity check).
2. **`plan.md` TODO scan** (if `plan.md` exists). Count unchecked `- [ ]` lines. If > 0, emit a one-line warning: "N TODO items remain in plan.md — proceeding anyway." Do NOT block.
3. **`phase.yml.summary` non-empty** — fill if missing (1-2 sentences).
4. **Set `status: completed` and `closed_at: today`** (or `merge_commit` if branch merged).

Lite does NOT:
- Verify `implementation.md` / `review-and-fixes.md` / `followup.md` (these files don't exist in lite phases).
- Transfer `followup.md` content to `roadmap.md` (roadmap entries are added incrementally during work in lite).
- Re-inject active instructions (this happens at Pre-Impl Gate Step 0 only).

---

# End-of-Phase Maintenance

## Full Profile

At phase completion (merge OR logical completion):

**Always update — no exceptions:**
```
1. implementation.md — finalize (must not be a stub)
2. review-and-fixes.md — close final round
3. followup.md → roadmap.md — transfer all items
4. phase.yml — set status: completed; set merge_commit if branch merged, closed_at if direct close
5. phases/index.yml — update phase entry
5a. **MCP index on phase close (if available):** If `index_phase` is in available tools (see `mcp-integration.md`), call `index_phase` with the full phase data: `{ id, title, tags, planText: plan.md[:2000], implementationText: implementation.md[:2000], commitDiffs: [for each commit hash in phase.yml commits: { hash, message, files: list of changed files, diffSnippet: first 2000 chars of git show output }], status: "completed", created_by, contributors }` (pass the `created_by` + `contributors` from `phase.yml`). Best-effort.
6. current-state.md — always update: features, components, debt, risks, recommended next actions
7. project-memory.md — always update Recent Completed Work; also update Active Tensions, Anti-Patterns, Current Priorities if changed
```

**Update only if changed this phase:**
```
8. active-issues.md — if issues were opened or closed
9. roadmap.md — confirm followup.md items are integrated
10. architecture.md — if any module was added, removed, or structurally changed
```

`current-state.md` and `project-memory.md` are **always** updated. Skipping them is the most common source of stale memory.

## Lite Profile

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

Lite does NOT auto-update `project-memory.md`, `architecture.md`, `active-issues.md` — those files don't exist in the lite scaffolding (see `lite/templates-config.md`).
