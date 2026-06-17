---
name: project-memory-templates-config
description: Configuration and project-level templates for project-memory. Covers config.yml, maintainers.md, and the project-memory.md summary file.
---

# Configuration Templates

## .project-memory/config.yml

Project-level configuration for project-memory. Always created during first-run initialization. All fields are optional — defaults apply when file or key is absent.

```yaml
# .project-memory/config.yml

adr_enabled: true     # opt-in flag: true = ADR support active, false = skip ADR creation and Cat 8 audit. Absent = true (backward compat).
adr_dir: adr          # directory for ADR files relative to project root (default: adr). Only meaningful when adr_enabled: true.

audit_ignore: []      # permanently suppressed audit findings (see audit.md Permanent Skip section)
# Each entry:
#   category: <integer>          # audit category number (1–12)
#   key: "<fingerprint|pattern>" # exact match or glob pattern with * wildcard
#   reason: "<why ignored>"      # human-readable note
#   ignored_at: YYYY-MM-DD       # date the ignore was added
# Pattern examples:
#   "tag-typo:*:skil-md"         — suppresses this tag typo in ALL phases
#   "phase-completeness:phase-2026*:*.md" — suppresses completeness for a phase cohort
# Auto-clean: entries referencing phases that get archived in an era are automatically removed.

semantic_audit_log: []   # state for semantic-conflict-scan; see DECISION-2026-06-17-semantic-conflict-scan
# Each entry:
#   pair: [DECISION-..., DECISION-...]   # two decision IDs in canonical lexicographic order
#   status: maybe | skipped              # maybe: LLM was uncertain; skipped: user deferred
#   seen_at: YYYY-MM-DD                  # date the entry was created
#   cooldown_until: YYYY-MM-DD           # set only when status: skipped (seen_at + 90 days); null for maybe
# Lifecycle: maybe entries persist and may be escalated in future runs if no definite-yes exists.
# skipped entries are not re-raised until cooldown_until passes. Entries referencing either side
# of a pair that gets resolved via a new superseding decision are auto-removed.
```

Example with entries:
```yaml
adr_dir: adr

audit_ignore:
  # Exact match
  - category: 12
    key: "phase-20260611-skill-md-refactor:skil-md"
    reason: "legacy typo in completed phase, accepted as-is"
    ignored_at: 2026-06-12
  # Pattern match — suppresses tag typo across ALL phases
  - category: 12
    key: "tag-typo:*:skil-md"
    reason: "recurring typo, suppressed globally"
    ignored_at: 2026-06-13
  # Pattern match — suppresses completeness for a phase cohort
  - category: 10
    key: "phase-completeness:phase-202606*:*.md"
    reason: "cohort phases pre-date file completeness discipline"
    ignored_at: 2026-06-13

semantic_audit_log:
  # A "maybe" finding from a prior scan; eligible for escalation if no definite-yes exists next run
  - pair: [DECISION-2026-06-01-a-slug, DECISION-2026-06-09-b-slug]
    status: maybe
    seen_at: 2026-06-15
    cooldown_until: null
  # A "skipped" finding; not re-raised until cooldown expires
  - pair: [DECISION-2026-06-04-c-slug, DECISION-2026-06-10-d-slug]
    status: skipped
    seen_at: 2026-06-15
    cooldown_until: 2026-09-13
```

---

## maintainers.md

```yaml
maintainers:
  - email: "first-maintainer@example.com"
```

Flat list of maintainer emails. Anyone can edit. No owner role. Read at session start to determine whether the current user receives era creation prompts.

---

# Summary Templates

## project-memory.md

Target size: 500—1500 words.

```md
# Project Memory

## Project Purpose
## Current Architecture
## Active Tensions
  Unresolved tradeoffs the project is navigating.
## Anti-Patterns
  Agent adds entries autonomously when pattern observed with high confidence.
## Rejected Decisions
  Alternatives not taken. One-liner per entry pointing to the full DECISION-YYYY-MM-DD-slug.md file.
  Agent asks user "why did we not go with X?" when reason is unknown.
## Open Problems
## Technical Debt
## Important Constraints
## Recent Completed Work
## Historical Milestones
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

**Rolling summaries rule (Recent Completed Work):**
- Cap: Recent Completed Work holds at most **20 entries**. When a 21st entry is added, the oldest entry is moved out.
- Overflow destination: moved entries are condensed into one-liners and appended to **Historical Milestones**, grouped by era (e.g. `2026-06 early`, `2026-Q3`). One era line covers multiple phases.
- Do not delete overflowed entries — they move, never disappear.
- Historical Milestones is append-only. It is not capped. Its one-liners are intentionally terse; full detail remains in the phase directory.
