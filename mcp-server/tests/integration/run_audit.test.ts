import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();

  // Create a minimal .project-memory/ structure with no git history
  writeFileSync(join(tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");

  // Create an empty phases/index.yml (phases dir required by parsing helpers)
  const phasesDir = join(tmp.pmDir, "phases");
  mkdirSync(phasesDir, { recursive: true });
  writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
});

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // Ignore cleanup errors on Windows (ENOTEMPTY)
  }
});

describe("runAudit — basic structure", () => {
  it("returns an AuditReport with the correct shape", async () => {
    const report = await runAudit(tmp.pmDir);
    expect(report).toHaveProperty("auto_fixed");
    expect(report).toHaveProperty("pending_fixes");
    expect(report).toHaveProperty("escalations");
    expect(Array.isArray(report.auto_fixed)).toBe(true);
    expect(Array.isArray(report.pending_fixes)).toBe(true);
    expect(Array.isArray(report.escalations)).toBe(true);
    // No cat4_gap_count — Cat 4 was removed in phase-removal
    expect(report).not.toHaveProperty("cat4_gap_count");
  });

  it("returns empty auto_fixed, pending_fixes, escalations for an empty project memory with no git history", async () => {
    const report = await runAudit(tmp.pmDir);
    expect(report.auto_fixed).toHaveLength(0);
    expect(report.pending_fixes).toHaveLength(0);
    expect(report.escalations).toHaveLength(0);
  });
});

describe("runAudit — minimal profile", () => {
  it("returns empty report for minimal profile", async () => {
    const report = await runAudit(tmp.pmDir, "minimal");
    expect(report).toEqual({
      auto_fixed: [],
      pending_fixes: [],
      escalations: [],
    });
  });
});

describe("runAudit — full/lite profile normalization", () => {
  it("returns standard-profile report for 'full' profile", async () => {
    const std = await runAudit(tmp.pmDir, "standard");
    const full = await runAudit(tmp.pmDir, "full");
    // Both should behave identically (normalize full→standard)
    expect(full).toEqual(std);
  });

  it("returns standard-profile report for 'lite' profile", async () => {
    const std = await runAudit(tmp.pmDir, "standard");
    const lite = await runAudit(tmp.pmDir, "lite");
    // Both should behave identically (normalize lite→standard)
    expect(lite).toEqual(std);
  });
});
