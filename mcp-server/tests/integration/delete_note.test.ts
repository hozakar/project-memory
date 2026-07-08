import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { deleteNote } from "../../src/tools/delete_note";
import { rebuildIndex } from "../../src/tools/rebuild_index";
import type { IndexEntry } from "../../src/types";

let tmp: TmpDir;

beforeAll(async () => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;

  // Create notes directory with a sample note file
  const notesDir = join(tmp.pmDir, "notes");
  mkdirSync(notesDir, { recursive: true });

  writeFileSync(
    join(notesDir, "NOTE-test-001.md"),
    `---
id: NOTE-test-001
title: Test Note
created_by:
  name: Alice
  email: alice@example.com
created_at: 2026-07-08
updated_at: 2026-07-08
---
This is a test note.
`
  );
}, 30000);

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // LanceDB may hold file handles open on Windows; cleanup is best-effort
  }
});

describe("deleteNote — ownership check", () => {
  it("rejects deletion when callerEmail does not match note owner", async () => {
    // Seed the LanceDB with the note record
    const entries: IndexEntry[] = [
      {
        type: "note",
        data: {
          id: "NOTE-test-001",
          title: "Test Note",
          createdBy: { name: "Alice", email: "alice@example.com" },
          body: "This is a test note.",
          createdAt: "2026-07-08",
          updatedAt: "2026-07-08",
        },
      },
    ];
    await rebuildIndex(entries);

    const result = await deleteNote("NOTE-test-001", "bob@example.com");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Ownership mismatch");
    expect(result.error).toContain("bob@example.com");
    expect(result.error).toContain("alice@example.com");
  }, 60000);

  it("allows deletion when callerEmail matches note owner", async () => {
    // Re-seed the LanceDB (previous test deleted the record)
    const entries: IndexEntry[] = [
      {
        type: "note",
        data: {
          id: "NOTE-test-001",
          title: "Test Note",
          createdBy: { name: "Alice", email: "alice@example.com" },
          body: "This is a test note.",
          createdAt: "2026-07-08",
          updatedAt: "2026-07-08",
        },
      },
    ];
    await rebuildIndex(entries);

    const result = await deleteNote("NOTE-test-001", "alice@example.com");
    expect(result.success).toBe(true);
  }, 60000);
});
