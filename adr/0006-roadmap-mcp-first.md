# ADR 0006: Reorder Scalability Roadmap — MCP First

Date: 2026-06-12
Status: Accepted
Deciders: Hakan Ozakar

## Context

The scalability roadmap ordered items as B1 → B2 → B4 → C1a → C1b (MCP), treating MCP as a late-stage escalation path. Analysis revealed that MCP (C1b) absorbs most of the value B2 and C1a were designed to provide, making it more efficient to build MCP first.

## Decision

Reorder the scalability roadmap: implement C1b (MCP companion server) first. B2 and C1a are dropped as independent roadmap items. B1 and B4 are retained as low-priority optional complements.

## Consequences

- No wasted effort building file-based workarounds (B2, C1a) that MCP supersedes
- B1 (narrative continuity) and B4 (decision age semantics) retained for their MCP-independent value
- Fallback path (MCP absent) remains at A1-A4+B3 quality — acceptable minimum

## See Also

DECISION-2026-06-12-roadmap-mcp-first.md
