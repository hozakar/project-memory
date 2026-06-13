# provenance Field for Decision and Discussion Records

Date: 2026-06-13
Status: Accepted

## Context and Problem Statement

Decision and discussion files record what was decided but not how the decision originated. A directive imposed by the user has a different epistemic weight than a collaboratively designed solution. Future readers and LLMs need this signal to interpret records correctly.

## Considered Options

- Option A: Add provenance to all three record types (decision, discussion, instruction)
- Option B: Use `origin` as the field name
- Option C: Add `provenance` to decision and discussion only; exclude instructions

## Decision Outcome

Chosen option: "Option C — decision and discussion only", because instructions are always user-initiated by definition (redundant), and the instruction schema's existing `origin` field means something different (fork source), creating a naming conflict.

### Positive Consequences

- Future LLMs can distinguish user-imposed rules from jointly designed solutions
- `directive` decisions are treated as non-negotiable; `collaborative` ones as revisable
- No naming conflicts with existing schemas

### Negative Consequences

- All existing records predate this field; absence should be interpreted as `collaborative`

## Pros and Cons of the Options

### Option A — All three record types

Instructions are always directives by definition, so the field is redundant. The instruction `origin` field conflict makes this worse.

### Option B — Use `origin` as field name

`origin` already exists in instruction schema with a different meaning (INSTRUCTION-ID if forked). Same name, different semantics across record types creates ambiguity.
