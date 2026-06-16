---
name: project-memory-minimal
description: Minimal-profile project memory. Single MEMORY.md at project root with three sections (Roadmap / Decisions / Log). Pre-Impl Gate Step 0 (instruction re-injection) is the only automated gate; no phase ceremony, no drift audit, no author attribution, no summary auto-update.
---

# Minimal Profile — Single-File Project Memory

Use this profile when project longevity, revisit frequency, and reasoning density are all low — short-lived work, throwaway scripts, or solo bursts where git history alone is enough and engineering reasoning rarely needs to be revisited.

## Storage

A single file at project root:

```
<project-root>/MEMORY.md
```

No `.project-memory/` directory unless the user explicitly creates discussions, issues, instructions, or assignments — those features are user-triggered and orthogonal to the profile. When they are used, their files live under `.project-memory/<feature>/` next to `MEMORY.md`.

## MEMORY.md template

```markdown
# Memory

profile: minimal
profile_history:
  - profile: minimal
    effective_date: YYYY-MM-DD
    reason: initial

## Roadmap
- [ ] next step 1
- [ ] next step 2

## Decisions
- YYYY-MM-DD: chose X over Y because Z

## Log
- YYYY-MM-DD: topic-name — what happened (1 line)
```

The `profile` and `profile_history` block at the top is the authoritative profile record (there is no `config.yml` under minimal).

## On Load

1. Read `MEMORY.md`. If it does not exist but the project root contains a `.project-memory/` directory, the project is NOT minimal — fall back to SKILL.md normal flow.
2. Parse the three sections. Hold them in context for the session.
3. Run **Pre-Impl Gate Step 0 only** before any significant implementation work — load active instructions filtered by current git user (scan `.project-memory/instructions/*.md` if any exist) and prepend their `# Prompt` body to gate context. If no instructions exist, this is a no-op. Then continue.
4. No phase check, no commit significance classification, no decision-check scan, no drift audit, no topic-shift detection. The user owns these mental models themselves.

## Record-append behavior

- **Roadmap edit:** open `MEMORY.md`, edit the `## Roadmap` section directly.
- **Decision append:** when a decision is made, append a single row to `## Decisions`: `- YYYY-MM-DD: chose X over Y because Z`. No DECISION file, no index, no ADR.
- **Log append:** when significant work happens, append a single row to `## Log`: `- YYYY-MM-DD: topic-name — what happened (1 line)`. "Significant" is a judgment call — no classification ceremony. A reasonable rule of thumb: if you'd want a future session to know it happened, log it.

## Discussions / issues / instructions / assignments (orthogonal)

These features are user-triggered. When used in a minimal-profile project, the corresponding `.project-memory/<feature>/` directory is created on first use, sitting next to `MEMORY.md`. Their lifecycles follow the shared `conventions-discussions.md`, `conventions-records.md` etc. — minimal does not change their behavior.

## Author attribution

None. Git already records the author of every commit; minimal does not duplicate that metadata into record frontmatter.

## MCP companion

Available if installed, but minimal does NOT auto-index `MEMORY.md` into the vector DB. The single-file shape isn't a fit for the existing index schema (which is keyed on phase/decision/discussion records). If MCP is installed and the user later upgrades to lite or full, the migration step seeds proper records that DO get indexed.

## Upgrading from minimal

User says "project-memory'yi lite'a geçir" (or full). SKILL.md → change-profile flow:

1. Create `.project-memory/` skeleton appropriate for the target profile (see `<target>/init.md`).
2. Seed `summaries/roadmap.md` from `MEMORY.md → ## Roadmap`.
3. Seed `decisions/index.md` from `MEMORY.md → ## Decisions` (one row per decision; bodies stay where they were — the rows are sufficient for a starting state).
4. Move `MEMORY.md → ## Log` content into a single archival note under `.project-memory/eras/` or leave it in place at project root as a historical artifact — user's choice.
5. Append a new `profile_history` entry to `config.yml` with `effective_date: today` and the user's stated `reason`.
6. `MEMORY.md` is renamed to `MEMORY.legacy.md` to avoid confusion with the new structure.

## Downgrading to minimal

User says "project-memory'yi minimal'a geçir" from full or lite:

1. Create `MEMORY.md` at project root with the three-section template.
2. Seed `## Roadmap` from `summaries/roadmap.md`.
3. Seed `## Decisions` from `decisions/index.md` rows.
4. `## Log` starts empty — historical phases/commits stay where they are; future work logs go here.
5. Append the `profile_history` entry inside `MEMORY.md` itself (not in `config.yml` — the legacy `.project-memory/config.yml` is preserved but no longer authoritative).
6. The legacy `.project-memory/` directory is NOT deleted. It remains as historical record; the user can manually remove it later if they want a clean workspace.

## What this profile gives up (be honest)

- No conflict-check before implementation: the user might re-litigate a decision they already made. Minimal trusts the user to remember or to read `## Decisions` themselves.
- No phase boundaries: cross-session continuity is weaker. Long-running work in minimal usually means the user should upgrade.
- No drift audit: bookkeeping mistakes accumulate silently. Minimal projects shouldn't generate enough bookkeeping for this to matter — if they do, upgrade.
- No instruction re-injection across compaction: in a long context that gets compacted, the instruction body may be lost. Minimal is for short bursts where compaction is unlikely.

If any of these limitations bite, upgrade to `lite`. That's the explicit purpose of the profile system.
