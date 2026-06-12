# Skill Repo Commits Its Own Memory and ADR Files

Date: 2026-06-12
Status: Accepted

## Context and Problem Statement

The skill repo gitignored both `.project-memory/` and `adr/` under the assumption they are "personal working artifacts." But this repo is simultaneously the skill source code and a live consumer project running the skill on itself. No DECISION was recorded for either gitignore choice. The inconsistency surfaced when `adr/` was gitignored immediately after adding ADR support — a self-contradiction.

## Considered Options

- Option A: Gitignore both (status quo)
- Option B: Commit `.project-memory/`, gitignore `adr/`
- Option C: Gitignore both but document in README

## Decision Outcome

Chosen option: "Commit both `.project-memory/` and `adr/`", because the skill repo is self-demonstrating by design — its strongest documentation is the skill running on its own development, not a README section describing how it works.

CLAUDE.md and AGENTS.md remain gitignored: they are per-developer environment files, not repo artifacts.

### Positive Consequences

- Contributors can read the full reasoning behind every design decision
- ADR support is self-demonstrating: `adr/` is populated in the skill's own repo
- Development history becomes documentation without extra effort
- Memory quality is enforced — stale files are visible to contributors

### Negative Consequences

- `.project-memory/` files must be maintained with the same discipline as skill files
- Incomplete phase files or stale summaries are now publicly visible (accepted: this is a quality incentive)

## Pros and Cons of the Options

### Option A — Gitignore both

- Good: no maintenance pressure from public visibility
- Bad: a contributor cloning the repo to understand a design decision sees none of the reasoning; contradicts the skill's purpose; ADR support has never been demonstrated in a real repo

### Option B — Commit `.project-memory/`, gitignore `adr/`

- Good: partial improvement
- Bad: still self-contradicts ADR support; the feature was built but not used in the skill's own repo

### Option C — Gitignore both but add README documentation

- Good: minimal repo change
- Bad: invisible files with README notes are a worse experience than visible files; reading about the workflow is not the same as seeing it in the repo history
