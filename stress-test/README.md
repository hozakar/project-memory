# stress-test

Synthetic load generator and indexer for validating semantic search quality at scale.

## What it tests

Semantic search over a realistic project-memory corpus:
- 1 000 phases across 15 engineering domains
- 250 decisions with full context / alternatives / rationale prose
- 3-year timeline with Gaussian burst distribution (milestones every ~7 weeks, ±10 days spread)

The goal is to catch search regressions — queries that should surface a specific phase or decision
but don't, or that return unrelated noise at the top of the result set.

## Usage

**Step 1 — Generate the fixture**
```bash
cd stress-test
python generate.py --phases 1000 --decisions 250 --time-years 3 --out generated
```

The `generated/` directory is gitignored. Generation takes a few seconds and produces a full
`.project-memory/` tree (config, phases, decisions, discussions, summaries).

**Step 2 — Index into LanceDB**
```bash
cd ..
npx tsx stress-test/index.ts stress-test/generated
```

This imports `rebuildIndex` directly from the MCP server source and reports timing + record counts.

**Step 3 — Run test queries**

Use the 15 questions in `queries.md` against `search_memory` (via the MCP server) to evaluate
result quality. Queries cover three categories: temporal, cross-cutting semantic, and conflict detection.

## Files

| File | Purpose |
|------|---------|
| `generate.py` | Pure Python (stdlib only) fixture generator |
| `index.ts` | TypeScript indexer — calls `rebuildIndex` from MCP server src |
| `queries.md` | 15 hand-crafted test questions |
| `generated/` | Output directory (gitignored) |

## Tech debt

`generate.py` has no automated tests. If the `.project-memory/` schema evolves (new required
fields, renamed files, changed YAML shape), the generator will silently produce stale fixtures.
It should eventually be covered by a test suite that validates the generated output against the
schema before indexing.
