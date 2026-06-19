# stress-test

Synthetic load generator and indexer for validating semantic search quality at scale.

## What it tests

Semantic search over a realistic project-memory corpus:
- Up to 440 phases across 15 engineering domains (40 templates × 11 services)
- Up to 286 decisions with full context / alternatives / rationale prose (26 templates × 11 services)
- Up to 12 discussions (one per template)
- 3-year timeline with Gaussian burst distribution (milestones every ~7 weeks, ±10 days spread)

The goal is to catch search regressions — queries that should surface a specific phase or decision
but don't, or that return unrelated noise at the top of the result set.

## Corpus limits

In template mode (no `--llm`), generation is capped at the number of unique template×service
combinations to avoid duplicate files:

| Record type | Templates | Services | Max unique |
|-------------|-----------|----------|------------|
| Phases      | 40        | 11       | 440        |
| Decisions   | 26        | 11       | 286        |
| Discussions | 12        | —        | 12         |

To go beyond these limits, use `--llm` (generates unique prose for each record) or
`--differentiate` (post-generates variation on duplicate groups, more economical than full LLM mode).

## Usage

**Step 1 — Generate the fixture**

Template mode (fast, no API key, capped at unique combinations):
```bash
cd stress-test
python generate.py --phases 440 --decisions 286 --time-years 3 --out generated
```

LLM mode — via Claude Code CLI (no API key needed, unlimited phases/decisions):
```bash
cd stress-test
python generate.py --phases 1000 --decisions 500 --time-years 3 --out generated --llm
# Differentiation runs automatically in --llm mode — no extra flag needed.
```

LLM mode — via OpenRouter (faster, parallel, any model):
```bash
cd stress-test
python generate.py --phases 1000 --decisions 500 --time-years 3 --out generated \
  --llm --llm-provider openrouter \
  --api-key sk-or-... \
  --llm-model google/gemini-flash-2.0 \
  --llm-workers 8
# Or set OPENROUTER_API_KEY env var instead of --api-key
# --llm-batch 10 (items per call, default 10)
# --llm-workers 8 (parallel calls, default 1 — increase for openrouter)
```

Template + differentiate — deterministic generation then LLM rewrite of duplicate groups only:
```bash
cd stress-test
# Cheapest path to a varied corpus: no LLM for unique records, LLM only for duplicates
python generate.py --phases 440 --decisions 286 --time-years 3 --out generated --differentiate
# --differentiate uses the same --llm-provider / --llm-model flags as --llm
```

The `generated/` directory is gitignored. Template generation takes a few seconds; LLM mode
takes ~5–10 minutes for 440 phases + 286 decisions (~75 API calls at batch=10).

**Step 2 — Index into LanceDB**
```bash
cd ..
npx tsx stress-test/index.ts stress-test/generated
```

This imports `rebuildIndex` directly from the MCP server source and reports timing + record counts.

**Step 3 — Run test queries**

Use the 15 questions in `queries.md` against `search_memory` (via the MCP server) to evaluate
result quality. Queries cover three categories: temporal, cross-cutting semantic, and conflict detection.

## Score expectations

all-MiniLM-L6-v2 (the default embedding model) has a realistic score ceiling of ~0.50–0.55 for
project-memory content. Do not use 0.65 as a pass threshold — that model cannot reach it on this
content type. Precision@1 (correct document ranked #1) is the primary quality metric.

## Files

| File | Purpose |
|------|---------|
| `generate.py` | Pure Python (stdlib only) fixture generator |
| `index.ts` | TypeScript indexer — calls `rebuildIndex` from MCP server src |
| `queries.md` | 15 hand-crafted test questions |
| `tests/test_generate.py` | pytest schema validation for `generate.py` output |
| `generated/` | Output directory (gitignored) |

## Testing

```bash
cd stress-test
pip install pytest pyyaml
pytest tests/
```

Tests validate the generated `.project-memory/` schema: directory structure,
required YAML/frontmatter fields, ID format, and index files. Run after any
`generate.py` template change.
