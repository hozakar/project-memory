# MCP Server Quality Gates — Design Spec

**Date:** 2026-06-14
**Status:** Approved

## Problem

`mcp-server/` has no typecheck script, no linter, and no tests. TypeScript compiles to `dist/` but `tsc --noEmit` is never run standalone. Lint and formatting are unchecked. No test coverage exists for any of the 9 MCP tools, DB layer, embedder, or utilities.

## Decisions

| Area | Choice | Rationale |
|------|--------|-----------|
| Tests | Vitest | Native TypeScript, ESM-compatible, minimal config |
| Lint | ESLint + typescript-eslint | Most mature TS lint ecosystem |
| CI gate | Husky + lint-staged pre-commit | No GitLab CI yet; gates at commit time |
| Coverage | Report only (no threshold) | Useful signal without blocking CI |

## Directory Structure

```
mcp-server/
├── src/                         (unchanged)
├── tests/
│   ├── unit/
│   │   ├── utils.test.ts              # parseFrontmatter, buildText, null-safe join
│   │   ├── db.test.ts                 # buildLanceRecord, dummy record shape
│   │   └── run_audit_parsers.test.ts  # CRLF/BOM/frontmatter edge cases
│   └── integration/
│       ├── helpers/
│       │   └── tmp-db.ts              # tmpdir + LanceDB setup/teardown
│       ├── search_memory.test.ts
│       ├── index_phase.test.ts
│       ├── check_consistency.test.ts
│       └── run_audit.test.ts
├── vitest.unit.config.ts
├── vitest.integration.config.ts
├── eslint.config.js
└── package.json                 (scripts + lint-staged updated)
```

## npm Scripts

```json
"typecheck":  "tsc --noEmit",
"lint":       "eslint src tests",
"test:unit":  "vitest run --config vitest.unit.config.ts",
"test:int":   "vitest run --config vitest.integration.config.ts",
"test":       "npm run test:unit && npm run test:int",
"coverage":   "vitest run --coverage --config vitest.unit.config.ts",
"prepare":    "husky"
```

## ESLint Config (`eslint.config.js`)

Flat config, typescript-eslint `recommended` ruleset.

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
    }
  },
  { ignores: ["dist/**", "node_modules/**"] }
);
```

`server.ts` already uses `srv as any` — this stays a `warn`, not an error, to avoid forcing a refactor in scope.

## Vitest Configs

**Unit** (`vitest.unit.config.ts`):
- include: `tests/unit/**/*.test.ts`
- environment: node
- coverage: v8 provider, `text` + `html` reporters, excludes `src/index.ts` and `src/server.ts` (entry points, not logic)

**Integration** (`vitest.integration.config.ts`):
- include: `tests/integration/**/*.test.ts`
- environment: node
- testTimeout: 30000ms (LanceDB WASM init)
- hookTimeout: 15000ms
- pool: `forks` (avoids WASM/native module conflicts with worker threads)

## Integration Test Helper

`tests/integration/helpers/tmp-db.ts` exports `createTmpDir()`:
- `mkdtempSync` creates an isolated temp directory per test suite
- Returns `{ dir, cleanup }` — `cleanup()` called in `afterAll`
- Each integration test file owns its DB directory; no shared state between suites

## Pre-commit Hook

Location: `.husky/pre-commit` (repo root)

```sh
#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

cd mcp-server
npx lint-staged
npm run typecheck
npm run test:unit
```

**lint-staged** runs ESLint `--fix` on staged `.ts` files in `src/` and `tests/`.

**Pre-commit does NOT run integration tests** — LanceDB init makes them too slow for commit-time feedback. Integration tests run via `npm test` manually.

## New devDependencies

```
eslint
typescript-eslint
vitest
@vitest/coverage-v8
husky
lint-staged
```

## What Gets Tested

**Unit tests** cover pure functions with no I/O:
- `utils.ts`: `parseFrontmatter` (CRLF, BOM, UTF-8), `buildText`, null-safe `.join()` on undefined arrays
- `db.ts`: `buildLanceRecord` output shape, dummy record field completeness
- `run_audit.ts` parser: frontmatter extraction edge cases already known to have caused bugs

**Integration tests** cover real DB + FS operations:
- `index_phase` → `search_memory`: index a phase, search it back, verify similarity
- `check_consistency`: index two records, delete one file, verify it appears in `missing`
- `run_audit`: write a minimal `.project-memory/` fixture, run audit, verify expected findings
- `search_memory` filters: `type_filter`, `tags_filter`, `touches_filter`, `assigned_to_email`

## Out of Scope

- GitLab CI pipeline (future work)
- `src/server.ts` and `src/index.ts` test coverage (MCP protocol bootstrap; not unit-testable without full MCP harness)
- Prettier / formatting enforcement (not chosen)
- Coverage thresholds (reporting only)
