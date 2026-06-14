# 17. MCP Per-Session Memory Constraint

Date: 2026-06-14

Status: Active

## Context

Analysis of the MCP server transport layer (`mcp-server/src/index.ts`) revealed that the server uses `StdioServerTransport` — it is a child process of the host CLI, communicating via stdin/stdout pipes. When the host session closes, the pipe closes and the MCP process exits.

Two in-process singletons exist:
- `embedder.ts`: ~22MB ONNX model (all-MiniLM-L6-v2), lazy-loaded on first embed call
- `db.ts`: LanceDB connection, reset on each new process

The LanceDB vector index persists on disk across sessions. The real risk is the non-atomic upsert in `db.ts` (delete then add): if the process crashes between the two operations, the record is permanently removed from the vector index.

## Decision

**MCP server memory footprint must always be evaluated per-session, not cumulatively.**

Because the MCP process dies with the host session, there is no cross-session memory accumulation. The real ongoing risk is the non-atomic upsert in `db.ts` — this is the failure mode to monitor, not memory accumulation.

This is a **constraint record** — a project-wide engineering principle that all developers working on MCP server features must carry. Decisions of this type use `primary_scope: constraint`.

## Consequences

- Any MCP server enhancement must open with a per-session memory impact statement
- The non-atomic upsert in `db.ts` is a known risk; future DB layer work should evaluate atomicity
- `check_consistency` at session start is the recovery mechanism for upsert failures and must not be removed
- Parallel Claude Code sessions each spawn an independent MCP process (~22MB each); this is expected

## Links

- DECISION-2026-06-14-mcp-constraint-per-session-memory
- `mcp-server/src/db.ts` (lines 57-60 — the non-atomic upsert)
- `mcp-server/src/embedder.ts` (singleton ONNX model)
