import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexInstruction } from "../../src/tools/index_instruction";
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

describe("indexInstruction + searchMemory roundtrip", () => {
  it("indexes an instruction and retrieves it via semantic search", async () => {
    const result = await indexInstruction({
      id: "INSTRUCTION-2026-06-23-no-trailing-whitespace",
      prompt:
        "Strip trailing whitespace from every committed file. Pre-commit hook enforces this; CI rejects offenders.",
      state: "active",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
    });

    expect(result.success).toBe(true);

    const results = await searchMemory(
      "trailing whitespace pre-commit policy",
      5,
      false,
      "hozakar@gmail.com",
      undefined,
      "instruction"
    );

    const match = results.find(
      (r) => r.id === "INSTRUCTION-2026-06-23-no-trailing-whitespace"
    );
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.3);
    expect(match!.body).toContain("THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION");
    expect(match!.body).toContain("trailing whitespace");
  });

  it("created_by_email scopes instruction results to the calling user", async () => {
    await indexInstruction({
      id: "INSTRUCTION-2026-06-23-other-user",
      prompt: "Other user's preference about emoji in PR titles.",
      state: "active",
      createdBy: { name: "Other Dev", email: "other@example.com" },
    });

    const results = await searchMemory(
      "emoji PR titles",
      5,
      false,
      "hozakar@gmail.com",
      undefined,
      "instruction"
    );

    expect(
      results.find((r) => r.id === "INSTRUCTION-2026-06-23-other-user")
    ).toBeUndefined();
  });
});
