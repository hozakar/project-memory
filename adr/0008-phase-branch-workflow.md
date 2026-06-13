# ADR 0008: Branch-Per-Phase Workflow

Date: 2026-06-13
Status: Superseded by [0011-instruction-feature](0011-instruction-feature.md)

## Context and Problem Statement

All phase implementation work currently happens on the `main` branch. This creates several problems:
- No isolation — in-progress phase work pollutes main between commits
- No easy rollback — reverting a phase requires inverting multiple commits on main
- No parallel work — only one phase can be in flight at a time
- Git history becomes a flat list with no grouping by phase

## Considered Options

- Option A — Branch per phase: checkout, implement, close, merge, delete stale branch
- Option B — Trunk-based: work directly on main, use feature flags
- Option C — Fork-based: each phase gets a fork

## Decision Outcome

Chosen option: "Option A — Branch per phase", because it is the simplest git-native approach that provides isolation, easy rollback, and clear grouping without introducing new tooling or workflow complexity.

### Workflow

```
New phase created → git checkout -b phase/<phase-id>
  └─ Work on the phase (plans, implementation, review, closure)
  └─ Phase closed → git checkout main
                    git merge --no-ff phase/<phase-id>
                    git branch -d phase/<phase-id>
                    git push
```

### Branch naming convention

`phase/<phase-id>` where `<phase-id>` matches the phase directory name, e.g.:
- `phase/phase-20260612-fix-open-issues`
- `phase/phase-20260612-era-002-completion`

### Merge strategy

`git merge --no-ff` — always create a merge commit. This preserves the branch topology and groups phase work under a single merge commit, making it trivial to identify and revert an entire phase if needed.

### Positive Consequences

- Phase work is fully isolated until closure — main stays clean
- Single `git revert -m 1 <merge-commit>` rolls back an entire phase
- `git log --first-parent main` shows only phase closures, a clean high-level history
- Parallel phase work becomes possible (different branches, no conflict until merge)
- Branch name matches phase directory — direct mapping between git and project-memory

### Negative Consequences

- Slightly more git commands per phase (3 extra: checkout, merge, branch delete)
- Merge commit noise on main (mitigated by `--first-parent` viewing)
- Stale branch cleanup responsibility — must delete after merge

## Rules

1. This workflow is the DEFAULT. It applies unless the user explicitly requests a different branching strategy for a specific phase.
2. The git operations (checkout, merge, branch delete) are part of the phase lifecycle gates:
   - **Phase creation gate**: `git checkout -b phase/<id>`
   - **Phase closure gate**: `git checkout main`, merge, delete branch
3. Orphan branches (branches without a corresponding open phase) are considered stale and should be reported in audit.
4. The build agent is responsible for executing all git operations.

## See Also

DECISION-2026-06-13-branch-per-phase.md
