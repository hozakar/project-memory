import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { reindexFile } from "../../src/tools/reindex_file";
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

describe("reindexFile integration", () => {
  it("reindexes a decision file and retrieves it via search", async () => {
    const fp = join(tmp.pmDir, "DECISION-reindex-int-test.md");
    writeFileSync(fp, [
      "---",
      "id: DECISION-2026-07-26-reindex-int",
      "title: Reindex Integration Test Decision",
      "status: active",
      "touches:",
      "  - reindex_test",
      "---",
      "# Context",
      "Decision made during reindex integration test",
      "# Decision",
      "This is the decision body for reindex testing",
    ].join("\n"));

    const result = await reindexFile(tmp.dir, "decision", fp);
    expect(result).toEqual({ success: true });

    const results = await searchMemory({ query: "reindex integration test decision", topK: 5 });
    expect(results.find((r) => r.id === "DECISION-2026-07-26-reindex-int")).toBeDefined();
  });

  it("reindexes a discussion file and retrieves it via search", async () => {
    const fp = join(tmp.pmDir, "DISCUSSION-reindex-int-test.md");
    writeFileSync(fp, [
      "---",
      "id: DISCUSSION-2026-07-26-reindex-int",
      "title: Reindex Integration Test Discussion",
      "status: concluded",
      "outcome: none",
      "tags:",
      "  - reindex_test",
      "---",
      "# Discussion",
      "Discussion body for reindex integration testing",
    ].join("\n"));

    const result = await reindexFile(tmp.dir, "discussion", fp);
    expect(result).toEqual({ success: true });

    const results = await searchMemory({ query: "reindex integration test discussion", topK: 5 });
    expect(results.find((r) => r.id === "DISCUSSION-2026-07-26-reindex-int")).toBeDefined();
  });

  it("reindexes a file with broken frontmatter and returns an error without crashing", async () => {
    const fp = join(tmp.pmDir, "BROKEN-test.md");
    writeFileSync(fp, "---\nid: broken\ntitle: [unclosed\n---\n# Context\nBody\n");

    const result = await reindexFile(tmp.dir, "decision", fp);
    expect(result.success).toBe(false);
    expect(result.error).toBe("parse_error");
    expect(result.details).toBeTruthy();
  });

  it("reindexes the same file twice — second call succeeds (upsert is idempotent)", async () => {
    const fp = join(tmp.pmDir, "DECISION-duplicate-test.md");
    writeFileSync(fp, [
      "---",
      "id: DECISION-2026-07-26-duplicate",
      "title: Duplicate Reindex Test",
      "status: active",
      "---",
      "# Context",
      "First version",
      "# Decision",
      "First decision body",
    ].join("\n"));

    const r1 = await reindexFile(tmp.dir, "decision", fp);
    expect(r1).toEqual({ success: true });

    const r2 = await reindexFile(tmp.dir, "decision", fp);
    expect(r2).toEqual({ success: true });

    const results = await searchMemory({ query: "duplicate reindex test", topK: 5 });
    expect(results.find((r) => r.id === "DECISION-2026-07-26-duplicate")).toBeDefined();
  });

  it("reindexes a note file and retrieves it with type filter", async () => {
    const fp = join(tmp.pmDir, "NOTE-reindex-int-test.md");
    writeFileSync(fp, [
      "---",
      "id: NOTE-2026-07-26-reindex-int",
      "title: Reindex Integration Test Note",
      "created_by:",
      '  name: "Test User"',
      '  email: "test@example.com"',
      "created_at: 2026-07-26",
      "updated_at: 2026-07-26",
      "---",
      "# Note",
      "Note body for reindex integration testing",
    ].join("\n"));

    const result = await reindexFile(tmp.dir, "note", fp);
    expect(result).toEqual({ success: true });

    const results = await searchMemory({ query: "reindex integration test note", topK: 5, includeCommits: false, createdByEmail: "test@example.com", typeFilter: "note" });
    expect(results.find((r) => r.id === "NOTE-2026-07-26-reindex-int")).toBeDefined();
  });
});
