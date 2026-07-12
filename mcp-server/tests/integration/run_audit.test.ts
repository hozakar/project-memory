import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";
import { applyAuditFixes } from "../../src/tools/apply_audit_fixes";

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

describe("Cat 15: decision supersession integrity", () => {
  let cat15tmp: TmpDir;
  let cat15DecisionsDir: string;

  beforeEach(() => {
    cat15tmp = createTmpDir();
    // Create minimal structure
    fs.writeFileSync(join(cat15tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");
    const phasesDir = join(cat15tmp.pmDir, "phases");
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
    cat15DecisionsDir = join(cat15tmp.pmDir, "decisions");
    fs.mkdirSync(cat15DecisionsDir, { recursive: true });
  });

  afterEach(() => {
    try { cat15tmp.cleanup(); } catch { /* Windows cleanup */ }
  });

  // Helper to write a decision file
  function writeDecision(id: string, overrides: Record<string, string> = {}, body = "# Test\n"): void {
    const frontmatter: Record<string, string> = {
      id,
      title: `Test ${id}`,
      status: "active",
      primary_scope: "test",
      ...overrides,
    };
    const lines = ["---"];
    for (const [k, v] of Object.entries(frontmatter)) {
      lines.push(`${k}: ${v}`);
    }
    lines.push("---");
    lines.push("");
    lines.push(body);
    fs.writeFileSync(join(cat15DecisionsDir, `${id}.md`), lines.join("\n"), "utf-8");
  }

  // Helper: write decisions/index.md with Active and (optionally) Superseded tables
  function writeIndex(activeRows: string[], supersededRows: string[] = []): void {
    const lines: string[] = [
      "# Decisions Index",
      "",
      "| Date | ID | Scope | Status | Global | Touches | Claim |",
      "|---|---|---|---|---|---|---|",
    ];
    for (const row of activeRows) lines.push(row);

    if (supersededRows.length > 0) {
      lines.push("");
      lines.push("## Superseded");
      lines.push("");
      lines.push("| Date | ID | Scope | Status | Global | Touches | Claim | Superseded By |");
      lines.push("|---|---|---|---|---|---|---|---|");
      for (const row of supersededRows) lines.push(row);
    }

    fs.writeFileSync(join(cat15DecisionsDir, "index.md"), lines.join("\n"), "utf-8");
  }

  // -------------------------------------------------------------------------
  // Test 1: Dangling superseded_by auto-fix
  // -------------------------------------------------------------------------
  it("1: clears dangling superseded_by when target file does not exist", async () => {
    const id = "DECISION-2026-07-08-dangling-superseded-by";
    const target = "DECISION-9999-99-99-nonexistent";
    writeDecision(id, { status: "superseded", superseded_by: target });
    // Place A in Superseded index table with the dangling Superseded By cell
    writeIndex([], [
      `| 2026-07-08 | ${id} | test | superseded | - | test | Claim text | ${target} |`,
    ]);

    const report = await runAudit(cat15tmp.pmDir);

    const cleared = report.auto_fixed.find(f => f.includes("cleared dangling superseded_by") && f.includes(id));
    expect(cleared).toBeDefined();

    // File's superseded_by should now be null
    const content = fs.readFileSync(join(cat15DecisionsDir, `${id}.md`), "utf-8");
    expect(content).toContain("superseded_by: null");

    // Index Superseded By cell should be cleared to `-`
    const indexContent = fs.readFileSync(join(cat15DecisionsDir, "index.md"), "utf-8");
    // The row should now have `-` in the last cell
    const supersededSection = indexContent.split("## Superseded")[1];
    expect(supersededSection).toContain(`| ${id} |`);
    // Last cell should be ` - ` or `-` not the dangling target
    const rowMatch = supersededSection.match(new RegExp(`\\|\\s*${id}\\s*\\|.*\\|\\s*([^|]+)\\s*\\|\\s*$`, "m"));
    if (rowMatch) {
      expect(rowMatch[1].trim()).not.toBe(target);
    }
  });

  // -------------------------------------------------------------------------
  // Test 2: Dangling supersedes auto-fix
  // -------------------------------------------------------------------------
  it("2: clears dangling supersedes when target file does not exist", async () => {
    const id = "DECISION-2026-07-08-dangling-supersedes";
    const target = "DECISION-9999-99-99-nonexistent";
    writeDecision(id, { status: "active", supersedes: target });
    writeIndex([
      `| 2026-07-08 | ${id} | test | active | - | test | Claim`,
    ]);

    const report = await runAudit(cat15tmp.pmDir);

    const cleared = report.auto_fixed.find(f => f.includes("cleared dangling supersedes") && f.includes(id));
    expect(cleared).toBeDefined();

    const content = fs.readFileSync(join(cat15DecisionsDir, `${id}.md`), "utf-8");
    expect(content).toContain("supersedes: null");
  });

  // -------------------------------------------------------------------------
  // Test 3: Zombie-active → pending_fix
  // -------------------------------------------------------------------------
  it("3: produces pending_fix for zombie-active (superseded_by set but status not superseded)", async () => {
    const idA = "DECISION-2026-07-08-zombie-a";
    const idB = "DECISION-2026-07-08-zombie-b";
    // A has superseded_by: B, but status: active (zombie)
    writeDecision(idA, { superseded_by: idB, status: "active" });
    // B exists
    writeDecision(idB, { status: "active" });
    writeIndex([
      `| 2026-07-08 | ${idA} | test | active | - | test | Claim`,
      `| 2026-07-08 | ${idB} | test | active | - | test | Claim`,
    ]);

    const report = await runAudit(cat15tmp.pmDir);

    const zombieFix = report.pending_fixes.find(f => f.type === "fix_decision_supersession_status" && f.decisionId === idA);
    expect(zombieFix).toBeDefined();
    expect(zombieFix!.supersededBy).toBe(idB);

    // A's status should still be 'active' (run_audit only detects, doesn't apply)
    const content = fs.readFileSync(join(cat15DecisionsDir, `${idA}.md`), "utf-8");
    expect(content).toContain("status: active");
  });

  // -------------------------------------------------------------------------
  // Test 4: apply_audit_fixes applies zombie fix end-to-end
  // -------------------------------------------------------------------------
  it("4: apply_audit_fixes applies the zombie fix: flips status, adds superseded_by, moves row", async () => {
    const idA = "DECISION-2026-07-08-e2e-a";
    const idB = "DECISION-2026-07-08-e2e-b";
    writeDecision(idA, { superseded_by: idB, status: "active" });
    writeDecision(idB, { status: "active" });
    writeIndex([
      `| 2026-07-08 | ${idA} | test | active | - | test | Claim E2E`,
      `| 2026-07-08 | ${idB} | test | active | - | test | Claim E2E`,
    ]);

    // Run audit to detect
    const report = await runAudit(cat15tmp.pmDir);
    const zombieFix = report.pending_fixes.find(f => f.type === "fix_decision_supersession_status" && f.decisionId === idA);
    expect(zombieFix).toBeDefined();

    // Apply the pending fix
    const applyResult = await applyAuditFixes(cat15tmp.pmDir, [zombieFix!]);
    const applied = applyResult.applied.find(a => a.fix_type === "fix_decision_supersession_status");
    expect(applied).toBeDefined();

    // A.md status is now superseded
    const contentA = fs.readFileSync(join(cat15DecisionsDir, `${idA}.md`), "utf-8");
    expect(contentA).toContain("status: superseded");
    expect(contentA).toContain(`superseded_by: ${idB}`);

    // Index: A's row should be in Superseded table with Superseded By = idB
    const indexContent = fs.readFileSync(join(cat15DecisionsDir, "index.md"), "utf-8");
    expect(indexContent).toContain("## Superseded");
    const supersededSection = indexContent.split("## Superseded")[1];
    expect(supersededSection).toContain(`| ${idA} |`);
    expect(supersededSection).toContain(`| ${idB} |`); // Superseded By cell

    // Active section must NOT contain A's row
    const activeSection = indexContent.split("## Superseded")[0];
    // Active section can have the header and separator — check that A's row ID is not in active rows
    const activeLines = activeSection.split("\n").filter(l => l.includes("DECISION-"));
    const activeIds = activeLines.map(l => l.match(/DECISION-[\w-]+/)?.[0]).filter(Boolean);
    expect(activeIds).not.toContain(idA);
    expect(activeIds).toContain(idB);
  });

  // -------------------------------------------------------------------------
  // Test 5: audit_ignore suppression
  // -------------------------------------------------------------------------
  it("5: audit_ignore suppresses zombie detection", async () => {
    const idA = "DECISION-2026-07-08-ignore-a";
    const idB = "DECISION-2026-07-08-ignore-b";
    writeDecision(idA, { superseded_by: idB, status: "active" });
    writeDecision(idB, { status: "active" });
    writeIndex([
      `| 2026-07-08 | ${idA} | test | active | - | test | Claim`,
      `| 2026-07-08 | ${idB} | test | active | - | test | Claim`,
    ]);

    // Add audit_ignore entry using readAuditIgnore-compatible format (flat YAML key: value, no `-` list marker)
    fs.writeFileSync(join(cat15tmp.pmDir, "config.yml"),
      "adr_enabled: false\naudit_ignore:\n  key: decision-supersession:DECISION-2026-07-08-ignore-a:zombie\n");

    const report = await runAudit(cat15tmp.pmDir);
    const zombieFix = report.pending_fixes.find(f => f.type === "fix_decision_supersession_status" && f.decisionId === idA);
    expect(zombieFix).toBeUndefined();

    // Also check dangling suppression with the same config
    const danglingFix = report.auto_fixed.find(f => f.includes(idA) && f.includes("dangling"));
    expect(danglingFix).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 6: Idempotency — applying the same fix twice is a no-op
  // -------------------------------------------------------------------------
  it("6: applying the same zombie fix twice is idempotent", async () => {
    const idA = "DECISION-2026-07-08-idempotent-a";
    const idB = "DECISION-2026-07-08-idempotent-b";
    writeDecision(idA, { superseded_by: idB, status: "active" });
    writeDecision(idB, { status: "active" });
    writeIndex([
      `| 2026-07-08 | ${idA} | test | active | - | test | Claim Idempotent`,
      `| 2026-07-08 | ${idB} | test | active | - | test | Claim Idempotent`,
    ]);

    const report = await runAudit(cat15tmp.pmDir);
    const zombieFix = report.pending_fixes.find(f => f.type === "fix_decision_supersession_status" && f.decisionId === idA);
    expect(zombieFix).toBeDefined();

    // First apply
    const result1 = await applyAuditFixes(cat15tmp.pmDir, [zombieFix!]);
    expect(result1.applied.some(a => a.fix_type === "fix_decision_supersession_status")).toBe(true);

    // Second apply — should be no-op (row already moved to Superseded table)
    const result2 = await applyAuditFixes(cat15tmp.pmDir, [zombieFix!]);
    // Row not in Active table → returns PartialFix with row_not_in_active_table
    expect(result2.partial.some(p => p.fix_type === "fix_decision_supersession_status" && p.context?.reason === "row_not_in_active_table")).toBe(true);

    // A.md status still superseded
    const contentA = fs.readFileSync(join(cat15DecisionsDir, `${idA}.md`), "utf-8");
    expect(contentA).toContain("status: superseded");
  });

  // -------------------------------------------------------------------------
  // Test 7: Healthy superseded decision produces no finding
  // -------------------------------------------------------------------------
  it("7: correctly superseded decision (status=superseded + superseded_by exists) produces no finding", async () => {
    const idA = "DECISION-2026-07-08-healthy-a";
    const idB = "DECISION-2026-07-08-healthy-b";
    // A is correctly superseded: status=superseded, superseded_by=B, B exists
    writeDecision(idA, { superseded_by: idB, status: "superseded" });
    writeDecision(idB, { status: "active" });
    writeIndex([
      `| 2026-07-08 | ${idB} | test | active | - | test | Claim`,
    ], [
      `| 2026-07-08 | ${idA} | test | superseded | - | test | Claim | ${idB} |`,
    ]);

    const report = await runAudit(cat15tmp.pmDir);

    const cat15Auto = report.auto_fixed.filter(f => f.startsWith("Cat 15:"));
    const cat15Pending = report.pending_fixes.filter(f => f.type === "fix_decision_supersession_status");

    expect(cat15Auto).toHaveLength(0);
    expect(cat15Pending).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // Test 8: audit_ignore suppresses dangling detection (FN4 regression)
  // -------------------------------------------------------------------------
  it("8: audit_ignore suppresses dangling superseded_by detection", async () => {
    const id = "DECISION-2026-07-08-ignore-dangling";
    const target = "DECISION-9999-99-99-nonexistent";
    // Create a decision with dangling superseded_by
    writeDecision(id, { superseded_by: target });
    writeIndex([], [
      `| 2026-07-08 | ${id} | test | superseded | - | test | Claim | ${target} |`,
    ]);

    // Add audit_ignore for dangling
    fs.writeFileSync(join(cat15tmp.pmDir, "config.yml"),
      "adr_enabled: false\naudit_ignore:\n  key: decision-supersession:DECISION-2026-07-08-ignore-dangling:dangling\n");

    const report = await runAudit(cat15tmp.pmDir);

    // No Cat 15 dangling message for this id
    const danglingFix = report.auto_fixed.find(f => f.includes(id) && f.includes("dangling"));
    expect(danglingFix).toBeUndefined();

    // The file's superseded_by should still point to the (non-existent) target (not cleared)
    const content = fs.readFileSync(join(cat15DecisionsDir, `${id}.md`), "utf-8");
    const fm = content.split("---")[1];
    expect(fm).toContain(`superseded_by: ${target}`);
  });

  // -------------------------------------------------------------------------
  // Test 9: Both-dangling clears both fields (B1 + FN5 regression)
  // -------------------------------------------------------------------------
  it("9: clears both dangling superseded_by and supersedes when both targets are missing", async () => {
    const id = "DECISION-2026-07-08-both-dangling";
    const target1 = "DECISION-9999-99-99-nonexistent-a";
    const target2 = "DECISION-9999-99-99-nonexistent-b";
    writeDecision(id, { status: "active", superseded_by: target1, supersedes: target2 });
    writeIndex([
      `| 2026-07-08 | ${id} | test | active | - | test | Claim`,
    ]);

    const report = await runAudit(cat15tmp.pmDir);

    // Both messages should appear
    const clearedSupersededBy = report.auto_fixed.find(f => f.includes("cleared dangling superseded_by") && f.includes(id));
    expect(clearedSupersededBy).toBeDefined();
    const clearedSupersedes = report.auto_fixed.find(f => f.includes("cleared dangling supersedes") && f.includes(id));
    expect(clearedSupersedes).toBeDefined();

    // The file's frontmatter should have both fields set to null
    const content = fs.readFileSync(join(cat15DecisionsDir, `${id}.md`), "utf-8");
    expect(content).toContain("superseded_by: null");
    expect(content).toContain("supersedes: null");
  });
});

describe("runAudit — Cat 6: annotated status + unknown guard", () => {
  let cat6tmp: TmpDir;
  let cat6DecisionsDir: string;

  beforeEach(() => {
    cat6tmp = createTmpDir();
    fs.writeFileSync(join(cat6tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");
    const phasesDir = join(cat6tmp.pmDir, "phases");
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
    cat6DecisionsDir = join(cat6tmp.pmDir, "decisions");
    fs.mkdirSync(cat6DecisionsDir, { recursive: true });
  });

  afterEach(() => {
    try { cat6tmp.cleanup(); } catch { /* Windows cleanup */ }
  });

  function writeDecisionFile(id: string, frontmatterLines: string[], body = "# Test\n"): void {
    const lines = ["---", ...frontmatterLines, "---", "", body];
    fs.writeFileSync(join(cat6DecisionsDir, `${id}.md`), lines.join("\n"), "utf-8");
  }

  function writeIndex(rows: string[]): void {
    const lines = [
      "# Decisions Index",
      "",
      "| Date | ID | Scope | Status | Global | Touches | Claim |",
      "|---|---|---|---|---|---|---|",
      ...rows,
    ];
    fs.writeFileSync(join(cat6DecisionsDir, "index.md"), lines.join("\n"), "utf-8");
  }

  function readIndex(): string {
    return fs.readFileSync(join(cat6DecisionsDir, "index.md"), "utf-8");
  }

  // -----------------------------------------------------------------------
  // Test a: Annotated row matches canonical → no pending_fix
  // -----------------------------------------------------------------------
  it("annotated status matches canonical → no fix_decision_index_status emitted, index unchaged", async () => {
    writeDecisionFile("DECISION-2026-07-03-foo", [
      "id: DECISION-2026-07-03-foo",
      "status: active",
      "primary_scope: test",
    ]);
    writeIndex([
      `| 2026-07-03 | DECISION-2026-07-03-foo | test | active — implemented (branch feat/x; 337/337 tests) | - | t | c |`,
    ]);
    const indexBefore = readIndex();

    const report = await runAudit(cat6tmp.pmDir);
    const statusFix = report.pending_fixes.find(
      f => f.type === "fix_decision_index_status" && f.decisionId === "DECISION-2026-07-03-foo",
    );
    expect(statusFix).toBeUndefined();

    // Index must be byte-unchanged
    const indexAfter = readIndex();
    expect(indexAfter).toBe(indexBefore);
  });

  // -----------------------------------------------------------------------
  // Test b: Annotated row canonical mismatch → pending_fix emitted, apply preserves annotation
  // -----------------------------------------------------------------------
  it("annotated status canonical mismatch → pending_fix indexedStatus flip preserves annotation", async () => {
    writeDecisionFile("DECISION-2026-07-03-foo", [
      "id: DECISION-2026-07-03-foo",
      "status: superseded",
      "primary_scope: test",
    ]);
    writeIndex([
      `| 2026-07-03 | DECISION-2026-07-03-foo | test | active — implemented (branch feat/x; 337/337 tests) | - | t | c |`,
    ]);

    // Run audit → detect mismatch
    const report = await runAudit(cat6tmp.pmDir);
    const statusFix = report.pending_fixes.find(
      f => f.type === "fix_decision_index_status" && f.decisionId === "DECISION-2026-07-03-foo",
    );
    expect(statusFix).toBeDefined();
    expect(statusFix!.correctStatus).toBe("superseded");

    // Apply the fix
    const applyResult = await applyAuditFixes(cat6tmp.pmDir, [statusFix!]);
    const applied = applyResult.applied.find(a => a.fix_type === "fix_decision_index_status");
    expect(applied).toBeDefined();

    // Index must have the annotation suffix preserved, only "active" flipped to "superseded"
    const indexContent = readIndex();
    expect(indexContent).toContain("superseded — implemented (branch feat/x; 337/337 tests)");
    expect(indexContent).not.toContain("active — implemented");
  });

  // -----------------------------------------------------------------------
  // Test c: Unknown guard — file with unparseable frontmatter does NOT cause "unknown" in index
  // -----------------------------------------------------------------------
  it("file with unparseable status does not produce unknown-status fix or clobber index cell", async () => {
    // Decision file with a valid frontmatter block but NO `status:` line
    writeDecisionFile("DECISION-2026-07-03-no-status", [
      "id: DECISION-2026-07-03-no-status",
      "touches: test",
    ]);
    // Another decision with proper status to ensure audit still works
    writeDecisionFile("DECISION-2026-07-03-other", [
      "id: DECISION-2026-07-03-other",
      "status: active",
      "primary_scope: test",
    ]);
    // Index has a row for the no-status decision with Status = "active"
    writeIndex([
      `| 2026-07-03 | DECISION-2026-07-03-no-status | - | active | - | test | c |`,
      `| 2026-07-03 | DECISION-2026-07-03-other | test | active | - | t | c |`,
    ]);

    const report = await runAudit(cat6tmp.pmDir);

    // No pending_fix with correctStatus "unknown" should exist
    const unknownFixes = report.pending_fixes.filter(f => f.correctStatus === "unknown");
    expect(unknownFixes).toHaveLength(0);

    // The no-status file should NOT trigger a missing-row fix either (skipped entirely)
    const noStatusFixes = report.pending_fixes.filter(f =>
      f.decisionId === "DECISION-2026-07-03-no-status",
    );
    expect(noStatusFixes).toHaveLength(0);

    // The other decision's missing-row fix should still be detected
    // (it IS in indexRows, so no missing-row fix — only no-status one should be missing)
    const otherFix = report.pending_fixes.find(f => f.decisionId === "DECISION-2026-07-03-other");
    expect(otherFix).toBeUndefined(); // row exists, status matches → no fix

    // Now apply all pending fixes (none for no-status case)
    const applyResult = await applyAuditFixes(cat6tmp.pmDir, report.pending_fixes);
    expect(applyResult.applied).toHaveLength(0);

    // Index Status cell for no-status row is STILL "active" (not clobbered to "unknown")
    const indexContent = readIndex();
    expect(indexContent).toContain("| DECISION-2026-07-03-no-status | - | active | - | test | c |");
  });
});
