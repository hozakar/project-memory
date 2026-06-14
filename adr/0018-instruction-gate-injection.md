# ADR 0018 — Instruction Gate Re-injection

Date: 2026-06-14
Status: Active
Supersedes: ADR 0011 (session-loading section only)

## Context

Instructions injected once at session start are silently lost after compaction or in
long contexts. The user's workflow preferences disappear without any signal.

## Decision

Re-inject active instructions at every gate checkpoint. Session start loading is
retained as the first injection point.

## Tradeoff

~1000 tokens per gate, ~3000–4000 per session ≈ 2% of a 200K context window.
Accepted because instructions are worthless if forgotten.

## Consequences

- Instructions survive compaction
- `trigger` field removed from INSTRUCTION template (superseded by universal gate rule)
- See DECISION-2026-06-14-instruction-gate-injection for full reasoning
