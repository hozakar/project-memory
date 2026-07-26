---
name: project-memory-main-directives
description: Canonical compressed per-turn directives for the standard profile. Single source of truth — imported into the host instructions file so the directives survive context compaction. Full procedures live in standard/gates.md.
---

# Main Directives (project-memory, standard profile)

**This file is the single source of truth for the compressed directives.** It is designed to
be imported verbatim into the host instructions file (`CLAUDE.md` / `AGENTS.md`) so the
directives are physically present in context on every turn, including immediately after
context compaction. Do not restate these three directives anywhere else — reference this
file instead.

Full gate procedures (GATE 0 instruction loading, Pre-Implementation Steps 1–3, sweep
Steps 1–2) live in `standard/gates.md`. These are the compressed triggers, not a
replacement for that spec.

<!-- BEGIN project-memory directives -->

- **Before any significant implementation:** run the Pre-Implementation Gate — load active
  instructions, then scan `.project-memory/decisions/index.md` (Active section plus every
  `Global: Yes` row) for conflicting decisions.
- **The moment the user picks a direction among alternatives:** write the DECISION record
  immediately, mid-turn. Do not defer it to turn end and do not ask permission.
- **Before submitting a turn that included a commit:** update
  `.project-memory/summaries/current-state.md` once, covering the turn's commits (and
  `summaries/roadmap.md` on scope change).

<!-- END project-memory directives -->

---

# Why this file exists

Directives that live only inside the skill's own files are loaded once at session start and
are evicted by context compaction. The skill previously claimed instructions survive
compaction "via Pre-Impl Gate GATE 0 and Turn-Boundary Sweep GATE 0 re-injection" — a
circular claim, because knowing that those gates exist depends on the same context
compaction removes.

The host instructions file is the only layer re-injected on every turn independently of
conversation history. Directives must therefore be physically present there, not referenced
by a prose pointer that requires a file read the agent has no trigger to perform.

Empirical basis (2026-07-26, this repo): across a ~2-hour session with three commits
(`ce2d674`, `8f8285f`, `cf0ac45`), the turn-boundary sweep fired **zero** times and
`current-state.md` stayed 11 days stale, while kyck — whose directives are mirrored into the
host instructions file — fired roughly twenty times in the same window under the same
compactions. Same agent, same session: the difference was placement, not discipline.

Governing decision: `DECISION-2026-07-26-main-directives-single-source`.

# How to wire it

**Claude Code (and any host supporting `@path` imports):** add an import line to the host
instructions file. Imports are inlined into context, transitively, so the directives above
appear verbatim on every turn while remaining defined only here:

```
@standard/main-directives.md
```

**Hosts without import support** (opencode, Cursor, Windsurf, Cline, and others): copy the
block between the `BEGIN`/`END` markers above into the host instructions file verbatim, and
keep a provenance line noting it is mirrored from this file. Re-copy when this file changes.
The markers exist to make that copy mechanical.
