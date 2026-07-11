---
name: project-memory-templates-config
description: Configuration and summary templates for the standard profile. config.yml carries profile + profile_history. Only 2 summaries (roadmap, current-state) scaffolded by default.
---

# Configuration Templates (standard)

## .project-memory/config.yml

Created during first-run init. All fields except `profile` and `profile_history` are optional.

```yaml
# .project-memory/config.yml

profile: standard

profile_history:
  - profile: standard
    effective_date: YYYY-MM-DD
    reason: initial

adr_enabled: false    # standard default: ADR mirror off. Set to true if you want adr/ scaffolding.
adr_dir: adr

audit_ignore: []      # permanent skip entries (see audit.md → Permanent Skip)
```

**Profile fields:**
- `profile`: the currently active profile. SKILL.md reads this on every load to route.
- `profile_history`: append-only log of profile changes. Each entry has `profile`, `effective_date: YYYY-MM-DD`, and `reason`. Audit and gates consult this for profile-sensitive checks (retired phase-based categories reference phase file shapes by profile window).

**`adr_enabled` default:** `false`. Standard's default decision storage is DECISION files + `decisions/index.md` without ADR mirror. If you want ADR support, set `adr_enabled: true` — Cat 8 audit will create stubs for existing decisions on the next audit pass.

**`audit_ignore`** behaves identically to the legacy full profile. See `audit.md` → Permanent Skip for the matching rules and fingerprint formats.

**Backward compatibility:** `profile: full` and `profile: lite` in legacy config.yml files are treated as `profile: standard` at read time. No migration action is needed.

---

# Summary Templates (standard)

Standard scaffolds **2 summary files** in `.project-memory/summaries/`:

## current-state.md

Snapshot of where the project stands right now. Updated at turn end by the turn-boundary sweep when the turn included a commit.

```md
# Current State

Last Updated: YYYY-MM-DD

## What Exists
- *(none)*

## What's In Progress
- *(none)*

## Known Debt / Risks
- *(none)*
```

Target size: under 300 lines. If it grows beyond that, consider splitting content — but standard intentionally keeps a single current-state file.

---

## roadmap.md

Forward-looking. What's planned, what's pending. Edit incrementally during work.

```md
# Roadmap

Last Updated: YYYY-MM-DD

## Next
- *(none)*

## Later
- *(none)*

## Considered but not now
- *(none)*
```

The `## Considered but not now` section captures rejected or deferred ideas. In the legacy full profile, this kind of content lived in `project-memory.md → Rejected Decisions`; standard collapses it into one shared file.

---

# Summary files NOT in standard

These existed in legacy full but are not scaffolded under standard:
- `project-memory.md` — meta-summary of project purpose, anti-patterns, navigation map. Standard doesn't carry meta-summary infrastructure.
- `architecture.md` — system architecture overview. Keep this in your codebase README or write a DECISION when architectural decisions accumulate.
- `active-issues.md` — issue rollup. Use GitHub Issues or similar external systems; `.project-memory/issues/` is still available as a user-triggered feature, but no rollup summary is maintained.

If a user manually creates any of these, the audit will NOT auto-update them — standard's automation is scoped to the 2 default summaries only.
