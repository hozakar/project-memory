import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexInstruction } from "../../src/tools/index_instruction";
import { reindexFile } from "../../src/tools/reindex_file";
import { rebuildIndex } from "../../src/tools/rebuild_index";
import { searchMemory } from "../../src/tools/search_memory";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => {
  try { tmp.cleanup(); } catch { /* LanceDB holds handles open on Windows */ }
});

const PROMPT = "Never commit directly to main; always open a branch first.";

function writeInstruction(dir: string, id: string, state: string): string {
  mkdirSync(dir, { recursive: true });
  const fp = join(dir, `${id}.md`);
  writeFileSync(fp, [
    "---",
    `id: ${id}`,
    `state: ${state}`,
    "created_by:",
    '  name: "Hakan Ozakar"',
    '  email: "hozakar@gmail.com"',
    "---",
    "",
    "# Prompt",
    "",
    PROMPT,
    "",
  ].join("\n"));
  return fp;
}

describe("instruction injection carries state and a clean body", () => {
  it("injects only the prompt, not the id/state/author search metadata", async () => {
    await indexInstruction({
      id: "INSTRUCTION-2026-07-29-clean-body",
      prompt: PROMPT,
      state: "active",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
    });

    const [hit] = await searchMemory({
      query: "branch before committing",
      topK: 5,
      typeFilter: "instruction",
      createdByEmail: "hozakar@gmail.com",
    });

    expect(hit.body).toBeDefined();
    expect(hit.body).toContain(PROMPT);
    // The embedding blob carries id, state and author lines; injection must not.
    expect(hit.body).not.toContain("INSTRUCTION-2026-07-29-clean-body");
    expect(hit.body).not.toContain("active");
    expect(hit.body).not.toContain("hozakar@gmail.com");
  });

  it("does not return dropped instructions at all", async () => {
    await indexInstruction({
      id: "INSTRUCTION-2026-07-29-dropped-one",
      prompt: "Obsolete rule that must never bind a session again.",
      state: "dropped",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
    });

    const results = await searchMemory({
      query: "obsolete rule",
      topK: 10,
      typeFilter: "instruction",
      createdByEmail: "hozakar@gmail.com",
    });

    expect(results.find(r => r.id === "INSTRUCTION-2026-07-29-dropped-one")).toBeUndefined();
  });

  it("reindexFile preserves state — a reindexed dropped instruction stays dropped", async () => {
    const id = "INSTRUCTION-2026-07-29-reindex-dropped";
    const fp = writeInstruction(join(tmp.pmDir, "instructions"), id, "dropped");

    const res = await reindexFile(tmp.pmDir, "instruction", fp);
    expect(res).toEqual({ success: true });

    const results = await searchMemory({
      query: "branch before committing",
      topK: 10,
      typeFilter: "instruction",
      createdByEmail: "hozakar@gmail.com",
    });
    expect(results.find(r => r.id === id)).toBeUndefined();
  });

  it("a full fs rebuild preserves state and body", { timeout: 120000 }, async () => {
    const dir = join(tmp.pmDir, "instructions");
    writeInstruction(dir, "INSTRUCTION-2026-07-29-rebuild-active", "active");
    writeInstruction(dir, "INSTRUCTION-2026-07-29-rebuild-dropped", "dropped");

    await rebuildIndex({ mode: "fs", projectMemoryDir: tmp.pmDir });

    const results = await searchMemory({
      query: "branch before committing",
      topK: 20,
      typeFilter: "instruction",
      createdByEmail: "hozakar@gmail.com",
    });

    const active = results.find(r => r.id === "INSTRUCTION-2026-07-29-rebuild-active");
    expect(active, "active instruction survives a rebuild").toBeDefined();
    expect(active!.body).toContain(PROMPT);
    expect(active!.body).not.toContain("INSTRUCTION-2026-07-29-rebuild-active");

    expect(
      results.find(r => r.id === "INSTRUCTION-2026-07-29-rebuild-dropped"),
      "dropped instruction must not come back from a rebuild",
    ).toBeUndefined();
  });
});
