import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { rebuildIndex } from "../../src/tools/rebuild_index";
import { findSimilarCommit } from "../../src/tools/find_similar_commit";
import type { IndexEntry, DecisionIndexData } from "../../src/types";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // LanceDB may hold file handles open on Windows; cleanup is best-effort
  }
});

describe("commit vector survival after rebuild with zero phase entries", () => {
  it("generates commit records from non-phase entries with commitDiffs", { timeout: 60000 }, async () => {
    // Seed the index with ONLY a non-phase entry (decision) that has commitDiffs
    // attached at runtime — replicating the scenario where commit references
    // come from non-phase frontmatter or other sources.
    const entry: IndexEntry = {
      type: "decision",
      data: {
        id: "DECISION-test-commit-survival",
        title: "Vector DB Migration Strategy",
        status: "active",
        primaryScope: "constraint",
        context:
          "We decided to adopt LanceDB as our vector store for semantic search over project memory.",
        decisionBody:
          "Use LanceDB with all-MiniLM-L6-v2 embeddings. Migrate from the ad-hoc SQLite approach.",
        touches: ["vector_db", "lancedb", "embeddings"],
      },
    };

    // At runtime, non-phase entries may carry commit diffs from process-generated
    // data or future indexers. The rebuildIndex function reads commitDiffs from
    // any entry type via duck-typing, not just phase entries.
    (entry.data as DecisionIndexData & { commitDiffs: { hash: string; message: string; files: string[]; diffSnippet: string }[] }).commitDiffs = [
      {
        hash: "abc123def456abc123def456abc123def456abc1",
        message: "Implement vector DB with LanceDB for semantic search",
        files: ["src/db.ts", "src/embedder.ts"],
        diffSnippet:
          "index abc..def 100644\n--- a/src/db.ts\n+++ b/src/db.ts\n@@ -1,5 +1,10 @@\n+import { embed } from './embedder';\n+export function search() { ... }",
      },
    ];

    // This is the key assertion: rebuildIndex must generate commit records from
    // non-phase entries. Before the fix, commit generation was inside
    // `if (entry.type === "phase")`, so zero phase entries → zero commit records.
    const result = await rebuildIndex([entry]);

    // Main decision record + 1 commit record = 2 indexed
    expect(result.indexed).toBe(2);
    expect(result.failed).toBe(0);

    // Now verify findSimilarCommit can find the generated commit record
    const commitResults = await findSimilarCommit("LanceDB vector DB semantic search", 5);

    expect(commitResults.length).toBeGreaterThan(0);
    const match = commitResults.find(
      (c) => c.hash === "abc123def456abc123def456abc123def456abc1"
    );
    expect(match).toBeDefined();
    expect(match!.message).toContain("LanceDB");
    expect(match!.similarity).toBeGreaterThan(0.3);
  });
});
