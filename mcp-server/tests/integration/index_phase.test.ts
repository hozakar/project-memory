import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexPhase } from "../../src/tools/index_phase";
import { searchMemory } from "../../src/tools/search_memory";

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
    const results = await searchMemory("cooking recipes pasta carbonara", 5);
    const highSimilarity = results.filter((r) => r.similarity > 0.9);
    expect(highSimilarity).toHaveLength(0);
  });

  it("type_filter excludes non-matching types", async () => {
    const results = await searchMemory("semantic search", 5, false, undefined, "decision");
    expect(results).toHaveLength(0);
  });
});
