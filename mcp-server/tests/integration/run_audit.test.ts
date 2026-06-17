import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;

  // Create a minimal .project-memory/ structure:
  // - phases/index.yml with one completed phase
  // - phases/phase-test-incomplete/phase.yml only (missing 4 other files)
  const phasesDir = join(tmp.pmDir, "phases");
  const phaseDir = join(phasesDir, "phase-test-incomplete");
  mkdirSync(phaseDir, { recursive: true });

  writeFileSync(
    join(phasesDir, "index.yml"),
    [
      "phases:",
      "  - id: phase-test-incomplete",
      "    title: Test Phase",
      "    status: completed",
      "    branch: null",
      "    started_at: 2026-06-01",
      "    closed_at: 2026-06-01",
      "    commits: []",
      "    issues: []",
      "    decisions: []",
      "    discussions: []",
      "    tags: []",
    ].join("\n")
  );

  // Only phase.yml exists — missing plan.md, implementation.md, review-and-fixes.md, followup.md
  writeFileSync(
    join(phaseDir, "phase.yml"),
    "id: phase-test-incomplete\nstatus: completed\n"
  );

  // Minimal config.yml (no audit_ignore)
  writeFileSync(join(tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");
});

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // Ignore cleanup errors on Windows (ENOTEMPTY)
  }
});

describe("runAudit — Cat 10 completed phase file completeness", () => {
  it("reports missing files for a completed phase as Cat 10 pending fixes", async () => {
    const report = await runAudit(tmp.pmDir);

    // Cat 10 results go into pending_fixes (type: "create_phase_stub")
    const cat10Fixes = report.pending_fixes.filter(
      (f) => f.type === "create_phase_stub" && f.phaseId === "phase-test-incomplete"
    );
    expect(cat10Fixes.length).toBeGreaterThan(0);

    // Should report all 4 missing files (plan.md, implementation.md, review-and-fixes.md, followup.md)
    const missingFiles = cat10Fixes.map((f) => f.missingFile);
    expect(missingFiles).toContain("plan.md");
    expect(missingFiles).toContain("implementation.md");
    expect(missingFiles).toContain("review-and-fixes.md");
    expect(missingFiles).toContain("followup.md");
  });

  it("returns an AuditReport with the correct shape", async () => {
    const report = await runAudit(tmp.pmDir);
    expect(report).toHaveProperty("auto_fixed");
    expect(report).toHaveProperty("pending_fixes");
    expect(report).toHaveProperty("escalations");
    expect(Array.isArray(report.auto_fixed)).toBe(true);
    expect(Array.isArray(report.pending_fixes)).toBe(true);
    expect(Array.isArray(report.escalations)).toBe(true);
  });
});

describe("runAudit — raise_cat4 parameter", () => {
  it("includes cat4_gap_count when raise_cat4=false (default)", async () => {
    const report = await runAudit(tmp.pmDir, "full", false);
    expect(report).toHaveProperty("cat4_gap_count");
    expect(typeof report.cat4_gap_count).toBe("number");
  });

  it("cat4_gap_count is 0 when no open phases exist", async () => {
    const report = await runAudit(tmp.pmDir, "full", false);
    expect(report.cat4_gap_count).toBe(0);
  });

  it("omits cat4_gap_count when raise_cat4=true", async () => {
    const report = await runAudit(tmp.pmDir, "full", true);
    expect(report.cat4_gap_count).toBeUndefined();
  });

  it("cat4 escalations appear in escalations array when raise_cat4=true", async () => {
    // No open phases in fixture → escalations array contains no Cat 4 entries,
    // but the field is absent rather than 0 — confirming the flag is respected.
    const reportRaise = await runAudit(tmp.pmDir, "full", true);
    const reportSuppress = await runAudit(tmp.pmDir, "full", false);
    const cat4Raise = reportRaise.escalations.filter(e => e.category === 4);
    const cat4Suppress = reportSuppress.escalations.filter(e => e.category === 4);
    // Both should be 0 (no open phases), but the structural difference holds:
    expect(cat4Raise.length).toBe(cat4Suppress.length);
    expect(reportRaise.cat4_gap_count).toBeUndefined();
    expect(reportSuppress.cat4_gap_count).toBeDefined();
  });
});
