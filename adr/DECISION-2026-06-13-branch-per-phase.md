---
id: DECISION-2026-06-13-branch-per-phase
status: active
primary_scope: workflow
touches: [phase-lifecycle, git-branch, phase-closure, phase-creation]
supersedes: null
superseded_by: null
adr_id: 0008
---

# Context

All phase implementation work currently happens on the `main` branch, causing: no isolation, no easy rollback, no parallel work, flat git history.

# Alternatives Considered

Option A — Branch per phase: checkout, implement, close, merge, delete stale branch (chosen)
Option B — Trunk-based: work directly on main, use feature flags (rejected: adds complexity without git-native grouping)
Option C — Fork-based: each phase gets a fork (rejected: too heavy; branches are sufficient)

# Decision

Every phase gets its own git branch by default.

# Chosen Solution

```
New phase created → git checkout -b phase/<phase-id>
  └─ Work on the phase (plans, implementation, review, closure)
  └─ Phase closed → git checkout main
                    git merge --no-ff phase/<phase-id>
                    git branch -d phase/<phase-id>
                    git push
```

Branch naming: `phase/<phase-id>` matching the phase directory name.
Merge strategy: `git merge --no-ff` always, preserving branch topology.

# Reasoning

Simplest git-native approach. Provides isolation, easy rollback (`git revert -m 1`), clear grouping (`git log --first-parent`). No new tooling required.

# Consequences

Benefits:
- Phase work fully isolated until closure — main stays clean
- Single revert rolls back entire phase
- Parallel phase work possible
- Branch name matches phase directory

Tradeoffs:
- 3 extra git commands per phase
- Merge commit noise (mitigated by `--first-parent`)
- Stale branch cleanup responsibility

## Rules

1. This workflow is the DEFAULT. Applies unless user explicitly requests otherwise.
2. Build agent executes all git operations (checkout, merge, branch delete).
3. Orphan branches (no corresponding open phase) are stale → report in audit.
