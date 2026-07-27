---
name: project-memory-main-directives
description: Canonical per-turn directives for the standard profile. Single source of truth, mirrored verbatim into the host instructions file. Full procedures live in standard/gates.md.
---

<!-- BEGIN project-memory directives -->

- Before any significant implementation: run the Pre-Implementation Gate — load active instructions, then scan `.project-memory/decisions/index.md` (Active section plus every `Global: Yes` row) for conflicting decisions.
- The moment the user picks a direction among alternatives: write the DECISION record immediately, mid-turn. Do not defer it to turn end and do not ask permission.
- Before submitting a turn that included a commit: update `.project-memory/summaries/current-state.md` once, covering the turn's commits (and `summaries/roadmap.md` on scope change).
- Every turn, before acting: the active instructions must be in this turn's context. If you cannot see them, load them first — `search_memory(type_filter: "instruction", created_by_email: <your git email>)`, or scan `.project-memory/instructions/` for `state: active` — and treat every one as binding.

<!-- END project-memory directives -->
