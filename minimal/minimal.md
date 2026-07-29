---
name: project-memory-minimal
description: Minimal-profile project memory. MEMORY.md inside .project-memory/ with three sections (Roadmap / Decisions / Log). Pre-Impl Gate Step 0 (instruction re-injection) is the only automated gate; no phase ceremony, no drift audit, no author attribution, no summary auto-update.
---

# Minimal Profile — Single-File Project Memory

Use this profile when project longevity, revisit frequency, and reasoning density are all low — short-lived work, throwaway scripts, or solo bursts where git history alone is enough and engineering reasoning rarely needs to be revisited.

## Storage

```
.project-memory/
├── config.yml       ← profile: minimal + profile_history
└── MEMORY.md        ← four sections: ## Roadmap, ## Decisions, ## Notes, ## Log
```

Detection: `.project-memory/config.yml` exists → installed; absent → first-run (see below). User-triggered features (discussions, issues, instructions, notes) create their own subdirectories inside `.project-memory/` on first use, exactly as in other profiles.

## First-run initialization (minimal)

When `.project-memory/config.yml` does not exist, scaffold the minimal structure:

```
.project-memory/
├── config.yml
└── MEMORY.md
```

**`config.yml`** — write the profile block:

```yaml
profile: minimal

profile_history:
  - profile: minimal
    effective_date: <today YYYY-MM-DD>
    reason: initial
```

**`MEMORY.md`** — create with the four-section template (see below).

**`.gitignore`** — Add `.project-memory/vector-index` to the project's `.gitignore`. Check if `.gitignore` already contains this entry before appending. If `.gitignore` does not exist, create it. The vector index is a binary LanceDB artifact — always regenerable, must not be tracked in git.

**Git identity advisory (non-blocking).** Run `git config user.name` and `git config user.email`. If either is empty or the command fails, print:

```
[ℹ] Git identity not configured — project-memory records will be attributed to "unknown".
    To enable attribution, run:
      git config --global user.name "Your Name"
      git config --global user.email "you@example.com"
```

Never block, never prompt, never escalate.

**Check MCP companion offer:** If `mcp-server/` directory exists, read `mcp-server/INSTALL.md` and follow its "For the LLM" section to detect platform and offer installation. Set `mcp_install_offered_for_version` in `config.yml` after offer is made (regardless of user response). Minimal does NOT auto-index `MEMORY.md` into the vector DB, but the MCP server still provides search over decisions, discussions, and notes if the user later creates them.

**Auto-load reminder** — Do NOT write to CLAUDE.md, AGENTS.md, or any other config file. Print this message to the user:

```
[ℹ] To make sure I load at the start of every session, add this line to your
    global instructions file (CLAUDE.md, GEMINI.md, User Rules, etc.):

      "At the start of every session, load the project-memory skill from
       <path-to-skill>/SKILL.md and follow its on-load instructions."

    Not sure where your global instructions file is?
    → See INSTALLATION.md for platform-specific instructions.
```

Only show this on first run.

## MEMORY.md template

```markdown
# Memory

## Roadmap
- [ ] next step 1
- [ ] next step 2

## Decisions
- YYYY-MM-DD: chose X over Y because Z

## Notes
- YYYY-MM-DD: note title — freeform content

## Log
- YYYY-MM-DD: topic-name — what happened (1 line)
```

Profile metadata (`profile`, `profile_history`) lives in `config.yml` — same as in all profiles.

## On Load

1. Read `.project-memory/MEMORY.md`. Parse the three sections; hold them in context for the session.
2. Run **Pre-Impl Gate Step 0 only** before any significant implementation work — load active instructions filtered by current git user (scan `.project-memory/instructions/*.md` if any exist) and prepend their `# Prompt` body to gate context. If no instructions exist, this is a no-op. Then continue.
3. No phase check, no commit significance classification, no decision-check scan, no drift audit, no topic-shift detection. The user owns these mental models themselves.

## Record-append behavior

- **Roadmap edit:** open `.project-memory/MEMORY.md`, edit the `## Roadmap` section directly.
- **Decision append:** when a decision is made, append a single row to `## Decisions`: `- YYYY-MM-DD: chose X over Y because Z`. No DECISION file, no index. ADR mirror does not apply (no DECISION files are created to mirror).
- **Note append:** when a personal note is taken, append a single row to `## Notes`: `- YYYY-MM-DD: title — content (freeform)`. Or create a `notes/NOTE-YYYY-MM-DD-slug.md` file for longer notes with tags and frontmatter.

- **Log append:** when significant work happens, append a single row to `## Log`: `- YYYY-MM-DD: topic-name — what happened (1 line)`. "Significant" is a judgment call — no classification ceremony. A reasonable rule of thumb: if you'd want a future session to know it happened, log it.

## Discussions / issues / instructions / notes (orthogonal)

These features are user-triggered. When used in a minimal-profile project, the corresponding `.project-memory/<feature>/` directory is created on first use. Their lifecycles follow the shared `conventions/discussions.md`, `conventions/records.md` etc. — minimal does not change their behavior.

## Author attribution

None. Git already records the author of every commit; minimal does not duplicate that metadata into record frontmatter.

## MCP companion

Available if installed, but minimal does NOT auto-index `MEMORY.md` into the vector DB. The single-file shape isn't a fit for the existing index schema (which is keyed on decision/discussion records; legacy phase rows are read-only). If MCP is installed and the user later upgrades to standard, the migration step seeds proper records that DO get indexed.

## Upgrading from minimal

User says "switch project-memory to standard". SKILL.md → change-profile flow:

1. Expand `.project-memory/` with the target profile's skeleton (see `<target>/init.md`). `config.yml` and `MEMORY.md` are already there.
2. Seed `summaries/roadmap.md` from `.project-memory/MEMORY.md → ## Roadmap`.
3. Seed `decisions/index.md` from `.project-memory/MEMORY.md → ## Decisions` (one row per decision — sufficient as a starting state).
4. Leave `MEMORY.md` in place as a historical artifact — user's choice.
5. Update `config.yml`: append new `profile_history` entry, set top-level `profile` to the new value.
6. Rename `.project-memory/MEMORY.md` to `.project-memory/MEMORY.legacy.md` to avoid confusion with the new structure.

## Downgrading to minimal

User says "switch project-memory to minimal" from standard:

1. Create `.project-memory/MEMORY.md` with the three-section template.
2. Seed `## Roadmap` from `summaries/roadmap.md`.
3. Seed `## Decisions` from `decisions/index.md` rows.
4. `## Log` starts empty — historical phases/commits stay where they are; future work logs go here.
5. Update `config.yml`: append new `profile_history` entry, set `profile: minimal`. The existing `.project-memory/` structure is preserved as historical record.

## What this profile gives up (be honest)

- No conflict-check before implementation: the user might re-litigate a decision they already made. Minimal trusts the user to remember or to read `## Decisions` themselves.
- No phase boundaries: cross-session continuity is weaker. Long-running work in minimal usually means the user should upgrade.
- No drift audit: bookkeeping mistakes accumulate silently. Minimal projects shouldn't generate enough bookkeeping for this to matter — if they do, upgrade.
- No instruction re-injection across compaction: in a long context that gets compacted, the instruction body may be lost. Minimal is for short bursts where compaction is unlikely.

If any of these limitations bite, upgrade to `standard`. That's the explicit purpose of the profile system.
