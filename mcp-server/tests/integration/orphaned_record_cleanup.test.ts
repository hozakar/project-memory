import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";
import { searchMemory } from "../../src/tools/search_memory";
import { upsert } from "../../src/db";
import type { LanceRecord } from "../../src/types";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;

  const phasesDir = join(tmp.pmDir, "phases");
  mkdirSync(phasesDir, { recursive: true });
  writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
  writeFileSync(join(tmp.pmDir, "config.yml"), "audit_ignore: []\n");
});

afterAll(() => {
  try { tmp.cleanup(); } catch { /* Windows ENOTEMPTY */ }
});

describe("runAudit — Cat 13 orphaned record cleanup (branch-delete scenario)", () => {
  // Helper: create a DB record without a corresponding FS file
  async function seedOrphan(id: string, type: string, title: string, createdByEmail?: string) {
    const record: LanceRecord = {
      id,
      type,
      title,
      text: `${type} orphaned record: ${title}`,
      vector: new Array(384).fill(0) as number[],
    };
    if (createdByEmail) {
      record.createdByEmail = createdByEmail;
      record.createdByName = "Hakan Ozakar";
    }
    await upsert(record);
  }

  it("cleans ALL orphaned record types from DB", { timeout: 120000 }, async () => {
    // Seed orphaned records for every record type — simulating a feature branch
    // that was indexed, then the branch was deleted.
    // `phase` is deliberately absent: legacy phase rows are retained in the DB for
    // historical search, so checkConsistency never reports them as orphaned and Cat 13
    // never cleans them. See the dropped-concepts cases in check_consistency.test.ts.
    const orphans = [
      { id: "DECISION-orphaned-branch-del", type: "decision", title: "Deleted Decision" },
      { id: "DISCUSSION-orphaned-branch-del", type: "discussion", title: "Deleted Discussion" },
      { id: "era-orphaned-branch", type: "era", title: "Deleted Era" },
      { id: "INSTRUCTION-orphaned-branch-del", type: "instruction", title: "Deleted Instruction" },
      { id: "ASSIGNMENT-orphaned-branch-del", type: "assignment", title: "Deleted Assignment" },
      { id: "NOTE-orphaned-branch-del", type: "note", title: "Deleted Note" },
    ];

    for (const o of orphans) {
      const email = o.type === "note" ? "hozakar@gmail.com" : undefined;
      await seedOrphan(o.id, o.type, o.title, email);
    }

    // Verify all are searchable before audit (notes require type_filter)
    const beforeAll = await searchMemory({ query: "orphaned branch", topK: 20 });
    const beforeNotes = await searchMemory({ query: "orphaned branch", topK: 5, createdByEmail: "hozakar@gmail.com", typeFilter: "note" });
    const allBefore = [...beforeAll, ...beforeNotes];
    for (const o of orphans) {
      expect(allBefore.find(r => r.id === o.id), `${o.id} should exist before audit`).toBeDefined();
    }

    // Run audit — should clean ALL orphaned records
    const report = await runAudit(tmp.pmDir);

    // Every orphaned ID should have a "deleted orphaned" entry in auto_fixed
    for (const o of orphans) {
      const fix = report.auto_fixed.find(f => f.includes(o.id));
      expect(fix, `Cat 13 should delete orphaned ${o.id}`).toBeDefined();
      expect(fix!).toContain("deleted orphaned");
    }

    // Verify NONE are searchable after audit
    const afterAll = await searchMemory({ query: "orphaned branch", topK: 20 });
    const afterNotes = await searchMemory({ query: "orphaned branch", topK: 5, createdByEmail: "hozakar@gmail.com", typeFilter: "note" });
    const allAfter = [...afterAll, ...afterNotes];
    for (const o of orphans) {
      expect(allAfter.find(r => r.id === o.id), `${o.id} should NOT exist after audit`).toBeUndefined();
    }
  });

  it("never modifies filesystem for orphaned records", { timeout: 15000 }, async () => {
    // Seed an orphaned decision record — no FS file exists
    await seedOrphan("DECISION-fs-never-touched", "decision", "FS Never Touched");

    // Verify no file exists
    const decisionPath = join(tmp.pmDir, "decisions", "DECISION-fs-never-touched.md");
    expect(existsSync(decisionPath)).toBe(false);

    // Run audit
    await runAudit(tmp.pmDir);

    // File must STILL not exist — audit never creates files for orphaned records
    expect(existsSync(decisionPath)).toBe(false);
  });

  // Removed: "re-indexes records when FS files reappear (branch restore scenario)".
  // It built a phase directory and index.yml, then asserted nothing after running the
  // audit — its own closing comment conceded the missing→index path is covered by
  // note_audit_consistency.test.ts. With phases dropped it exercised a concept that no
  // longer exists, via a body that carried no coverage.
});
