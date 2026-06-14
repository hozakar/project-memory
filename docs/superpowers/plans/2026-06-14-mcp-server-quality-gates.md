# MCP Server Quality Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add typecheck, ESLint lint, Vitest unit + integration tests, and a pre-commit hook to mcp-server.

**Architecture:** Unit tests cover pure exported functions (utils.ts, db.ts, run_audit.ts). Integration tests use a per-file tmpdir pointed at by `PROJECT_MEMORY_DIR`; Vitest `pool:forks` gives each test file its own process, resetting the LanceDB singleton automatically. Pre-commit hook is a plain shell script under `.husky/` — no Husky npm package, only `lint-staged`.

**Tech Stack:** Vitest 2.x, ESLint v9 flat config (eslint.config.mjs), typescript-eslint 8.x, @vitest/coverage-v8, lint-staged 15.x

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `mcp-server/package.json` | Add scripts, devDeps, lint-staged config |
| Modify | `mcp-server/tsconfig.json` | Exclude `tests/` from tsc |
| Create | `mcp-server/eslint.config.mjs` | ESLint v9 flat config |
| Create | `mcp-server/vitest.unit.config.ts` | Unit test config |
| Create | `mcp-server/vitest.integration.config.ts` | Integration test config |
| Modify | `mcp-server/src/tools/run_audit.ts` | Export `parseFrontmatter` |
| Modify | `mcp-server/src/db.ts` | Export `escapeLike` |
| Create | `mcp-server/tests/unit/utils.test.ts` | build*Text function tests |
| Create | `mcp-server/tests/unit/db.test.ts` | escapeLike unit tests |
| Create | `mcp-server/tests/unit/run_audit_parsers.test.ts` | parseFrontmatter edge cases |
| Create | `mcp-server/tests/integration/helpers/tmp-db.ts` | tmpdir setup/teardown |
| Create | `mcp-server/tests/integration/check_consistency.test.ts` | missing + orphaned detection |
| Create | `mcp-server/tests/integration/index_phase.test.ts` | index + search roundtrip |
| Create | `mcp-server/tests/integration/run_audit.test.ts` | Cat 10 non-git audit |
| Create | `.husky/pre-commit` | Pre-commit shell hook |

---

## Task 1: Install devDependencies + update package.json

**Files:**
- Modify: `mcp-server/package.json`

- [ ] **Step 1: Install packages**

```bash
cd mcp-server
npm install --save-dev eslint@^9 typescript-eslint@^8 vitest@^2 @vitest/coverage-v8@^2 lint-staged@^15
```

- [ ] **Step 2: Replace the `scripts` and `devDependencies` blocks in `mcp-server/package.json`**

Replace the existing `scripts` block with:
```json
"scripts": {
  "build":      "node --max-old-space-size=8192 node_modules/typescript/bin/tsc",
  "start":      "node dist/index.js",
  "dev":        "npx ts-node src/index.ts",
  "typecheck":  "tsc --noEmit",
  "lint":       "eslint src tests",
  "test:unit":  "vitest run --config vitest.unit.config.ts",
  "test:int":   "vitest run --config vitest.integration.config.ts",
  "test":       "npm run test:unit && npm run test:int",
  "coverage":   "vitest run --coverage --config vitest.unit.config.ts"
},
```

Add `lint-staged` config after `"private": true`:
```json
"lint-staged": {
  "mcp-server/src/**/*.ts": "eslint --fix",
  "mcp-server/tests/**/*.ts": "eslint --fix"
}
```

- [ ] **Step 3: Verify install**

```bash
npm list eslint vitest lint-staged
```
Expected: all three listed without errors.

---

## Task 2: ESLint flat config

**Files:**
- Create: `mcp-server/eslint.config.mjs`

- [ ] **Step 1: Create `mcp-server/eslint.config.mjs`**

```js
import tseslint from "typescript-eslint";

export default tseslint.config(
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  { ignores: ["dist/**", "node_modules/**"] }
);
```

- [ ] **Step 2: Run lint and fix issues**

