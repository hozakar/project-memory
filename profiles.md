---
name: project-memory-profiles
description: Tier matrix, init UX, migration semantics, and orthogonal-feature list for project-memory profiles (standard / minimal).
---

# Profiles — standard / minimal

Project-memory supports two profiles. They differ only in ceremony-bearing features — audit categories, summaries, gate procedure depth.

**User-triggered features are NOT tier-bound.** Discussions, issues, assignments, instruction *creation*, notes, the ADR mirror, and the MCP companion remain opt-in regardless of profile.

The right axis for choosing a profile is **longevity × revisit frequency × reasoning density** — will future-me (or someone else) need to ask "why?" in a way that git + code don't already answer?

---

# Tier matrix

| # | Feature | `standard` | `minimal` |
|---|---|---|---|---|
| 1 | Pre-Implementation Gate | Step 0 + 1 + 2 + 3 (Step 4 skipped) | Step 0 only (instruction inject, then continue) |
| 2 | Turn-boundary sweep | Turn-end check: "did this turn commit?" → update current-state.md (always) + roadmap.md (on scope change). One judgment per turn. | n/a |
| 3 | Drift Audit | 8 categories (5,6,8,9,11,13,14,15). Phase-related categories retired. Cat 7, 12 dropped. | none |
| 4 | Summaries | 2 files (`roadmap.md` + `current-state.md`) | inline sections of `MEMORY.md` |
| 5 | Gate instruction re-injection | Pre-Impl Gate Step 0 only | Pre-Impl Gate Step 0 only (the only gate that exists) |
| 6 | Author attribution | `created_by` only | none |
| 7 | Decisions | DECISION files + `index.md` | append rows in `MEMORY.md` |

## Profile history and audit

Cat 12 (tag inconsistency) and other retired category checks consult `profile_history` for any check whose correctness depends on the profile in force when an artifact was created. Phase-related audit categories (open-phase gaps, phase file completeness) are retired — historical `profile_history` entries referencing phase shapes are preserved for read-only backward compatibility.

## Minimal `MEMORY.md` schema

`.project-memory/MEMORY.md` — single file inside the shared `.project-memory/` directory, with four fixed sections:

```markdown
# Memory

## Roadmap
- [ ] next step
...

## Decisions
- 2026-06-20: chose X over Y because Z

## Notes
- 2026-06-21: note title — freeform content

## Log
- 2026-06-20: topic-name — what happened (1 line)
```

No automatic updates. User edits manually. The only automated behavior in `minimal` is Pre-Impl Gate Step 0 (instruction re-injection if any active instruction exists).

---

# Orthogonal features (NOT tier-bound)

These remain user-triggered or config-flagged regardless of profile. They cost nothing when unused:

- **MCP companion** — auto-detect; `config.yml` flag if user wants to disable.
- **ADR mirror** — `adr_enabled` flag in `config.yml`.
- **Discussions** — implicit/explicit trigger.
- **Issues** — user creates; `issues/` directory created on first use.
- **Assignments** — user delegates; `assignments/` created on first use.
- **Notes** — user takes note; `notes/` created on first use.
- **Instructions creation** — user gives instruction; file created on demand.

Note: instruction **re-injection** IS tier-bound (Row 6). The feature itself is orthogonal; the per-gate injection ceremony is not.

---

# Init UX

First-run init asks one question with inline guidance:

```
How do you want to run project-memory in this project?

  1) standard — lean ceremony, 2 summaries, 8-category audit, for most projects
  2) minimal  — single MEMORY.md file, for short or throwaway work

Things to consider:
  • Will the project last 3+ months?
  • Will more than one person contribute?
  • Are "why did we do X?" architectural questions likely to come up?

You can change this choice later — just say so.
```

Default cursor: `standard`. No automatic recommendation logic — user reads guidance and chooses.

After the user picks:
- `standard` → read `standard/init.md` and follow it.
- `minimal` → read `minimal/minimal.md` and follow it.

