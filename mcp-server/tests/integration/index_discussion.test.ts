import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexDiscussion } from "../../src/tools/index_discussion";
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

describe("indexDiscussion + searchMemory roundtrip", () => {
  it("indexes a discussion and retrieves it via semantic search", async () => {
    const result = await indexDiscussion({
      id: "DISCUSSION-2026-06-23-vector-search-architecture",
      title: "Vector search architecture choice for project memory",
      status: "concluded",
      outcome: "DECISION-2026-06-23-vector-search-architecture",
      tags: ["mcp", "lancedb", "architecture"],
      summary: "Evaluate LanceDB vs alternatives for semantic project-memory search",
      bodyText:
        "Discussed whether to use LanceDB, Qdrant, or pgvector for the project memory vector store. LanceDB selected for embedded/local use and zero ops overhead.",
    });

    expect(result.success).toBe(true);

    const results = await searchMemory(
      "LanceDB Qdrant pgvector embedded vector store",
      5,
      false,
      undefined,
      undefined,
      "discussion"
    );

    const match = results.find(
      (r) => r.id === "DISCUSSION-2026-06-23-vector-search-architecture"
    );
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.3);
  });

  it("outcome_type_filter restricts results to a specific outcome", async () => {
    await indexDiscussion({
      id: "DISCUSSION-2026-06-23-open-loop",
      title: "Unresolved discussion about widget priority",
      status: "open",
      outcome: "none",
      tags: ["widgets"],
      summary: "Open-ended widget priority chat",
      bodyText: "We discussed widget priorities but reached no conclusion.",
    });

    const results = await searchMemory(
      "widget priority",
      5,
      false,
      undefined,
      undefined,
      "discussion",
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      "decision"
    );

    const openMatch = results.find((r) => r.id === "DISCUSSION-2026-06-23-open-loop");
    expect(openMatch).toBeUndefined();
  });
});