```bash
cd mcp-server
npm run lint
```

If errors appear (warnings are fine for `no-explicit-any`), fix them. The most likely issue is `no-unused-vars` — check for variables prefixed without `_` that are unused.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/package.json mcp-server/package-lock.json mcp-server/eslint.config.mjs
git commit -m "feat(mcp): add ESLint v9 flat config + devDependencies"
```

---

## Task 3: Typecheck script + tsconfig fix

**Files:**
- Modify: `mcp-server/tsconfig.json`

- [ ] **Step 1: Exclude tests/ from tsc**

In `mcp-server/tsconfig.json`, update `"exclude"`:
```json
"exclude": ["node_modules", "dist", "tests"]
```

- [ ] **Step 2: Run typecheck**

```bash
cd mcp-server
npm run typecheck
```

Expected: exits 0 with no errors. (The code already compiled via `build`, so `--noEmit` should pass.)

- [ ] **Step 3: Commit**

```bash
git add mcp-server/tsconfig.json
git commit -m "feat(mcp): add typecheck script, exclude tests from tsc"
```

---

## Task 4: Vitest configs

**Files:**
- Create: `mcp-server/vitest.unit.config.ts`
- Create: `mcp-server/vitest.integration.config.ts`

- [ ] **Step 1: Create `mcp-server/vitest.unit.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts", "src/server.ts"],
      reporter: ["text", "html"],
    },
  },
});
```

- [ ] **Step 2: Create `mcp-server/vitest.integration.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 15000,
    pool: "forks",
  },
});
```

- [ ] **Step 3: Verify configs are valid TypeScript**

```bash
cd mcp-server
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/vitest.unit.config.ts mcp-server/vitest.integration.config.ts
git commit -m "feat(mcp): add vitest unit and integration configs"
```

---

## Task 5: Export test-internal helpers

**Files:**
- Modify: `mcp-server/src/tools/run_audit.ts` (line 33)
- Modify: `mcp-server/src/db.ts` (line 63)

`parseFrontmatter` and `escapeLike` are private functions with known bug history — they must be unit-testable.

- [ ] **Step 1: Export `parseFrontmatter` from run_audit.ts**

Change line 33 of `mcp-server/src/tools/run_audit.ts` from:
```ts
function parseFrontmatter(content: string): Record<string, string> {
```
to:
```ts
export function parseFrontmatter(content: string): Record<string, string> {
```

- [ ] **Step 2: Export `escapeLike` from db.ts**

Change line 63 of `mcp-server/src/db.ts` from:
```ts
function escapeLike(value: string): string {
```
to:
```ts
export function escapeLike(value: string): string {
```

- [ ] **Step 3: Verify typecheck still passes**

```bash
cd mcp-server
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/src/tools/run_audit.ts mcp-server/src/db.ts
git commit -m "feat(mcp): export parseFrontmatter and escapeLike for unit testing"
```

---

## Task 6: Unit tests — utils.ts

**Files:**
- Create: `mcp-server/tests/unit/utils.test.ts`

- [ ] **Step 1: Create `mcp-server/tests/unit/utils.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import {
  buildPhaseText,
  buildDecisionText,
  buildDiscussionText,
  buildCommitText,
  buildEraText,
  buildInstructionText,
  buildAssignmentText,
} from "../../src/utils";

describe("buildPhaseText", () => {
  it("joins title, tags, planText, implementationText, and commit diffs", () => {
    const result = buildPhaseText({
      id: "phase-20260614-test",
      title: "Test Phase",
      tags: ["mcp", "test"],
      planText: "plan content",
      implementationText: "impl content",
      commitDiffs: [{ hash: "abc123", message: "feat: add X", files: ["src/a.ts"], diffSnippet: "+line" }],
      status: "completed",
    });
    expect(result).toContain("Test Phase");
    expect(result).toContain("mcp test");
    expect(result).toContain("plan content");
    expect(result).toContain("impl content");
    expect(result).toContain("feat: add X");
    expect(result).toContain("src/a.ts");
  });

  it("handles undefined tags without throwing (null-safe join)", () => {
    const result = buildPhaseText({
      id: "phase-test",
      title: "No Tags",
      tags: undefined as unknown as string[],
      planText: "",
      implementationText: "",
      commitDiffs: [],
      status: "completed",
    });
    expect(result).toContain("No Tags");
  });

  it("truncates output to 6000 characters", () => {
    const result = buildPhaseText({
      id: "phase-test",
      title: "T",
      tags: [],
      planText: "x".repeat(7000),
      implementationText: "",
      commitDiffs: [],
      status: "completed",
    });
    expect(result.length).toBe(6000);
  });
});

describe("buildDecisionText", () => {
  it("joins title, status, context, and decision body", () => {
    const result = buildDecisionText({
      id: "DECISION-2026-06-14-test",
      title: "Test Decision",
      status: "active",
      context: "ctx",
      decisionBody: "body",
      touches: ["file_a", "file_b"],
    });
    expect(result).toContain("Test Decision");
    expect(result).toContain("active");
    expect(result).toContain("file_a file_b");
    expect(result).toContain("ctx");
    expect(result).toContain("body");
  });

  it("handles undefined touches without throwing (null-safe join)", () => {
    const result = buildDecisionText({
      id: "DECISION-test",
      title: "T",
      status: "active",
      context: "",
      decisionBody: "",
      touches: undefined as unknown as string[],
    });
    expect(result).toContain("T");
  });
});

describe("buildDiscussionText", () => {
  it("handles undefined tags without throwing (null-safe join)", () => {
    const result = buildDiscussionText({
      id: "DISCUSSION-test",
      title: "T",
      status: "concluded",
      outcome: "none",
      tags: undefined as unknown as string[],
      summary: "s",
      bodyText: "b",
    });
    expect(result).toContain("T");
  });
});

describe("buildCommitText", () => {
  it("joins message, files, and diff snippet", () => {
    const result = buildCommitText({
      hash: "deadbeef",
      message: "fix: bug",
      files: ["src/db.ts"],
      diffSnippet: "-old\n+new",
    });
    expect(result).toContain("fix: bug");
    expect(result).toContain("src/db.ts");
    expect(result).toContain("-old\n+new");
  });
});

describe("buildEraText", () => {
  it("includes id, title, dateRange, phases, and narrative", () => {
    const result = buildEraText({
      id: "era-001",
      title: "Era 1",
      phases: ["phase-a", "phase-b"],
      dateRange: "2026-06-08 to 2026-06-11",
      narrative: "narrative text",
    });
    expect(result).toContain("era-001");
    expect(result).toContain("Era 1");
    expect(result).toContain("phase-a phase-b");
    expect(result).toContain("narrative text");
  });
});

describe("buildInstructionText", () => {
  it("joins id, state, prompt, and optional origin", () => {
    const result = buildInstructionText({
      id: "INSTRUCTION-2026-06-13-test",
      prompt: "always use TDD",
      state: "active",
    });
    expect(result).toContain("INSTRUCTION-2026-06-13-test");
    expect(result).toContain("always use TDD");
    expect(result).toContain("active");
  });
});

describe("buildAssignmentText", () => {
  it("includes assignee, assigner, and description for freeform", () => {
    const result = buildAssignmentText({
      id: "ASSIGNMENT-2026-06-14-test",
      status: "pending",
      type: "freeform",
      assignedTo: { name: "Mehmet", email: "mehmet@example.com" },
      assignedBy: { name: "Hakan", email: "hakan@example.com" },
      assignedAt: "2026-06-14",
      targetType: null,
      targetId: null,
      description: "Review the auth module",
      rejectedAt: null,
      rejectionReason: null,
      completedAt: null,
      completionNote: null,
      completedPhaseId: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 0,
      lastRemindedAt: null,
    });
    expect(result).toContain("Mehmet");
    expect(result).toContain("Review the auth module");
    expect(result).toContain("pending");
  });

  it("includes target info for direct type", () => {
    const result = buildAssignmentText({
      id: "ASSIGNMENT-2026-06-14-direct",
      status: "accepted",
      type: "direct",
      assignedTo: { name: "Ahmet", email: "ahmet@example.com" },
      assignedBy: { name: "Hakan", email: "hakan@example.com" },
      assignedAt: "2026-06-14",
      targetType: "issue",
      targetId: "ISSUE-2026-06-14-foo",
      description: null,
      rejectedAt: null,
      rejectionReason: null,
      completedAt: null,
      completionNote: null,
      completedPhaseId: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 0,
      lastRemindedAt: null,
    });
    expect(result).toContain("issue ISSUE-2026-06-14-foo");
  });

  it("includes rejection reason when status is rejected", () => {
    const result = buildAssignmentText({
      id: "ASSIGNMENT-2026-06-14-rejected",
      status: "rejected",
      type: "freeform",
      assignedTo: { name: "Ahmet", email: "ahmet@example.com" },
      assignedBy: { name: "Hakan", email: "hakan@example.com" },
      assignedAt: "2026-06-14",
      targetType: null,
      targetId: null,
      description: "some task",
      rejectedAt: "2026-06-15",
      rejectionReason: "not my area",
      completedAt: null,
      completionNote: null,
      completedPhaseId: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 1,
      lastRemindedAt: "2026-06-14",
    });
    expect(result).toContain("not my area");
    expect(result).toContain("2026-06-15");
  });
});
```

- [ ] **Step 2: Run unit tests**

```bash
cd mcp-server
npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/tests/unit/utils.test.ts
git commit -m "test(mcp): unit tests for utils.ts build*Text functions"
```

---

## Task 7: Unit tests — db.ts escapeLike

**Files:**
- Create: `mcp-server/tests/unit/db.test.ts`

- [ ] **Step 1: Create `mcp-server/tests/unit/db.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { escapeLike } from "../../src/db";

describe("escapeLike", () => {
  it("escapes single quotes by doubling them", () => {
    expect(escapeLike("O'Brien")).toBe("O''Brien");
  });

  it("returns unchanged string when no single quotes present", () => {
    expect(escapeLike("normal-value")).toBe("normal-value");
  });

  it("handles multiple single quotes", () => {
    expect(escapeLike("it's a 'test'")).toBe("it''s a ''test''");
  });

  it("handles empty string", () => {
    expect(escapeLike("")).toBe("");
  });
});
```

- [ ] **Step 2: Run unit tests**

```bash
cd mcp-server
npm run test:unit
```

Expected: all tests PASS including the new 4 escapeLike tests.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/tests/unit/db.test.ts
git commit -m "test(mcp): unit tests for db.ts escapeLike"
```

---

## Task 8: Unit tests — parseFrontmatter edge cases

**Files:**
- Create: `mcp-server/tests/unit/run_audit_parsers.test.ts`

- [ ] **Step 1: Create `mcp-server/tests/unit/run_audit_parsers.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../../src/tools/run_audit";

describe("parseFrontmatter", () => {
  it("parses basic key-value pairs", () => {
    const content = "---\nid: DECISION-2026-06-14-test\nstatus: active\n---\n# Title";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("DECISION-2026-06-14-test");
    expect(result.status).toBe("active");
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nid: crlf-test\r\nstatus: active\r\n---\r\n";
    expect(parseFrontmatter(content).id).toBe("crlf-test");
    expect(parseFrontmatter(content).status).toBe("active");
  });

  it("strips UTF-8 BOM from the beginning of content", () => {
    const content = "﻿---\nid: bom-test\nstatus: active\n---\n";
    expect(parseFrontmatter(content).id).toBe("bom-test");
  });

  it("handles CRLF + BOM together", () => {
    const content = "﻿---\r\nid: both-test\r\nstatus: active\r\n---\r\n";
    expect(parseFrontmatter(content).id).toBe("both-test");
  });

  it("strips surrounding double quotes from values", () => {
    const content = '---\nadr_id: "0015"\n---\n';
    expect(parseFrontmatter(content).adr_id).toBe("0015");
  });

  it("strips surrounding single quotes from values", () => {
    const content = "---\nadr_id: '0015'\n---\n";
    expect(parseFrontmatter(content).adr_id).toBe("0015");
  });

  it("returns empty object when no frontmatter block present", () => {
    expect(parseFrontmatter("# Just a heading\nSome text.")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseFrontmatter("")).toEqual({});
  });

  it("ignores list values (only captures scalar key: value lines)", () => {
    const content = "---\nid: test-id\ntouches:\n  - file_a\n  - file_b\n---\n";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("test-id");
    // list items don't match /^(\w+):\s*(.+)$/ so they are not captured
    expect(result.touches).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run unit tests**

```bash
cd mcp-server
npm run test:unit
```

Expected: all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/tests/unit/run_audit_parsers.test.ts
git commit -m "test(mcp): unit tests for parseFrontmatter edge cases (CRLF, BOM, quotes)"
```

---

## Task 9: Integration test helper

**Files:**
- Create: `mcp-server/tests/integration/helpers/tmp-db.ts`

- [ ] **Step 1: Create `mcp-server/tests/integration/helpers/tmp-db.ts`**

```ts
import { mkdtempSync, rmSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface TmpDir {
  dir: string;       // base dir (PROJECT_MEMORY_DIR — parent of .project-memory/)
  pmDir: string;     // dir/.project-memory/
  cleanup: () => void;
}

export function createTmpDir(): TmpDir {
  const dir = mkdtempSync(join(tmpdir(), "pm-test-"));
  const pmDir = join(dir, ".project-memory");
  mkdirSync(pmDir, { recursive: true });
  return {
    dir,
    pmDir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
```

- [ ] **Step 2: Run typecheck**

```bash
cd mcp-server
npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/tests/integration/helpers/tmp-db.ts
git commit -m "test(mcp): integration test helper — tmp-db createTmpDir"
```

---

## Task 10: Integration — check_consistency

**Files:**
- Create: `mcp-server/tests/integration/check_consistency.test.ts`

This test does NOT use the embedder — it inserts a raw zero-vector record directly via `upsert`.

- [ ] **Step 1: Create `mcp-server/tests/integration/check_consistency.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { checkConsistency } from "../../src/tools/check_consistency";
import { upsert } from "../../src/db";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  // Point the DB singleton to our tmpdir BEFORE any DB call
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => tmp.cleanup());

describe("checkConsistency — missing", () => {
  it("reports a phase in index.yml that is not in the DB", async () => {
    // Write phases/index.yml with one phase ID
    const phasesDir = join(tmp.pmDir, "phases");
    mkdirSync(phasesDir, { recursive: true });
    writeFileSync(
      join(phasesDir, "index.yml"),
      "phases:\n  - id: phase-missing-from-db\n    status: completed\n"
    );

    const report = await checkConsistency(tmp.pmDir);

    expect(report.missing).toContain("phase-missing-from-db");
    expect(report.orphaned).not.toContain("phase-missing-from-db");
  });
});

describe("checkConsistency — orphaned", () => {
  it("reports a DB record whose ID is absent from index.yml", async () => {
    // Insert a record directly into the DB using a zero vector (no embedder needed)
    await upsert({
      id: "phase-orphaned-in-db",
      type: "phase",
      title: "Orphaned Phase",
      text: "orphaned",
      vector: new Array(384).fill(0) as number[],
    });

    // phases/index.yml was written in the previous test and does NOT contain this ID
    const report = await checkConsistency(tmp.pmDir);

    expect(report.orphaned).toContain("phase-orphaned-in-db");
    expect(report.missing).not.toContain("phase-orphaned-in-db");
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd mcp-server
npm run test:int
```

Expected: both tests PASS. LanceDB will initialize the vector-index at `<tmpdir>/.project-memory/vector-index`.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/tests/integration/check_consistency.test.ts
git commit -m "test(mcp): integration tests for check_consistency missing + orphaned"
```

---

## Task 11: Integration — index_phase + search_memory

**Files:**
- Create: `mcp-server/tests/integration/index_phase.test.ts`

This test uses the embedder. The first run downloads `all-MiniLM-L6-v2` to `~/.cache/huggingface` (~90 MB). Subsequent runs use the cache. `testTimeout: 30000` in the integration config covers this.

- [ ] **Step 1: Create `mcp-server/tests/integration/index_phase.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexPhase } from "../../src/tools/index_phase";
import { searchMemory } from "../../src/tools/search_memory";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => tmp.cleanup());

describe("indexPhase + searchMemory roundtrip", () => {
  it("indexes a phase and retrieves it via semantic search", async () => {
    const result = await indexPhase({
      id: "phase-20260614-semantic-test",
      title: "LanceDB vector search integration",
      tags: ["mcp", "vector-db", "lancedb"],
      planText: "Add semantic search over phases using LanceDB and MiniLM embeddings.",
      implementationText: "Implemented upsert and vector search with WHERE filters.",
      commitDiffs: [],
      status: "completed",
    });

    expect(result.success).toBe(true);

    const results = await searchMemory("semantic search over phases", 5);

    const match = results.find((r) => r.id === "phase-20260614-semantic-test");
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.3);
  });

  it("returns empty array for a query with no indexed data matching", async () => {
    // This phase is already indexed above; query something unrelated
    const results = await searchMemory("cooking recipes pasta carbonara", 5);
    // Results may be non-empty (any indexed data could match at low similarity)
    // but no result should have very high similarity to cooking content
    const highSimilarity = results.filter((r) => r.similarity > 0.9);
    expect(highSimilarity).toHaveLength(0);
  });

  it("type_filter excludes non-matching types", async () => {
    // Only decision type — nothing has been indexed as a decision, so empty
    const results = await searchMemory("semantic search", 5, false, undefined, "decision");
    expect(results).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd mcp-server
npm run test:int
```

Expected: all tests PASS. If the embedding model hasn't been downloaded yet, the first run takes 30-120 seconds. Subsequent runs use cache.

- [ ] **Step 3: Commit**

```bash
git add mcp-server/tests/integration/index_phase.test.ts
git commit -m "test(mcp): integration tests for indexPhase + searchMemory roundtrip"
```

---

## Task 12: Integration — run_audit Cat 10

**Files:**
- Create: `mcp-server/tests/integration/run_audit.test.ts`

Cat 10 checks that completed phases have all 5 required files. It does NOT call git. This test creates a minimal fixture to trigger a Cat 10 finding.

- [ ] **Step 1: Create `mcp-server/tests/integration/run_audit.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;

  // Create a minimal .project-memory/ structure:
  // - phases/index.yml with one completed phase
  // - phases/phase-test-incomplete/phase.yml only (missing 4 other files)
  const phasesDir = join(tmp.pmDir, "phases");
  const phaseDir = join(phasesDir, "phase-test-incomplete");
  mkdirSync(phaseDir, { recursive: true });

  writeFileSync(
    join(phasesDir, "index.yml"),
    [
      "phases:",
      "  - id: phase-test-incomplete",
      "    title: Test Phase",
      "    status: completed",
      "    branch: null",
      "    started_at: 2026-06-01",
      "    closed_at: 2026-06-01",
      "    commits: []",
      "    issues: []",
      "    decisions: []",
      "    discussions: []",
      "    tags: []",
    ].join("\n")
  );

  // Only phase.yml exists — missing plan.md, implementation.md, review-and-fixes.md, followup.md
  writeFileSync(
    join(phaseDir, "phase.yml"),
    "id: phase-test-incomplete\nstatus: completed\n"
  );

  // Minimal config.yml (no audit_ignore)
  writeFileSync(join(tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");
});

afterAll(() => tmp.cleanup());

describe("runAudit — Cat 10 completed phase file completeness", () => {
  it("reports missing files for a completed phase as a Cat 10 escalation", async () => {
    const report = await runAudit(tmp.pmDir);

    const cat10 = report.escalations.filter((e) => e.category === 10);
    expect(cat10.length).toBeGreaterThan(0);

    const finding = cat10.find((e) =>
      e.description.includes("phase-test-incomplete")
    );
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe("medium");
  });

  it("returns an AuditReport with the correct shape", async () => {
    const report = await runAudit(tmp.pmDir);
    expect(report).toHaveProperty("auto_fixed");
    expect(report).toHaveProperty("pending_fixes");
    expect(report).toHaveProperty("escalations");
    expect(Array.isArray(report.auto_fixed)).toBe(true);
    expect(Array.isArray(report.pending_fixes)).toBe(true);
    expect(Array.isArray(report.escalations)).toBe(true);
  });
});
```

- [ ] **Step 2: Export `runAudit` from run_audit.ts**

Check that `run_audit.ts` exports `runAudit`. Search for the function:

```bash
grep -n "export.*runAudit\|export async function runAudit" mcp-server/src/tools/run_audit.ts
```

If not exported, add `export` to the function declaration. (If it is exported, skip this step.)

- [ ] **Step 3: Run integration tests**

```bash
cd mcp-server
npm run test:int
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/tests/integration/run_audit.test.ts mcp-server/src/tools/run_audit.ts
git commit -m "test(mcp): integration tests for run_audit Cat 10 (completed phase completeness)"
```

---

## Task 13: Pre-commit hook — lint-staged + git config

**Files:**
- Create: `.husky/pre-commit` (repo root)
- Modify: `mcp-server/package.json` (lint-staged config already added in Task 1, verify it's there)

No Husky npm package is needed. We configure git directly.

- [ ] **Step 1: Create `.husky/` directory and pre-commit hook**

```bash
mkdir -p .husky
```

Create `.husky/pre-commit` with this content:

```sh
#!/bin/sh
root=$(git rev-parse --show-toplevel)
cd "$root/mcp-server"
npx lint-staged --config package.json
npm run typecheck
npm run test:unit
```

- [ ] **Step 2: Make the hook executable**

On macOS/Linux:
```bash
chmod +x .husky/pre-commit
```

On Windows (Git Bash):
```bash
git update-index --chmod=+x .husky/pre-commit
```

- [ ] **Step 3: Configure git to use `.husky/` as the hooks directory**

```bash
git config core.hooksPath .husky
```

Verify:
```bash
git config core.hooksPath
```
Expected output: `.husky`

- [ ] **Step 4: Verify lint-staged config in package.json**

The `lint-staged` key should already be in `mcp-server/package.json` from Task 1:
```json
"lint-staged": {
  "mcp-server/src/**/*.ts": "eslint --fix",
  "mcp-server/tests/**/*.ts": "eslint --fix"
}
```

Note: `lint-staged` runs from the git root, so paths must be relative to the repo root.

- [ ] **Step 5: Test the hook end-to-end**

Stage any `.ts` file change:
```bash
# Make a trivial change (e.g., add+remove a blank line in src/utils.ts)
git add mcp-server/src/utils.ts
git commit -m "test: pre-commit hook smoke test"
```

Expected: pre-commit hook runs lint-staged → typecheck → unit tests, then the commit completes.

- [ ] **Step 6: Commit hook and config**

```bash
git add .husky/pre-commit
git commit -m "feat(mcp): add pre-commit hook — lint-staged + typecheck + unit tests"
```

---

## Task 14: Full test run + coverage report

- [ ] **Step 1: Run all tests**

```bash
cd mcp-server
npm test
```

Expected: all unit tests and integration tests PASS.

- [ ] **Step 2: Generate coverage report**

```bash
cd mcp-server
npm run coverage
```

Expected: coverage report printed to terminal. HTML report at `mcp-server/coverage/index.html`.

- [ ] **Step 3: Add coverage/ to .gitignore**

Add to `mcp-server/.gitignore` (create if absent):
```
coverage/
dist/
```

- [ ] **Step 4: Final commit**

```bash
git add mcp-server/.gitignore
git commit -m "chore(mcp): gitignore coverage/ output dir"
```
