# ADR 0009 — Era-Based Documentation & Changelog Maintenance

- **Status:** Accepted
- **Date:** 2026-06-13

## Context

The project-memory skill has multiple documentation surfaces (root README, mcp-server README, CHANGELOG) that drift from current state as phases complete. The `.project-memory/` summaries are updated at every phase close, but public-facing docs require separate maintenance.

## Considered Options

1. **Manual, ad-hoc updates** — update whenever drift is noticed. Rejected: proven failure mode (CHANGELOG was 19 days stale).
2. **Update at every phase close** — add to end-of-phase maintenance. Rejected: too frequent, dilutes signal.
3. **Update at every era boundary** — when `era-NNN.md` is written, sync docs and changelog, ask user about version bump.

## Decision Outcome

**Option 3 is chosen.** Era boundaries (~10 phases) are the right checkpoint frequency. Version bumps remain a human decision — never auto-bump. The workflow: write era → update README.md, mcp-server/README.md, CHANGELOG.md → ask user "bump version?".

### Positive Consequences
- Docs stay within one era of current state
- Version bump remains conscious human decision
- Lightweight — one extra step at an already-planned event

### Negative Consequences
- Requires remembering the extra step (mitigated by this ADR being indexed and surfaced at Pre-Implementation Gate)
