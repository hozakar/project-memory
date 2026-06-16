---
name: project-memory-profiles
description: Tier matrix, init UX, migration semantics, and orthogonal-feature list for project-memory profiles (full / lite / minimal).
---

# Profiles — full / lite / minimal

Project-memory supports three profiles. They differ only in **ceremony-bearing features** — phase ceremony, gate procedures, audit categories, summaries, attribution depth, topic-shift detection, commit classification, instruction re-injection scope, and decision storage shape.

**User-triggered features are NOT tier-bound.** Discussions, issues, assignments, instruction *creation*, eras, the maintainer role, the ADR mirror, and the MCP companion remain opt-in regardless of profile.

The right axis for choosing a profile is **longevity × revisit frequency × reasoning density** — will future-me (or someone else) need to ask "why?" in a way that git + code don't already answer?

---

# Tier matrix

| # | Feature | `full` | `lite` | `minimal` |
|---|---|---|---|---|
| 1 | Phase files | 5-file (yml + plan + impl + review + followup) | `phase.yml` required + `plan.md` optional | none |
| 2 | Pre-Implementation Gate | Step 0–5 | Step 0 + 1 + 2 + 3 + 4 (Step 5 skipped) | Step 0 only (instruction inject, then continue) |
| 3 | Pre-Close Gate | Step 0 + 3-file verify + followup→roadmap transfer | commits non-empty sanity + plan.md TODO warn (non-blocking) + status:completed | n/a |
| 4 | Drift Audit | 14 categories | Cat 1,2,3,4,5,6,7,8(cond),10(modified),12,13(cond),14. **Off:** 9, 11 | none |
| 5 | Summaries | 5 files | `roadmap.md` + `current-state.md` only | inline sections of `MEMORY.md` |
| 6 | Gate instruction re-injection | every gate (Pre-Impl + Pre-Close + topic shift) | Pre-Impl Gate Step 0 only | Pre-Impl Gate Step 0 only (the only gate that exists) |
| 7 | Topic shift → auto new phase | on | off (user opens manually) | n/a |
| 8 | Commit significance classification | trivial / significant / ambiguous | trivial-filter only | none |
| 9 | Author attribution | `created_by` + `contributors` | `created_by` only | none |
| 10 | Decisions | DECISION files + `index.md` + ADR mirror | DECISION files + `index.md` (no ADR) | append rows in `MEMORY.md` |

## Cat 10 (lite modification)

Default Cat 10 expects 5 files in completed phases. In `lite` it expects only `phase.yml` (required) and treats `plan.md` as optional (no finding if absent). All other files (impl / review / followup) are ignored in lite-mode phases.

## Pre-Impl Gate Step 3 (lite)

Same behavior as full. MCP path uses `search_memory` with filters; non-MCP path scans `decisions/index.md`. Step 5 (broad awareness load) is the only step skipped in lite.

## Minimal `MEMORY.md` schema

Single file at project root with three fixed sections:

```markdown
# Memory

## Roadmap
- [ ] next step
...

## Decisions
- 2026-06-20: chose X over Y because Z

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
- **Instructions creation** — user gives instruction; file created on demand.
- **Eras + maintainer role** — maintainer opt-in via `maintainers.md`.

Note: instruction **re-injection** IS tier-bound (Row 6). The feature itself is orthogonal; the per-gate injection ceremony is not.

---

# Init UX

First-run init asks one question with inline guidance (in Turkish to match the maintainer's voice; localize as needed):

```
Bu projede project-memory'yi nasıl çalıştırmak istersin?

  1) full     — tam ceremony, uzun ömürlü/çok-katkıcı projeler için
  2) lite     — minimum ceremony, çoğu orta-çaplı iş için
  3) minimal  — tek MEMORY.md dosyası, kısa/throwaway işler için

Yanıtını verirken göz önünde bulundurabileceklerin:
  • Proje 3+ ay sürecek mi?
  • Birden fazla kişi mi katkı verecek?
  • "Neden X yaptık?" gibi mimari karar soruları çıkacak mı?

Bu seçimi sonra değiştirmek istersen söyle, ben hallederim.
```

Default cursor: `lite`. No automatic recommendation logic — user reads guidance and chooses.

---

# Migration mechanism

Profile history is recorded in `config.yml`:

```yaml
profile: lite                    # current active profile

profile_history:
  - profile: lite
    effective_date: 2026-06-16
    reason: initial
  - profile: full
    effective_date: 2026-08-01
    reason: "team grew, architectural complexity increased"
```

**Migration rules:**

- Audit and gates consult `profile_history` for any check whose correctness depends on the profile in force when an artifact was created. Example: Cat 10 lite-modification only applies to phases whose `started_at` falls within a lite-profile window.
- **Downgrade** (e.g. `full → lite`): past artifacts stay as-is. No retroactive file deletion or schema simplification. Only future behavior changes.
- **Upgrade** (e.g. `lite → full`): no backfill required. Past phases keep their 2-file shape; future phases get 5-file. Cat 10 differentiates by `started_at` against `profile_history`.
- **Cross-shape transitions** (any ↔ `minimal`): existing artifacts are preserved. Going *to* `minimal` creates `MEMORY.md` seeded from `summaries/roadmap.md` (if any); going *from* `minimal` creates a `.project-memory/` skeleton with `MEMORY.md` content migrated to seed `roadmap.md` and `decisions/index.md`.

User changes profile via natural language ("project-memory'yi full'a geçir"). SKILL.md recognizes the intent, appends a new `profile_history` entry with `effective_date: <today>` and a `reason` field captured from the user's stated motivation (or `"user request"` if not stated).

---

# File layout (skill repo)

```
.claude/skills/project-memory/
├── SKILL.md                       ← profile-aware dispatcher (entry point)
├── profiles.md                    ← this file
│
├── full/                          ← used when profile=full
│   ├── gates.md
│   ├── protocol.md
│   ├── audit-fs.md
│   ├── audit-mcp.md
│   ├── templates-phase.md
│   ├── templates-config.md
│   ├── init.md
│   └── cheatsheet.md
│
├── lite/                          ← used when profile=lite (same 8 files, lite-specific content)
│
├── minimal/                       ← used when profile=minimal
│   └── minimal.md                 ← single-file spec (~50-80 lines)
│
├── audit.md                       ← dispatcher (shared) — routes to <profile>/audit-*
├── templates.md                   ← dispatcher (shared) — routes to <profile>/templates-* where applicable
├── conventions.md                 ← dispatcher (shared) — routes to conventions-*.md
├── conventions-decisions.md       ← shared
├── conventions-discussions.md     ← shared
├── conventions-records.md         ← shared
├── conventions-maintainer.md      ← shared (with profile-specific attribution notes)
├── templates-records.md           ← shared
├── mcp-integration.md             ← shared
└── README.md
```

**Why hybrid split (and not pure-split):** truly invariant lifecycles (decision file format, MCP integration, record templates) live in one place — duplicating them in `full/`, `lite/`, `minimal/` would create maintenance drift without LLM-side benefit. Divergent behavior (gate steps, audit category set, phase template shape) lives under profile dirs so the LLM reads only what applies; no conditional parsing of unified files.

**Why minimal is one file:** total `minimal` behavior fits in ~50-80 lines — single `MEMORY.md` schema, Step 0 as the only gate, zero audit, zero summary auto-update. Splitting that across 6 files would obscure rather than clarify.
