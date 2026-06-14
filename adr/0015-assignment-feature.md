# ASSIGNMENT Record Type — Cross-User Task Delegation

Date: 2026-06-14
Status: Accepted

## Context and Problem Statement

The project-memory skill had no mechanism for cross-user task delegation. A user who identified work for a teammate had no way to route that work through the skill so the assignee would discover it at their next session. Existing record types (INSTRUCTION, maintainer role) handle single-owner scoping and era gating — neither addresses cross-user task delegation with lifecycle tracking.

## Considered Options

- Option A: Inline `assigned_to` field on existing records (phase.yml, issue frontmatter, discussion outcome blocks)
- Option B: Independent ASSIGNMENT record type in `.project-memory/assignments/`

## Decision Outcome

Chosen option: "Option B — Independent ASSIGNMENT record type", because it provides a single directory for discovery, a clean independent state machine, and mirrors the proven INSTRUCTION session-start load pattern.

### Positive Consequences

- Single directory scan finds all pending assignments for a user
- Target record state and assignment state remain independent
- Rejection lifecycle is first-class — tasks cannot be silently dropped
- Freeform type handles tasks that don't map to an existing record
- Persistent session-start notifications prevent cross-session task loss

### Negative Consequences

- New record type increases skill complexity and file count
- Session-start UX becomes longer (more blocks to display)
- MCP schema grows (new `assignment` type, new `index_assignment` tool, new search filters)

## Pros and Cons of the Options

### Option A — Inline `assigned_to` on existing records

Discovery requires scanning all phase/issue/discussion directories. Rejection state contaminates the target record's lifecycle. No unified assigner view for outgoing assignments. Each record type would need slightly different field handling.

### Option B — Independent ASSIGNMENT record type (chosen)

Follows the same architectural pattern as INSTRUCTION records. State machine (pending → accepted → ongoing → completed/rejected) is fully independent. Cat 14 audit covers orphan targets, stale pending (>30d), and evidence-less completion.
