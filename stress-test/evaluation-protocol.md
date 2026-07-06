# Stress-Test Evaluation Protocol

## When to run

Run the full evaluation after any change to:
- `mcp-server/src/tools/search_memory.ts` — core search logic
- `mcp-server/src/tools/rebuild_index.ts` — index schema or embedding pipeline
- LanceDB schema (adding/removing columns in any `index_*.ts` tool)

## CI smoke (automated, ~30s)

Template mode: deterministic, no API key, P@1 assertion.

```bash
cd stress-test && python generate.py --phases 44 --decisions 26 --time-years 1 --out generated && cd ..
npx tsx stress-test/index.ts stress-test/generated
npx tsx stress-test/eval.ts stress-test/generated
```

**Pass criterion:** `eval.ts` exits 0 (P@1 ≥ 15/16).

## Full evaluation (pre-release, ~15 min)

LLM mode adds cross-topic semantic variation so MMR has room to work. Run before bumping the MCP server version or merging a search algorithm change.

```bash
cd stress-test
python generate.py --phases 440 --decisions 286 --time-years 3 --out generated
cd ..
npx tsx stress-test/index.ts stress-test/generated
npx tsx stress-test/query.ts stress-test/generated   # manual review of scores
npx tsx stress-test/eval.ts stress-test/generated    # P@1 assertion
```

## Acceptance rule

Accept a search change if **both** hold:
1. P@1 stays ≥ 15/16 in full-eval mode (no regression in top-1 accuracy).
2. At least one of: average similarity scores improve, OR result-set correctness improves (verified manually via `query.ts` output — fewer irrelevant top-5 entries).

If P@1 drops 15→14 AND no scores improved: reject.

## Updating eval.ts after template changes

When `generate.py` templates are renamed or new domains added, update the `keywords` arrays in `stress-test/eval.ts` `EXPECTED` to match the new vocabulary. Commit the keyword update alongside the template change. Run `npx tsx stress-test/query.ts stress-test/generated` to see actual top results before updating.
