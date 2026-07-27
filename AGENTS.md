# Project Instructions

## Subagents — Exempt From Everything Below

Subagents are exempt: if you were dispatched as a subagent for a specific task, skip the session-start load and both gates, and never write to .project-memory/ — report to your parent instead. The parent owns all memory writes and briefs you with the constraints your task needs.

## Session Start

At the start of every session, before doing anything else, in this order:

1. Call `kyck_guide()` to load behavioral instructions for kyck tools, and follow its binding directives for the rest of the session.
2. Load project-memory using the `project-memory` skill / MCP server (decisions, summaries, active tensions, anti-patterns from `.project-memory/`), follow its on-load instructions, and keep its gates and protocols in force for the rest of the session.

Both steps are mandatory. Do not respond to the user's first request until both are complete.
If either step fails or the tools are unavailable, tell the user before proceeding — do not continue silently.
If you skip these steps, prior decisions and constraints are not loaded and nothing from this session is captured in project memory — the user loses that context irretrievably, without ever knowing.

## Turn Protocol

These two directives apply on every turn, including immediately after context compaction. They are mirrored from `src/kyck/tools/directives.json` so they survive even if `kyck_guide()` is not re-called post-compaction.

- Before any research action (reading a file, grepping, fetching, running a command): ask kyck first — call `kyck_recall()`, `kyck_brief()`, or `kyck_peek()`.
- Before submitting every turn to the user: call `kyck_stash()` — unless the turn contained nothing but git operations (commits, adds, pushes).

## project-memory turn protocol

These directives apply on every turn, including immediately after context compaction. They are mirrored verbatim from `standard/main-directives.md` — that file is the source; do not edit them here.

- Before any significant implementation: run the Pre-Implementation Gate — load active instructions, then scan `.project-memory/decisions/index.md` (Active section plus every `Global: Yes` row) for conflicting decisions.
- The moment the user picks a direction among alternatives: write the DECISION record immediately, mid-turn. Do not defer it to turn end and do not ask permission.
- Before submitting a turn that included a commit: update `.project-memory/summaries/current-state.md` once, covering the turn's commits (and `summaries/roadmap.md` on scope change).
- Every turn, before acting: the active instructions must be in this turn's context. If you cannot see them, load them first — `search_memory(type_filter: "instruction", created_by_email: <your git email>)`, or scan `.project-memory/instructions/` for `state: active` — and treat every one as binding.
