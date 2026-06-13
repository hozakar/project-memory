# ADR 0011 — Instruction Record Type for User Workflow Preferences

Date: 2026-06-13
Status: Accepted

## Context and Problem Statement

Some DECISION records (branch-per-phase, era-maintenance) were user workflow preferences rather than project-level architectural decisions. Mixing these with genuine ADRs polluted the decision index, created potential multi-user conflicts, and loaded unnecessary context at session start. A separate mechanism was needed for persistent, user-scoped workflow instructions.

## Considered Options

- Option A — Keep workflow preferences as DECISION with `primary_scope: workflow`. Rejected: doesn't solve scoping or multi-user conflict.
- Option B — Drop workflow decisions entirely, rely on in-session typing. Rejected: loses persistence.
- Option C — User-specific MEMORY.md file. Rejected: single file per user doesn't scale with independent instructions.
- Option D — INSTRUCTION record type, user-scoped, prompt-based. Chosen.

## Decision Outcome

Chosen option: "Option D — INSTRUCTION record type", because it provides persistent, user-scoped storage with minimal format, no index maintenance burden, and session-start context injection equivalent to the user typing the instruction directly.

### INSTRUCTION Format

Minimal frontmatter (`id`, `state`, `created_by`, `mode`, `trigger`, `origin`, `origin_updated`) with a `# Prompt` body. Stored in `.project-memory/instructions/INSTRUCTION-YYYY-MM-DD-slug.md`. No ADR counterpart, no index file, no Pre-Implementation Gate scanning.

### Session Loading

At session start, instructions matching current git user email are loaded and their prompts injected into LLM context. Warning at ≥5 active instructions.

### Cross-User Sharing

Fork model: adopting another user's instruction creates a new file with `origin` pointing to source. `origin_updated` flag triggers review prompt when source changes.

### Positive Consequences

- Decision index is cleaner — only architectural constraints
- Multi-user safety — conflicting workflow preferences don't collide
- Context efficiency — short prompts instead of full ADR bodies
- No index maintenance burden

### Negative Consequences

- New concept to document in skill files
- Migration required for 2 existing decisions (one-time cost)
- Instructions are not bulk-visible without explicit query

## Supersedes

- ADR 0008 (phase-branch-workflow) — migrated to INSTRUCTION format
- ADR 0009 (era-maintenance) — migrated to INSTRUCTION format

## See Also

- DECISION-2026-06-13-instruction-feature.md
- DISCUSSION-2026-06-13-instruction-feature.md
