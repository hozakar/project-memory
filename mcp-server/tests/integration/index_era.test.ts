import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexEra } from "../../src/tools/index_era";
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

describe("indexEra + searchMemory roundtrip", () => {
  it("indexes an era and retrieves it via semantic search", async () => {
    const result = await indexEra({
      id: "era-099-test",
      title: "Test Era — Vector Index Hardening",
      phases: [
        "phase-20260620-fake-one",
        "phase-20260621-fake-two",
        "phase-20260622-fake-three",
      ],
      dateRange: "2026-06-20 to 2026-06-22",
      narrative:
        "During this fictional era we hardened the LanceDB vector index against schema drift, added integration tests for every index_* tool, and reduced session-start cost by introducing a fast path for the audit MCP call.",
    });

    expect(result.success).toBe(true);

    const results = await searchMemory(
      "LanceDB schema drift integration test hardening",
      5,
      false,
      undefined,
      undefined,
      "era"
    );

    const match = results.find((r) => r.id === "era-099-test");
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.3);
  });
});
