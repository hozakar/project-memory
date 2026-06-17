---
name: project-memory-templates-decisions
description: Templates for DECISION records and their indexes. Covers DECISION-*.md, adr/NNNN-*.md, decisions/index.md. Author Attribution schema in templates-attribution.md.
---

# Decision Templates

## decisions/index.md

One-row-per-decision summary table. Loaded by Claude at session start and consulted during the Pre-Implementation Gate. Each row mirrors the frontmatter of its DECISION file.

The index has two sections: **Active** (scanned during Pre-Implementation Gate) and **Superseded** (historical context only, loaded on demand).

```md
# Decisions Index

One row per decision. Loaded at session start by Memory Loading Strategy step 8. Primary input to the Pre-Implementation Gate's decision check.

Rows sorted newest first. `Status: superseded` rows remain in the Superseded section for historical context but are not active constraints. `Touches` column lists concrete entities — match against an implementation's affected entities to find candidates. `Global` column is `Yes` when the decision's frontmatter has `applies_globally: true` (cross-cutting policy surfaced at every Pre-Implementation Gate); `-` otherwise.

| Date | ID | Scope | Status | Global | Touches | Claim |
|---|---|---|---|---|---|---|
| 2026-06-08 | DECISION-2026-06-08-decision-cross-reference-mechanism | skill | active | Yes | decisions, pre-impl-gate, touches | Decision cross-reference is mandatory pre-implementation step; supersedes is primary, recency is fallback |

## Superseded

| Date | ID | Scope | Status | Global | Touches | Claim | Superseded By |
|---|---|---|---|---|---|---|---|
```

Maintenance rules:
- Every new `DECISION-*.md` file gets a row added to the Active section in the same write batch.
- When a decision is superseded, move its row from the Active section to the **Superseded** section; update Status to `superseded`; add the Superseded By entry.
- Do not delete rows — historical context is preserved in the Superseded section.
- Claim column is one short sentence — the testable assertion the decision makes. Not a description of the topic.
- Rows sorted newest first within each section.
- Pre-Implementation Gate scans ONLY the Active section. Superseded section is loaded on explicit historical lookup only.

---

## DECISION-YYYY-MM-DD-slug.md

See `conventions.md` for the required frontmatter schema (`id`, `status`, `provenance`, `primary_scope`, `touches`, `supersedes`, `superseded_by`, `adr_id`) and Decision Resolution Rules.

Author attribution fields (`created_by`, `contributors`) are required. See `templates-attribution.md` for the shared schema.

---

## adr/NNNN-slug.md

ADR file created alongside each `DECISION-*.md`. Human-readable, ADR tooling compatible, no frontmatter. Body content mirrors the DECISION file formatted as MADR.

**`adr_id` assignment:** count `.md` files in `adr_dir` (from `.project-memory/config.yml`, default `adr/`), increment by 1, zero-pad to 4 digits (e.g. `0001`, `0042`).

**Slug:** derived from the DECISION slug (drop the `DECISION-YYYY-MM-DD-` prefix).

```md
# <Decision Title>

Date: YYYY-MM-DD
Status: Accepted | Superseded by [NNNN-slug](NNNN-slug.md) | Amended by [NNNN-slug](NNNN-slug.md)

## Context and Problem Statement

<Content from # Context in the DECISION file>

## Considered Options

- Option A
- Option B
- Option C

## Decision Outcome

Chosen option: "<option name>", because <brief rationale from # Decision and # Chosen Solution>.

### Positive Consequences

<Benefits from # Consequences>

### Negative Consequences

<Tradeoffs from # Consequences>

## Pros and Cons of the Options

### Option A

<Rejection reasoning from # Alternatives Considered>

### Option B

<Rejection reasoning from # Alternatives Considered>
```
