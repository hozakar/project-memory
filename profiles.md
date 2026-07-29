---
name: project-memory-profiles
description: Tier matrix, init UX, migration semantics, and orthogonal-feature list for project-memory profiles (standard / minimal).
---

# Profiles — standard / minimal

Project-memory supports two profiles. They differ only in ceremony-bearing features — audit categories, summaries, gate procedure depth.

**User-triggered features are NOT tier-bound.** Discussions, issues, instruction *creation*, notes, the ADR mirror, and the MCP companion remain opt-in regardless of profile.

The right axis for choosing a profile is **longevity × revisit frequency × reasoning density** — will future-me (or someone else) need to ask "why?" in a way that git + code don't already answer?

---

# Tier matrix

| # | Feature | `standard` | `minimal` |
|---|---|---|---|---|
| 1 | Pre-Implementation Gate | Step 0 + 1 + 2 + 3 (Step 4 skipped) | Step 0 only (instruction inject, then continue) |
| 2 | Turn-boundary sweep | GATE 0 re-inject instructions + turn-end check: "did this turn commit?" → update current-state.md (always) + roadmap.md (on scope change). One judgment per turn. | n/a |
| 3 | Drift Audit | See standard/audit-fs.md for the active category set. Phase-related categories retired. Cat 7, 12 dropped. | none |
| 4 | Summaries | 2 files (`roadmap.md` + `current-state.md`) | inline sections of `MEMORY.md` |
| 5 | Gate instruction re-injection | Pre-Impl Gate GATE 0 + Turn-Boundary Sweep GATE 0 | Pre-Impl Gate Step 0 only (the only gate that exists) |
| 6 | Author attribution | `created_by` only | none |
| 7 | Decisions | DECISION files + `index.md` | append rows in `MEMORY.md` |

## Profile history and audit

Cat 12 (tag inconsistency) and other retired category checks consult `profile_history` for any check whose correctness depends on the profile in force when an artifact was created. Phase-related audit categories (open-phase gaps, phase file completeness) are retired — historical `profile_history` entries referencing phase shapes are preserved for read-only backward compatibility.

## Minimal MEMORY.md schema

MEMORY.md has 4 sections: `## Roadmap`, `## Decisions`, `## Notes`, `## Log`. See templates or minimal/minimal.md for the schema. No automatic updates; user edits manually.

---

# Orthogonal features (NOT tier-bound)

These remain user-triggered or config-flagged regardless of profile:

- **MCP companion** — auto-detect, optional `config.yml` disable flag
- **ADR mirror** — `adr_enabled` flag in `config.yml`
- **Discussions** — implicit/explicit trigger
- **Issues** — user creates; `issues/` dir on first use
- **Notes** — user takes note; `notes/` dir on first use
- **Instructions creation** — user gives instruction; file created on demand

Note: instruction **re-injection** IS tier-bound (Row 6). The feature itself is orthogonal; the per-gate injection ceremony is not.

---

# Init UX

First-run init asks one question with inline guidance:

```
How do you want to run project-memory in this project?

  1) standard — lean ceremony, 2 summaries, 8-category audit, for most projects
  2) minimal  — single MEMORY.md file, for short or throwaway work

You can change this choice later — just say so.
```

Default cursor: `standard`. No automatic recommendation logic. After the user picks, read the corresponding init.md. Each choice writes `config.yml` (or `MEMORY.md` for minimal) with `profile` and seeds `profile_history`.

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

- **History consulted by audit/gates** for any check whose correctness depends on the profile in force at artifact creation time.
- **Downgrade** (standard → minimal): past artifacts stay as-is. Only future behavior changes.
- **Upgrade** (minimal → standard): no backfill required. Past entries keep their minimal shape.
- **Cross-shape transitions:** existing artifacts preserved. To minimal: creates MEMORY.md seeded from summaries/roadmap.md. From minimal: expands .project-memory/ skeleton, seeding roadmap.md and decisions/index.md from MEMORY.md.

User changes profile via natural language. SKILL.md recognizes the intent, appends a new `profile_history` entry with `effective_date: <today>` and `reason`.

**Backward compatibility:** Legacy `profile: full` or `profile: lite` treated as `profile: standard` at read time. `profile_history` retains original values.

---

# File layout (skill repo)

For the canonical skill file tree, see SKILL.md → Skill Files.

**Why hybrid split (and not pure-split):** truly invariant lifecycles (decision file format, MCP integration, record templates) live in one place — duplicating them in `standard/` and `minimal/` would create maintenance drift without LLM-side benefit. Divergent behavior (gate steps, audit category set, template shape) lives under profile dirs so the LLM reads only what applies; no conditional parsing of unified files.

**Why minimal is one file:** total `minimal` behavior fits in ~50-80 lines — single `MEMORY.md` schema, Step 0 as the only gate, zero audit, zero summary auto-update. Splitting that across 6 files would obscure rather than clarify.
