import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, unlinkSync, existsSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";
import { searchMemory } from "../../src/tools/search_memory";
import { indexNote } from "../../src/tools/index_note";
import { upsert } from "../../src/db";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;

  // Minimal .project-memory structure for run_audit to succeed
  const phasesDir = join(tmp.pmDir, "phases");
  mkdirSync(phasesDir, { recursive: true });
  writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
  writeFileSync(join(tmp.pmDir, "config.yml"), "audit_ignore: []\n");
});

afterAll(() => {
  try { tmp.cleanup(); } catch { /* Windows ENOTEMPTY */ }
});

describe("runAudit — Cat 13 note consistency", () => {
  it("auto-indexes a missing note (file exists, not in DB)", { timeout: 30000 }, async () => {
    // Create a note file on disk but DON'T index it
    const notesDir = join(tmp.pmDir, "notes");
    mkdirSync(notesDir, { recursive: true });
    writeFileSync(
      join(notesDir, "NOTE-2026-06-21-audit-missing.md"),
      [
        "---",
        "id: NOTE-2026-06-21-audit-missing",
        'title: "Audit Missing Test Note"',
        "tags: [test, audit, missing]",
        "created_by:",
        "  name: Hakan Ozakar",
        "  email: hozakar@gmail.com",
        "created_at: 2026-06-21",
        "updated_at: 2026-06-21",
        "---",
        "",
        "# Test Note",
        "This note exists on disk but was never indexed.",
      ].join("\n")
    );

    // Verify note is NOT searchable before audit
    const before = await searchMemory("audit missing test", 5, undefined, "hozakar@gmail.com", undefined, "note");
    expect(before.find((r) => r.id === "NOTE-2026-06-21-audit-missing")).toBeUndefined();

    // Run audit — should auto-index the missing note
    const report = await runAudit(tmp.pmDir);

    // Check auto_fixed contains our Cat 13 entry
    const noteFix = report.auto_fixed.find((f) => f.includes("NOTE-2026-06-21-audit-missing"));
    expect(noteFix).toBeDefined();
    expect(noteFix!).toContain("indexed missing note");

    // Verify note is NOW searchable after audit
    const after = await searchMemory("audit missing test", 5, undefined, "hozakar@gmail.com", undefined, "note");
    const match = after.find((r) => r.id === "NOTE-2026-06-21-audit-missing");
    expect(match).toBeDefined();
  });

  it("auto-deletes an orphaned note (DB record exists, file gone)", { timeout: 30000 }, async () => {
    // Index a note directly into DB, but DON'T create a file
    await indexNote({
      id: "NOTE-2026-06-21-audit-orphan",
      title: "Orphan Test Note",
      tags: ["test", "audit", "orphan"],
      body: "This note exists only in DB — the file was deleted.",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      createdAt: "2026-06-21",
      updatedAt: "2026-06-21",
    });

    // Delete the file if it was created (index_note doesn't create files, but just in case)
    const orphanPath = join(tmp.pmDir, "notes", "NOTE-2026-06-21-audit-orphan.md");
    if (existsSync(orphanPath)) unlinkSync(orphanPath);

    // Verify note IS searchable before audit (DB has it)
    const before = await searchMemory("orphan test", 5, undefined, "hozakar@gmail.com", undefined, "note");
    expect(before.find((r) => r.id === "NOTE-2026-06-21-audit-orphan")).toBeDefined();

    // Run audit — should auto-delete the orphaned DB record
    const report = await runAudit(tmp.pmDir);

    // Check auto_fixed contains our Cat 13 entry
    const noteFix = report.auto_fixed.find((f) => f.includes("NOTE-2026-06-21-audit-orphan"));
    expect(noteFix).toBeDefined();
    expect(noteFix!).toContain("deleted orphaned note");

    // Verify note is NO LONGER searchable after audit
    const after = await searchMemory("orphan test", 5, undefined, "hozakar@gmail.com", undefined, "note");
    expect(after.find((r) => r.id === "NOTE-2026-06-21-audit-orphan")).toBeUndefined();
  });

  it("does NOT modify filesystem for orphaned notes (FS source of truth)", { timeout: 30000 }, async () => {
    // Index a note, then check that the file is NEVER created by audit
    await indexNote({
      id: "NOTE-2026-06-21-audit-no-fs-write",
      title: "No FS Write Test",
      tags: [],
      body: "Audit should never create files.",
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      createdAt: "2026-06-21",
      updatedAt: "2026-06-21",
    });

    // Delete the file if it exists
    const notePath = join(tmp.pmDir, "notes", "NOTE-2026-06-21-audit-no-fs-write.md");
    if (existsSync(notePath)) unlinkSync(notePath);

    // Verify file does NOT exist
    expect(existsSync(notePath)).toBe(false);

    // Run audit
    await runAudit(tmp.pmDir);

    // File must STILL not exist — FS source of truth principle
    expect(existsSync(notePath)).toBe(false);
  });
});
