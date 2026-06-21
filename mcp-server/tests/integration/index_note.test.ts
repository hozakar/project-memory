import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexNote } from "../../src/tools/index_note";
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

describe("indexNote + searchMemory roundtrip", () => {
  it("indexes a note and retrieves it via semantic search", async () => {
    const result = await indexNote({
      id: "NOTE-2026-06-21-test",
      title: "Personal Reminder",
      tags: ["personal", "reminder"],
      body: "Buy groceries and finish the MCP server integration.",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      createdAt: "2026-06-21",
      updatedAt: "2026-06-21",
    });

    expect(result.success).toBe(true);

    const results = await searchMemory(
      "groceries and MCP server",
      5,
      undefined,
      "hozakar@gmail.com",
      undefined,
      "note",
    );

    const match = results.find((r) => r.id === "NOTE-2026-06-21-test");
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.3);
  });

  it("type_filter note without matching email returns empty", async () => {
    await indexNote({
      id: "NOTE-2026-06-21-private",
      title: "Secret Plans",
      tags: ["private"],
      body: "World domination roadmap. Highly classified.",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      createdAt: "2026-06-21",
      updatedAt: "2026-06-21",
    });

    const results = await searchMemory(
      "world domination",
      5,
      undefined,
      "other@example.com",
      undefined,
      "note",
    );

    expect(results).toHaveLength(0);
  });

  it("notes are excluded from broad search without type_filter", async () => {
    await indexNote({
      id: "NOTE-2026-06-21-private-note",
      title: "Private Note",
      tags: [],
      body: "This note should NOT appear in unfiltered searches. Notes are private.",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      createdAt: "2026-06-21",
      updatedAt: "2026-06-21",
    });

    // Without type_filter, notes are excluded at the database level.
    // They are user-scoped private records — only returned via type_filter="note".
    const results = await searchMemory("private note unfiltered", 5);

    const match = results.find((r) => r.id === "NOTE-2026-06-21-private-note");
    expect(match).toBeUndefined();
  });
});
