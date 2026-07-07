import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();

  // Create a minimal .project-memory/ structure with no git history
  // (Cat 1 will return empty when no git log is available)
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

describe("runAudit — Cat 1 significant commit with no memory trace", () => {
  it("flags commits that touch no memory files (current-state.md, DECISION, DISCUSSION, NOTE)", async () => {
    // Set up a real git repo inside the tmp dir so Cat 1 can run
    const projectRoot = tmp.dir; // parent of .project-memory/

    execSync("git init", { cwd: projectRoot, stdio: "pipe" });
    execSync("git config user.email test@test.com", { cwd: projectRoot, stdio: "pipe" });
    execSync("git config user.name Test", { cwd: projectRoot, stdio: "pipe" });

    // Create a commit that touches no memory files (code-only change)
    mkdirSync(join(projectRoot, "src"), { recursive: true });
    writeFileSync(join(projectRoot, "src", "index.ts"), "console.log('hello');\n");
    execSync("git add -A", { cwd: projectRoot, stdio: "pipe" });
    execSync('git commit -m "feat: add hello world"', { cwd: projectRoot, stdio: "pipe" });

    // Verify git log works (the run_audit helper uses single-quoted format strings
    // which may not work on Windows via execSync — verify manually)
    const gitLog = execSync("git log --oneline -1", { cwd: projectRoot, encoding: "utf-8" }).trim();
    expect(gitLog).toMatch(/feat: add hello world/);

    const report = await runAudit(tmp.pmDir);

    // Cat 1 should flag this commit as having no memory trace
    const cat1Findings = report.escalations.filter((e) => e.category === 1);
    expect(cat1Findings.length).toBeGreaterThan(0);
    expect(cat1Findings[0].severity).toBe("medium");
    expect(cat1Findings[0].description).toContain("no memory trace");
    expect(cat1Findings[0].data).toHaveProperty("hash");
    expect(cat1Findings[0].data).toHaveProperty("subject", "feat: add hello world");
  });
});
