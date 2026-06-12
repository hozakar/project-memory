# Skill Files English Only

Date: 2026-06-08
Status: Accepted

## Context and Problem Statement

The project-memory skill files contained a mix of Turkish and English content. The `<kategori>` placeholder in the DECISION frontmatter template, Turkish example strings in the `touches` field, and Turkish session override phrases (`"atla"`, `"şimdilik atla"`) caused a concrete bug: non-English text propagating into generated outputs consumed by other systems. A consistent language rule was needed.

## Considered Options

- Option A: All skill files written in Turkish (match the primary author's language)
- Option B: Bilingual — maintain Turkish and English side-by-side
- Option C: No rule — author picks language per edit

## Decision Outcome

Chosen option: "English-only for all skill files", because skill files are LLM-facing instruction inputs, not user-facing documents. English is the LLM's strongest register for instruction-following, and the rule eliminates the class of bugs where non-English placeholders propagate into generated output.

Memory data under `.project-memory/` (user-authored, user-read) is explicitly exempt and may be written in any language.

### Positive Consequences

- Consistent skill files usable by any LLM session or project consumer
- Eliminates mixed-language placeholder bugs
- Simple authoring rule: always English for skill files

### Negative Consequences

- A Turkish-speaking author must context-switch when editing skill files

## Pros and Cons of the Options

### Option A — Turkish-only skill files

- Good: matches primary author's language, easier to author
- Bad: skill files are LLM-facing; LLM instruction-following quality is the optimization target, not human readability for a specific speaker; limits reuse by non-Turkish consumers

### Option B — Bilingual side-by-side

- Good: no context switch for any reader
- Bad: doubles file size; doubles maintenance burden; version drift between languages will occur over time

### Option C — No rule

- Good: minimal friction
- Bad: the `<kategori>` incident proves mixed state causes concrete bugs; inconsistency is the cost
