---
name: project-memory-templates-config-lite
description: Lite-profile config and summary templates. config.yml carries profile + profile_history. Only 2 summaries (roadmap, current-state) scaffolded by default.
---

# Configuration Templates (lite)

## .project-memory/config.yml

Created during first-run init. All fields except `profile` and `profile_history` are optional.

```yaml
# .project-memory/config.yml

profile: lite

profile_history:
  - profile: lite
    effective_date: YYYY-MM-DD
    reason: initial

adr_enabled: false    # lite default: ADR mirror off. Set to true if you want adr/ scaffolding.
adr_dir: adr

audit_ignore: []      # permanent skip entries (see audit.md → Permanent Skip)
```

**Profile fields:**
- `profile`: the currently active profile. SKILL.md reads this on every load to route.
- `profile_history`: append-only log of profile changes. Each entry has `profile`, `effective_date: YYYY-MM-DD`, and `reason`. Audit and gates consult this for profile-sensitive checks (e.g. Cat 10 file-completeness — phases started in a full window are expected to have 5 files even after a downgrade to lite).

**`adr_enabled` default in lite:** `false`. Lite's default decision storage is DECISION files + `decisions/index.md` without ADR mirror. If you want ADR support, set `adr_enabled: true` — Cat 8 audit will create stubs for existing decisions on the next audit pass.

**`audit_ignore`** behaves identically to full. See `audit.md` → Permanent Skip for the matching rules and fingerprint formats.

---

## maintainers.md

Orthogonal to profile. Identical to full:

```yaml
maintainers:
  - email: "first-maintainer@example.com"
```

Lite projects rarely need a maintainer role (era creation prompts are the only thing it gates). If `maintainers.md` is absent, no era prompts fire — the maintainer role is fully opt-in.

---

# Summary Templates (lite)

Lite scaffolds **2 summary files** in `.project-memory/summaries/`:

## current-state.md

Snapshot of where the project stands right now. Updated at every phase close.

```md
# Current State

Last Updated: YYYY-MM-DD

## What Exists
- Components, features, modules currently in place

## What's In Progress
- Open phase(s) and their goals

## Known Debt / Risks
- One-liners — debt items, technical risks, blockers
```

Target size: under 300 lines. If it grows beyond that, consider upgrading to `full` (which splits this into `current-state.md` + `project-memory.md` + `architecture.md`).

---

## roadmap.md

Forward-looking. What's planned, what's pending. Edit incrementally during work, not only at phase close.

```md
# Roadmap

Last Updated: YYYY-MM-DD

## Next
- [ ] short description of the next item
- [ ] ...

## Later
- [ ] longer-horizon items, may need a phase decision

## Considered but not now
- description — why parked
```

The `## Considered but not now` section captures rejected or deferred ideas. In full, this kind of content lives in `project-memory.md → Rejected Decisions`; lite collapses it into one shared file.

---

# Summary files NOT in lite

These exist in full but are not scaffolded under lite:
- `project-memory.md` — meta-summary of project purpose, anti-patterns, navigation map. Lite doesn't carry meta-summary infrastructure.
- `architecture.md` — system architecture overview. Lite users either keep this in their codebase README or upgrade to full when architectural decisions accumulate.
- `active-issues.md` — issue rollup. Lite uses GitHub Issues or similar external systems; `.project-memory/issues/` is still available as a user-triggered feature, but no rollup summary is maintained.

If a user manually creates any of these in a lite project, the audit will NOT auto-update them — lite's automation is scoped to the 2 default summaries only.
