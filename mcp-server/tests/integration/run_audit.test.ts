import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();

  // Create a minimal .project-memory/ structure with no git history
  fs.writeFileSync(join(tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");

  // Create an empty phases/index.yml (phases dir required by parsing helpers)
  const phasesDir = join(tmp.pmDir, "phases");
  fs.mkdirSync(phasesDir, { recursive: true });
  fs.writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
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
    expect(Array.isArray(report.auto_fixed)).toBe(true);
    expect(Array.isArray(report.pending_fixes)).toBe(true);
    // No cat4_gap_count — Cat 4 was removed in phase-removal
    expect(report).not.toHaveProperty("cat4_gap_count");
  });

  it("returns empty auto_fixed and pending_fixes for an empty project memory with no git history", async () => {
    const report = await runAudit(tmp.pmDir);
    expect(report.auto_fixed).toHaveLength(0);
    expect(report.pending_fixes).toHaveLength(0);
  });
});

describe("runAudit — minimal profile", () => {
  it("returns empty report for minimal profile", async () => {
    const report = await runAudit(tmp.pmDir, "minimal");
    expect(report).toEqual({
      auto_fixed: [],
      pending_fixes: [],
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

describe("runAudit — Cat 9: discussion index drift", () => {
  function dDir(): string { return join(tmp.pmDir, "discussions"); }

  it("produces pending_fixes (not escalations) for missing-row", async () => {
    fs.mkdirSync(dDir(), { recursive: true });
    fs.writeFileSync(join(dDir(), "DISCUSSION-2026-07-08-test.md"), [
      "---",
      "id: DISCUSSION-2026-07-08-test",
      "status: open",
      "---",
      "# Test",
    ].join("\n"));
    fs.writeFileSync(join(dDir(), "index.md"), "| Date | ID | Status | Outcome | Tags | Summary |\n|---|---|---|---|---|---|\n");

    const report = await runAudit(tmp.pmDir);
    const rowFix = report.pending_fixes.find(f => f.type === "add_discussion_index_row");
    expect(rowFix).toBeDefined();
    expect(rowFix!.discussionId).toBe("DISCUSSION-2026-07-08-test");

    // Cleanup
    try { fs.rmSync(join(dDir(), "DISCUSSION-2026-07-08-test.md")); } catch {}
    try { fs.rmSync(join(dDir(), "index.md")); } catch {}
  });

  it("produces pending_fixes (not escalations) for status-mismatch", async () => {
    fs.mkdirSync(dDir(), { recursive: true });
    fs.writeFileSync(join(dDir(), "DISCUSSION-2026-07-08-abc.md"), [
      "---",
      "id: DISCUSSION-2026-07-08-abc",
      "status: concluded",
      "---",
      "# Test",
    ].join("\n"));
    // Index shows it as open, but file says concluded
    fs.writeFileSync(join(dDir(), "index.md"), "| Date | ID | Status | Outcome | Tags | Summary |\n|---|---|---|---|---|---|\n| 2026-07-08 | DISCUSSION-2026-07-08-abc | open | none | - | t |\n");

    const report = await runAudit(tmp.pmDir);
    const statusFix = report.pending_fixes.find(f => f.type === "fix_discussion_index_status");
    expect(statusFix).toBeDefined();
    expect(statusFix!.discussionId).toBe("DISCUSSION-2026-07-08-abc");
    expect(statusFix!.correctStatus).toBe("concluded");

    // Cleanup
    try { fs.rmSync(join(dDir(), "DISCUSSION-2026-07-08-abc.md")); } catch {}
    try { fs.rmSync(join(dDir(), "index.md")); } catch {}
  });

  it("auto-removes orphan row (file missing, index has it)", async () => {
    fs.mkdirSync(dDir(), { recursive: true });
    // Write index with an orphan row pointing to a file that doesn't exist
    fs.writeFileSync(join(dDir(), "index.md"), [
      "| Date | ID | Status | Outcome | Tags | Summary |",
      "|---|---|---|---|---|---|",
      "| 2026-07-08 | DISCUSSION-2026-07-08-ghost | open | none | - | orphan |",
    ].join("\n"));

    const report = await runAudit(tmp.pmDir);
    const removed = report.auto_fixed.find(f => f.includes("orphan discussion index row") && f.includes("DISCUSSION-2026-07-08-ghost"));
    expect(removed).toBeDefined();
    // The row must be gone from the file
    const indexContent = fs.readFileSync(join(dDir(), "index.md"), "utf-8");
    expect(indexContent).not.toContain("DISCUSSION-2026-07-08-ghost");

    // Cleanup
    try { fs.rmSync(join(dDir(), "index.md")); } catch {}
  });
});

describe("runAudit — Cat 14: assignment integrity auto-fix", () => {
  function aDir(): string { return join(tmp.pmDir, "assignments"); }

  it("14a: writes target_orphaned_at and is idempotent", async () => {
    fs.mkdirSync(aDir(), { recursive: true });
    const filePath = join(aDir(), "ASSIGNMENT-2026-07-08-test-orphan.md");
    fs.writeFileSync(filePath, [
      "---",
      "id: ASSIGNMENT-2026-07-08-test-orphan",
      "status: pending",
      "type: direct",
      "target_id: ISSUE-2026-07-08-nonexistent",
      "assigned_at: 2026-07-08",
      "---",
    ].join("\n"));

    // First run: should write target_orphaned_at
    const report1 = await runAudit(tmp.pmDir);
    const found1 = report1.auto_fixed.find(f => f.includes("ASSIGNMENT-2026-07-08-test-orphan") && f.includes("orphaned"));
    expect(found1).toBeDefined();

    const content1 = fs.readFileSync(filePath, "utf-8");
    expect(content1).toContain("target_orphaned_at:");

    // Second run: idempotent — should NOT write a second message
    const report2 = await runAudit(tmp.pmDir);
    const found2 = report2.auto_fixed.find(f => f.includes("ASSIGNMENT-2026-07-08-test-orphan") && f.includes("orphaned"));
    expect(found2).toBeUndefined();
    const content2 = fs.readFileSync(filePath, "utf-8");
    expect(content2).toBe(content1); // exactly same content


    try { fs.rmSync(filePath); } catch {}
  });

  it("14b: writes reminded:true once and is idempotent", async () => {
    // Need an assignment older than 30 days
    const oldDate = "2026-05-01"; // > 30 days from now (2026-07-08)
    const filePath = join(aDir(), "ASSIGNMENT-2026-05-01-stale-test.md");
    fs.writeFileSync(filePath, [
      "---",
      "id: ASSIGNMENT-2026-05-01-stale-test",
      "status: pending",
      "type: direct",
      "target_id: ISSUE-2026-05-01-something",
      "assigned_at: " + oldDate,
      "---",
    ].join("\n"));

    const report1 = await runAudit(tmp.pmDir);
    const found1 = report1.auto_fixed.find(f => f.includes("ASSIGNMENT-2026-05-01-stale-test") && f.includes("reminded"));
    expect(found1).toBeDefined();

    const content1 = fs.readFileSync(filePath, "utf-8");
    expect(content1).toContain("reminded: true");

    // Second run: idempotent
    const report2 = await runAudit(tmp.pmDir);
    const found2 = report2.auto_fixed.find(f => f.includes("ASSIGNMENT-2026-05-01-stale-test") && f.includes("reminded"));
    expect(found2).toBeUndefined();
    const content2 = fs.readFileSync(filePath, "utf-8");
    expect(content2).toBe(content1);

    try { fs.rmSync(filePath); } catch {}
  });

  it("14b: does NOT write reminded for assignments younger than 30 days", async () => {
    const filePath = join(aDir(), "ASSIGNMENT-2026-07-01-fresh-test.md");
    fs.writeFileSync(filePath, [
      "---",
      "id: ASSIGNMENT-2026-07-01-fresh-test",
      "status: pending",
      "type: direct",
      "target_id: ISSUE-2026-07-01-fresh",
      "assigned_at: 2026-07-01",
      "---",
    ].join("\n"));

    const report = await runAudit(tmp.pmDir);
    // 14a may fire (target doesn't exist), but 14b must NOT fire (age ≤ 30d)
    const reminded = report.auto_fixed.find(f => f.includes("ASSIGNMENT-2026-07-01-fresh-test") && f.includes("reminded"));
    expect(reminded).toBeUndefined();

    try { fs.rmSync(filePath); } catch {}
  });

  it("14c: writes completed_without_evidence_at and is idempotent", async () => {
    const filePath = join(aDir(), "ASSIGNMENT-2026-07-08-no-evidence.md");
    fs.writeFileSync(filePath, [
      "---",
      "id: ASSIGNMENT-2026-07-08-no-evidence",
      "status: completed",
      "type: direct",
      "target_id: ISSUE-2026-07-08-done",
      "assigned_at: 2026-07-08",
      "completed_at: 2026-07-08",
      "---",
    ].join("\n"));

    const report1 = await runAudit(tmp.pmDir);
    const found1 = report1.auto_fixed.find(f => f.includes("ASSIGNMENT-2026-07-08-no-evidence") && f.includes("completed without evidence"));
    expect(found1).toBeDefined();

    const content1 = fs.readFileSync(filePath, "utf-8");
    expect(content1).toContain("completed_without_evidence_at:");

    // Second run: idempotent
    const report2 = await runAudit(tmp.pmDir);
    const found2 = report2.auto_fixed.find(f => f.includes("ASSIGNMENT-2026-07-08-no-evidence"));
    expect(found2).toBeUndefined();

    try { fs.rmSync(filePath); } catch {}
  });

  // ---------------------------------------------------------------------------
  // Body-preservation regression tests (Cat 14a/14b/14c with body content)
  // ---------------------------------------------------------------------------

  function bodyFixture(id: string, status: string, extraFm: string[], body: string): string {
    return [
      "---",
      `id: ${id}`,
      `status: ${status}`,
      "type: direct",
      `target_id: ISSUE-2026-07-08-${id.toLowerCase().replace(/^ASSIGNMENT-/i, "")}`,
      ...extraFm,
      "---",
      body,
    ].join("\n");
  }

  const BODY = [
    "",
    "# Context",
    "",
    "This is the assignment context body. It contains multiple paragraphs.",
    "",
    "Here is another paragraph to ensure multi-paragraph preservation.",
    "",
    "# Task Description",
    "",
    "Perform the required work and report back.",
    "",
  ].join("\n");

  it("14a body-preservation: writes target_orphaned_at and preserves body", async () => {
    const id = "ASSIGNMENT-2026-07-08-body-orphan";
    const filePath = join(aDir(), `${id}.md`);
    const original = bodyFixture(id, "pending", ["assigned_at: 2026-07-08"], BODY);
    fs.writeFileSync(filePath, original, "utf-8");
    const originalLen = original.length;

    // First run: should write target_orphaned_at
    const report1 = await runAudit(tmp.pmDir);
    const found1 = report1.auto_fixed.find(f => f.includes(id) && f.includes("orphaned"));
    expect(found1).toBeDefined();

    const content1 = fs.readFileSync(filePath, "utf-8");
    expect(content1).toContain("target_orphaned_at:");
    // Body must be fully preserved
    expect(content1).toContain("# Context");
    expect(content1).toContain("This is the assignment context body.");
    expect(content1).toContain("# Task Description");
    expect(content1).toContain("Perform the required work and report back.");
    // File should be longer than original (added field), not truncated
    expect(content1.length).toBeGreaterThan(originalLen);
    expect(content1.length).toBeLessThan(originalLen + 100); // just the field

    // Second run: idempotent — body still intact, no further write
    const report2 = await runAudit(tmp.pmDir);
    const found2 = report2.auto_fixed.find(f => f.includes(id) && f.includes("orphaned"));
    expect(found2).toBeUndefined();
    const content2 = fs.readFileSync(filePath, "utf-8");
    expect(content2).toBe(content1);
    expect(content2).toContain("# Context");
    expect(content2).toContain("# Task Description");

    try { fs.rmSync(filePath); } catch {}
  });

  it("14b body-preservation: writes reminded:true and preserves body", async () => {
    const id = "ASSIGNMENT-2026-05-01-body-stale";
    const filePath = join(aDir(), `${id}.md`);
    const original = bodyFixture(id, "pending", ["assigned_at: 2026-05-01"], BODY);
    fs.writeFileSync(filePath, original, "utf-8");
    const originalLen = original.length;

    const report1 = await runAudit(tmp.pmDir);
    const found1 = report1.auto_fixed.find(f => f.includes(id) && f.includes("reminded"));
    expect(found1).toBeDefined();

    const content1 = fs.readFileSync(filePath, "utf-8");
    expect(content1).toContain("reminded: true");
    expect(content1).toContain("# Context");
    expect(content1).toContain("# Task Description");
    expect(content1.length).toBeGreaterThan(originalLen);
    expect(content1.length).toBeLessThan(originalLen + 50);

    // Second run: idempotent
    const report2 = await runAudit(tmp.pmDir);
    const found2 = report2.auto_fixed.find(f => f.includes(id) && f.includes("reminded"));
    expect(found2).toBeUndefined();
    const content2 = fs.readFileSync(filePath, "utf-8");
    expect(content2).toBe(content1);
    expect(content2).toContain("# Context");
    expect(content2).toContain("# Task Description");

    try { fs.rmSync(filePath); } catch {}
  });

  it("14c body-preservation: writes completed_without_evidence_at and preserves body", async () => {
    const id = "ASSIGNMENT-2026-07-08-body-no-evidence";
    const filePath = join(aDir(), `${id}.md`);
    const original = bodyFixture(id, "completed", [
      "assigned_at: 2026-07-08",
      "completed_at: 2026-07-08",
    ], BODY);
    fs.writeFileSync(filePath, original, "utf-8");
    const originalLen = original.length;

    const report1 = await runAudit(tmp.pmDir);
    const found1 = report1.auto_fixed.find(f => f.includes(id) && f.includes("completed without evidence"));
    expect(found1).toBeDefined();

    const content1 = fs.readFileSync(filePath, "utf-8");
    expect(content1).toContain("completed_without_evidence_at:");
    expect(content1).toContain("# Context");
    expect(content1).toContain("# Task Description");
    expect(content1.length).toBeGreaterThan(originalLen);
    expect(content1.length).toBeLessThan(originalLen + 100);

    // Second run: idempotent
    const report2 = await runAudit(tmp.pmDir);
    const found2 = report2.auto_fixed.find(f => f.includes(id));
    expect(found2).toBeUndefined();
    const content2 = fs.readFileSync(filePath, "utf-8");
    expect(content2).toBe(content1);
    expect(content2).toContain("# Context");
    expect(content2).toContain("# Task Description");

    try { fs.rmSync(filePath); } catch {}
  });
});
