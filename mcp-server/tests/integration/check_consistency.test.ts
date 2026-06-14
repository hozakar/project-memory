import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { checkConsistency } from "../../src/tools/check_consistency";
import { upsert } from "../../src/db";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  // Point the DB singleton to our tmpdir BEFORE any DB call
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => tmp.cleanup());

describe("checkConsistency — missing", () => {
  it("reports a phase in index.yml that is not in the DB", async () => {
    // Write phases/index.yml with one phase ID
    const phasesDir = join(tmp.pmDir, "phases");
    mkdirSync(phasesDir, { recursive: true });
    writeFileSync(
      join(phasesDir, "index.yml"),
      "phases:\n  - id: phase-missing-from-db\n    status: completed\n"
    );

    const report = await checkConsistency(tmp.pmDir);

    expect(report.missing).toContain("phase-missing-from-db");
    expect(report.orphaned).not.toContain("phase-missing-from-db");
  });
});

describe("checkConsistency — orphaned", () => {
  it("reports a DB record whose ID is absent from index.yml", async () => {
    // Insert a record directly into the DB using a zero vector (no embedder needed)
    await upsert({
      id: "phase-orphaned-in-db",
      type: "phase",
      title: "Orphaned Phase",
      text: "orphaned",
      vector: new Array(384).fill(0) as number[],
    });

    // phases/index.yml was written in the previous test and does NOT contain this ID
    const report = await checkConsistency(tmp.pmDir);

    expect(report.orphaned).toContain("phase-orphaned-in-db");
    expect(report.missing).not.toContain("phase-orphaned-in-db");
  });
});
