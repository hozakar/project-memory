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

afterAll(() => { try { tmp.cleanup(); } catch { /* LanceDB holds file handles open on Windows */ } });

describe("checkConsistency — missing", () => {
  it("reports a decision file that is not in the DB", async () => {
    const decisionsDir = join(tmp.pmDir, "decisions");
    mkdirSync(decisionsDir, { recursive: true });
    writeFileSync(
      join(decisionsDir, "DECISION-2026-07-29-missing-from-db.md"),
      "---\nid: DECISION-2026-07-29-missing-from-db\nstatus: active\n---\n\n# Context\n"
    );

    const report = await checkConsistency(tmp.pmDir);

    expect(report.missing).toContain("DECISION-2026-07-29-missing-from-db");
    expect(report.orphaned).not.toContain("DECISION-2026-07-29-missing-from-db");
  });
});

describe("checkConsistency — orphaned", () => {
  it("reports a DB record whose file is absent from the filesystem", async () => {
    // Insert a record directly into the DB using a zero vector (no embedder needed)
    await upsert({
      id: "DECISION-2026-07-29-orphaned-in-db",
      type: "decision",
      title: "Orphaned Decision",
      text: "orphaned",
      vector: new Array(384).fill(0) as number[],
    });

    const report = await checkConsistency(tmp.pmDir);

    expect(report.orphaned).toContain("DECISION-2026-07-29-orphaned-in-db");
    expect(report.missing).not.toContain("DECISION-2026-07-29-orphaned-in-db");
  });
});

describe("checkConsistency — dropped concepts", () => {
  it("ignores phases on both sides", async () => {
    // A phase listed in index.yml but absent from the DB must NOT be reported as
    // missing: no index_phase tool exists, so the finding would be unactionable.
    const phasesDir = join(tmp.pmDir, "phases");
    mkdirSync(phasesDir, { recursive: true });
    writeFileSync(
      join(phasesDir, "index.yml"),
      "phases:\n  - id: phase-missing-from-db\n    status: completed\n"
    );

    // A legacy phase row in the DB must NOT be reported as orphaned: those rows are
    // deliberately retained for historical search and have no file counterpart.
    await upsert({
      id: "phase-legacy-in-db",
      type: "phase",
      title: "Legacy Phase",
      text: "legacy",
      vector: new Array(384).fill(0) as number[],
    });

    const report = await checkConsistency(tmp.pmDir);

    expect(report.missing).not.toContain("phase-missing-from-db");
    expect(report.orphaned).not.toContain("phase-legacy-in-db");
  });

  it("does not report assignment files as missing, but does surface stale DB rows as orphaned", async () => {
    // Assignment files are no longer scanned — the feature is removed, so a file left
    // on disk must not generate a missing entry pointing at a tool that no longer exists.
    const assignmentsDir = join(tmp.pmDir, "assignments");
    mkdirSync(assignmentsDir, { recursive: true });
    writeFileSync(
      join(assignmentsDir, "ASSIGNMENT-2026-07-29-leftover.md"),
      "---\nid: ASSIGNMENT-2026-07-29-leftover\nstatus: pending\n---\n"
    );

    // Stale assignment rows from before the removal must still surface as orphaned so
    // Cat 13 can purge them; otherwise they answer broad searches forever.
    await upsert({
      id: "ASSIGNMENT-2026-07-29-stale-in-db",
      type: "assignment",
      title: "Stale Assignment",
      text: "stale",
      vector: new Array(384).fill(0) as number[],
    });

    const report = await checkConsistency(tmp.pmDir);

    expect(report.missing).not.toContain("ASSIGNMENT-2026-07-29-leftover");
    expect(report.orphaned).toContain("ASSIGNMENT-2026-07-29-stale-in-db");
  });
});
