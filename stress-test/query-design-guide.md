# Query Design Guide

## Structural-filtering pattern

Every query uses one of three shapes:

### Pinpoint lookup (no `diversify`)

Use when exactly one record should rank #1:
```typescript
{ query: "specific concept", typeFilter: "decision" }
```
`diversify` defaults to `false`. Top-1 = max cosine similarity; no MMR reranking.

### Survey / exploration (`diversify: true`)

Use when the corpus has many partially-relevant records and you want breadth:
```typescript
{ query: "broad topic spanning many records", diversify: true, top_k: 5 }
```
MMR over-fetches 5× the requested count and reranks with lambda=0.7 (relevance-leaning). P@1 is preserved (first pick = max similarity). Use for top_k ≥ 5 only.

### Outcome-type narrowing

Use to restrict discussion searches to a specific conclusion category:
```typescript
{ query: "...", typeFilter: "discussion", outcomeTypeFilter: "none" }
```
`outcomeTypeFilter` values: `none`, `decision`, `roadmap`. The `phase` value was removed per
DECISION-2026-07-05; existing phase-outcome discussions retain their historical value but are
not used for new content. Exact match on the `outcomeType` column in LanceDB.

## Adding new queries

1. Write a natural-language question a real user would ask.
2. Choose: pinpoint or survey? Add `diversify: true` only if the answer spans multiple records.
3. Add `typeFilter` where the record type is known — reduces noise significantly.
4. Add the human-readable question to `queries.md`.
5. Add the machine-executable version to the `QUERIES` array in `query.ts`.
6. If also adding to `eval.ts`: provide ≥ 2 keyword alternatives that match the expected top-1 result's ID or title in template mode. Run `eval.ts` to verify.

## What makes a query good

- **Temporal specificity** — "18 months ago" or "first year" forces date-range weighting.
- **Domain + intent pair** — combine a technical noun ("auth", "cache") with a search reason ("conflicts", "alternatives rejected", "downstream impact").
- **Cross-record dependency** — ask what would break if X changed; surfaces second-order relationships.
- **Explicit type targeting** — prefer `typeFilter: "decision"` for constraint questions, `typeFilter: "discussion"` for debate/architecture questions.
