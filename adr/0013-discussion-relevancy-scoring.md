# Discussion Relevancy Scoring System

Date: 2026-06-13
Status: Accepted

## Context and Problem Statement

Not every discussion warrants a file. The existing system saves all discussions that enter Discussion Mode, growing the index without proportional signal. A principled filter is needed to distinguish systemic reasoning worth preserving from low-stakes exchanges.

## Considered Options

- Option A: Save everything
- Option B: User decides every time
- Option C: Weighted scoring gate with thresholds and safety rule

## Decision Outcome

Chosen option: "Option C — weighted scoring gate", because it automates the common case (clear high-value or clear low-value), reserves user judgment for the ambiguous middle, and the safety rule prevents silently dropping systemically important conversations.

### Positive Consequences

- Index grows only with signal, not noise
- High-impact conversations are never silently dropped (safety rule)
- User friction is minimal (only asked in the 60-80 band)

### Negative Consequences

- LLM scoring is not deterministic; same conversation may score differently across sessions
- Rubric must be maintained as project evolves

## Pros and Cons of the Options

### Option A — Save everything

Too noisy; index grows faster than it provides signal.

### Option B — User decides every time

Friction on every discussion close; trains reflexive "yes"; no auto-save path for clearly high-value discussions.
