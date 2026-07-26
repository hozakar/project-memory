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

**On the fourth directive (instruction load).** The gates' GATE 0 steps also re-inject active
instructions, but that path only fires when a gate fires — and gate firing is exactly what
proved unreliable (`DECISION-2026-07-26-main-directives-single-source`: zero sweeps across
three commits). Instruction survival must not depend on it. The fourth directive puts the load
on the per-turn channel instead, and is written as a check-then-load so it costs nothing when
the instructions are already in context: if you can see them, the directive is satisfied
without a call. A forgotten instruction is worthless, so this is the one directive whose cost
is paid unconditionally. History justifies the redundancy — re-injection silently regressed
from three checkpoints to one during the phase-removal rewrite
(`DECISION-2026-07-11-instruction-re-injection-turn-boundary`), and nothing outside the gates
would have caught it.

<!-- BEGIN project-memory directives -->

- Before any significant implementation: run the Pre-Implementation Gate — load active instructions, then scan `.project-memory/decisions/index.md` (Active section plus every `Global: Yes` row) for conflicting decisions.
- The moment the user picks a direction among alternatives: write the DECISION record immediately, mid-turn. Do not defer it to turn end and do not ask permission.
- Before submitting a turn that included a commit: update `.project-memory/summaries/current-state.md` once, covering the turn's commits (and `summaries/roadmap.md` on scope change).
- Every turn, before acting: the active instructions must be in this turn's context. If you cannot see them, load them first — `search_memory(type_filter: "instruction", created_by_email: <your git email>)`, or scan `.project-memory/instructions/` for `state: active` — and treat every one as binding.

<!-- END project-memory directives -->

> **Formatting is part of the contract.** Each directive is exactly one unwrapped line with no
> bold markers, so that mirrors are byte-comparable against this block and a future audit
> category can diff them with an exact string match. Do not reflow, re-wrap, or restyle these
> three lines — a cosmetic edit here silently invalidates every mirror.

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

Copy the block between the `BEGIN project-memory directives` and `END project-memory
directives` markers above into the host instructions file verbatim, and keep a provenance
line noting it is mirrored from this file. The markers exist to make that copy mechanical.

This is deliberately a verbatim copy rather than a host import. Some hosts support inlining
an imported file (Claude Code resolves `@path` imports transitively), which would give one
definition and per-turn presence at the same time — but the skill is platform-agnostic, and
an instruction file that only works on one host is worse than a copy that works everywhere.
The copy is the portable choice; the cost is the drift surface handled below.

**Do not use a prose pointer** ("read `standard/main-directives.md` and apply the
directives") in place of the block. A pointer leaves the pointer in context and the
directives in a file, requiring a read the agent has no per-turn trigger to perform — which
is the failure this file exists to fix, and which measured 0 of 3 on this repo.

# Mirror Registry

Every verbatim mirror of the directive block. **When this file's directive block changes,
every entry here must be re-mirrored in the same commit.**

| Location | Kind | Notes |
|---|---|---|
| `AGENTS.md` → `## Turn Protocol — project-memory` | this repo's own wiring | Claude Code / opencode read this |
| `INSTALLATION.md` → Tier 2 block | shipped template | consuming projects copy from here |

Consuming projects add their own host instructions file (`CLAUDE.md`, `.clinerules/`,
Windsurf rules, and so on) as a third kind of mirror; those live outside this repo and are
the installing user's responsibility, which is why `INSTALLATION.md` states the provenance
requirement in the template itself.

**Drift protection.** The registry above is the checklist, and
`INSTRUCTION-2026-07-26-main-directives-mirror-sync` binds it for this repo's maintainer. Be
aware of that instruction's limits: instructions load at session start and re-inject only
when a gate fires, so this is a reminder rather than a guarantee — and instructions are
user-scoped, so it does not protect consuming projects at all. A deterministic audit
category comparing each mirror against the block above is the mechanism that would close
both gaps; see `DECISION-2026-07-26-main-directives-single-source` → Future implications.
