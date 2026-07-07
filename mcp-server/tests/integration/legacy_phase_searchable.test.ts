import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { rebuildIndex } from "../../src/tools/rebuild_index";
import { searchMemory } from "../../src/tools/search_memory";
import type { IndexEntry } from "../../src/types";

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

describe("searchMemory still returns legacy phase rows after phase removal", () => {
  it("returns a legacy phase row seeded via rebuildIndex", { timeout: 60000 }, async () => {
    const entry: IndexEntry = {
      type: "phase",
      data: {
        id: "phase-20260614-legacy-search-test",
        title: "Vector DB Migration",
        tags: ["mcp", "lancedb"],
        planText: "Migrate project memory to LanceDB vector store",
        implementationText: "Successfully implemented LanceDB with all-MiniLM-L6-v2 embeddings for semantic search",
        commitDiffs: [],
        status: "completed",
      },
    };

    const result = await rebuildIndex([entry]);
    expect(result.indexed).toBe(1);
    expect(result.failed).toBe(0);

    // Search with a query that should match the seeded phase
    const queryResults = await searchMemory("LanceDB vector store migration", 5);

    const match = queryResults.find((r) => r.id === "phase-20260614-legacy-search-test");
    expect(match).toBeDefined();
    expect(match!.type).toBe("phase");
    expect(match!.similarity).toBeGreaterThan(0.3);
    expect(match!.title).toContain("Vector DB");
  });
});