Each init writes `config.yml` (or `MEMORY.md` for minimal) with `profile` and seeds `profile_history` with `{profile, effective_date: today, reason: initial}`.

---

# Migration mechanism

Profile history is recorded in `config.yml`:

```yaml
profile: standard                    # current active profile

profile_history:
  - profile: standard
    effective_date: 2026-06-16
    reason: initial
  - profile: minimal
    effective_date: 2026-08-01
    reason: "project scope reduced"
```

**Migration rules:**

- Audit and gates consult `profile_history` for any check whose correctness depends on the profile in force when an artifact was created. Retired phase-related categories (Cat 4, Cat 10) used to differentiate by profile window — historical `profile_history` entries with `full` or `lite` remain valid for backward compatibility checks.
- **Downgrade** (e.g. `standard → minimal`): past artifacts stay as-is. No retroactive file deletion or schema simplification. Only future behavior changes.
- **Upgrade** (e.g. `minimal → standard`): no backfill required. Past entries keep their minimal shape; future work gets standard scaffolding. `profile_history` entries with legacy profile values are preserved for migration-aware checks.
- **Cross-shape transitions:** existing artifacts are preserved. Going *to* `minimal` creates `.project-memory/MEMORY.md` seeded from `summaries/roadmap.md` (if any) and updates `config.yml` with `profile: minimal`; going *from* `minimal` expands the existing `.project-memory/` skeleton with the standard profile's structure, seeding `roadmap.md` and `decisions/index.md` from `MEMORY.md` content.

User changes profile via natural language ("switch project-memory to minimal"). SKILL.md recognizes the intent, appends a new `profile_history` entry with `effective_date: <today>` and a `reason` field captured from the user's stated motivation (or `"user request"` if not stated).

**Backward compatibility:** Legacy config.yml files with `profile: full` or `profile: lite` continue to work. Both are treated as `profile: standard` at read time. `profile_history` entries retain their original values for audit-aware checks.

---

# File layout (skill repo)

```
.claude/skills/project-memory/
├── SKILL.md                       ← profile-aware dispatcher (entry point)
├── profiles.md                    ← this file
│
├── standard/                      ← used when profile=standard
│   ├── protocol.md
│   ├── gates.md
│   ├── audit-fs.md
│   ├── audit-mcp.md
│   ├── templates-config.md
│   ├── init.md
│   └── cheatsheet.md
│
├── minimal/                       ← used when profile=minimal
│   └── minimal.md                 ← single-file spec (~50-80 lines)
│
├── audit.md                       ← dispatcher (shared) — routes to <profile>/audit-*
├── conventions/                   ← dispatcher (shared) — routes to conventions/*.md
│   ├── index.md                   ← Dispatcher
│   ├── decisions.md               ← shared
│   ├── discussions.md             ← shared
│   ├── records.md                 ← shared

├── templates/                     ← dispatcher (shared) — routes to templates/*.md
│   ├── index.md                   ← Dispatcher
│   ├── decisions.md               ← shared
│   ├── discussions.md             ← shared
│   ├── instructions.md            ← shared
│   ├── assignments.md             ← shared
│   └── attribution.md             ← shared (created_by / contributors schema)
├── mcp-integration.md             ← shared
└── README.md
```

**Why hybrid split (and not pure-split):** truly invariant lifecycles (decision file format, MCP integration, record templates) live in one place — duplicating them in `standard/` and `minimal/` would create maintenance drift without LLM-side benefit. Divergent behavior (gate steps, audit category set, template shape) lives under profile dirs so the LLM reads only what applies; no conditional parsing of unified files.

**Why minimal is one file:** total `minimal` behavior fits in ~50-80 lines — single `MEMORY.md` schema, Step 0 as the only gate, zero audit, zero summary auto-update. Splitting that across 6 files would obscure rather than clarify.
