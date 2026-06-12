# Decision Cross-Reference Mechanism

Date: 2026-06-08
Status: Accepted

## Context and Problem Statement

The skill's most valuable use case — surfacing an old architectural decision when a new request implicitly contradicts it — was working by luck, not by design. Decisions lived in individual files not loaded at session start. The pre-implementation step recommending a decision scan was advisory, not a gate. There was no structural signal for detecting overlap between decisions or between a decision and a proposed implementation.

The concrete scenario: a user asks "let's dockerize this" while an existing decision said "this is local-only, no auth, no server." Without a cross-reference mechanism, Claude has no way to surface the conflict before implementation begins.

## Considered Options

- Option A: Pure recency-based priority
- Option B: Pure scope field matching
- Option C: Multiple sequential questions per implementation
- Option D: Fully automatic semantic conflict resolution

## Decision Outcome

Chosen option: "Structured `touches` field + mandatory Pre-Implementation Gate + `decisions/index.md` loaded at session start", because it makes conflict detection reproducible rather than lucky, asks exactly once when conflict is real, and stays silent otherwise.

### Positive Consequences

- The Docker scenario becomes reproducible, not lucky
- New implementations are forced to confront prior architectural commitments
- Decision history is browsable in a single file (`decisions/index.md`) instead of scattered

### Negative Consequences

- `decisions/index.md` requires manual maintenance — each new DECISION file needs a corresponding index row
- Index drift is possible without automation (mitigated by audit Category 6)

## Pros and Cons of the Options

### Option A — Pure recency-based priority

- Good: simple to implement
- Bad: a 2-year-old architectural constraint is usually more important than last week's style preference; recency alone hides high-weight old decisions

### Option B — Pure scope field matching

- Good: straightforward string comparison
- Bad: scopes are abstract; "token persistence" touches both `persistence` and `auth`; the author can't predict all downstream intersections

### Option C — Multiple sequential questions per implementation

- Good: thorough
- Bad: floods the workflow; users default to "yes" on reflex; questions lose signal and become noise

### Option D — Fully automatic semantic resolution

- Good: no user interruption
- Bad: semantic judgment is unreliable for cross-decision conflict; silent wrong picks are worse than visible questions
