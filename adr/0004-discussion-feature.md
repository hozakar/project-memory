# Discussion Feature Design

Date: 2026-06-11
Status: Accepted

## Context and Problem Statement

Exploratory conversations between the user and LLM about features, tradeoffs, and design decisions were being lost between sessions. The Decisions mechanism captured final outcomes but not the reasoning path that led to them. Issues captured bugs but not design debates. Roadmap had items without provenance.

The gap: a future session has no way to know "we already discussed this and ruled it out, here's why." Without discussion capture, teams relitigate settled questions, and the reasoning behind deferred decisions disappears.

## Considered Options

- Option A: Separate nullable fields per outcome type (`triggered_phase`, `triggered_decision`, `triggered_issue`, `roadmap_entry`)
- Option B: Free-text body only, no structured outcome
- Option C: Write discussion files immediately on trigger (not at close)

## Decision Outcome

Chosen option: "Single structured `outcome` block + write at close + implicit trigger detection", because a single extensible block is unambiguous and avoids the multi-nullable-field problem, writing at close keeps the index clean, and implicit triggers reduce friction so discussions are captured without requiring the user to remember a command.

### Positive Consequences

- Discussion provenance for every artifact (phase, decision, issue, roadmap item)
- Future sessions can reference past discussions to avoid relitigating settled debates
- Implicit triggers capture exploratory conversations even when the user doesn't explicitly invoke the feature

### Negative Consequences

- More files to maintain
- `discussions/index.md` has the same manual-maintenance risk as `decisions/index.md`

## Pros and Cons of the Options

### Option A — Separate nullable fields per outcome type

- Good: explicit field per outcome type, easy to check presence
- Bad: what if two fields are set? Ambiguous; harder to extend with new outcome types; harder to validate

### Option B — Free-text body only

- Good: no schema to maintain
- Bad: no way to automatically cross-reference discussions with resulting artifacts during Memory Loading or Pre-Implementation Gate scanning

### Option C — Write immediately on trigger

- Good: captures partial discussion even if session ends mid-way
- Bad: incomplete discussions pollute the index with noise; writing at close is the right boundary — a discussion is only meaningful once it has a conclusion
