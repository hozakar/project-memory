import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { applyAuditFixes } from "../../src/tools/apply_audit_fixes";
import type { PendingFix } from "../../src/types";

let tmpRoot: string;
let pmDir: string;

function w(relPath: string, content: string): void {
  const full = path.join(pmDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, "utf-8");
}

function r(relPath: string): string {
  return fs.readFileSync(path.join(pmDir, relPath), "utf-8");
}

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "apply-audit-fixes-"));
  pmDir = path.join(tmpRoot, ".project-memory");
  fs.mkdirSync(pmDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe("apply_audit_fixes — add_decision_index_row", () => {
  it("prepends a row with TODO claim placeholder and returns partial", async () => {
    w("decisions/DECISION-2026-06-17-foo.md", `---\nid: DECISION-2026-06-17-foo\nstatus: active\nprimary_scope: workflow\napplies_globally: false\n---\n# Foo\n`);
    w("decisions/index.md", `# Decisions Index\n\n| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-06-16 | DECISION-2026-06-16-prev | conventions | active | - | a | older |\n`);

    const fix: PendingFix = { type: "add_decision_index_row", decisionId: "DECISION-2026-06-17-foo", status: "active", touches: ["a", "b"], date: "2026-06-17" };
    const result = await applyAuditFixes(pmDir, [fix]);

    expect(result.partial).toHaveLength(1);
    const content = r("decisions/index.md");
    expect(content).toContain("DECISION-2026-06-17-foo");
    expect(content).toContain("<!-- TODO: claim -->");
    expect(content).toContain("workflow");
    // Should be newer-first: new row comes before prev row
    const newIdx = content.indexOf("DECISION-2026-06-17-foo");
    const prevIdx = content.indexOf("DECISION-2026-06-16-prev");
    expect(newIdx).toBeLessThan(prevIdx);
  });

  it("marks already-present rows as already_present in partial", async () => {
    w("decisions/DECISION-2026-06-17-foo.md", `---\nid: DECISION-2026-06-17-foo\nstatus: active\n---\n`);
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-06-17 | DECISION-2026-06-17-foo | s | active | - | t | already there |\n`);
    const fix: PendingFix = { type: "add_decision_index_row", decisionId: "DECISION-2026-06-17-foo", status: "active", touches: [], date: "2026-06-17" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.partial).toHaveLength(1);
    expect(result.partial[0].context.already_present).toBe(true);
  });

  it.each([
    ["boolean true", "true"],
    ["string true", '"true"'],
    ["string True", "True"],
    ["string yes", "yes"],
    ["string Yes", "Yes"],
    ["string YES", "YES"],
  ])("applies_globally %s → Global column = Yes", async (_label, yamlValue) => {
    w(
      "decisions/DECISION-2026-06-17-foo.md",
      `---\nid: DECISION-2026-06-17-foo\nstatus: active\nprimary_scope: workflow\napplies_globally: ${yamlValue}\n---\n# Foo\n`
    );
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n`);
    const fix: PendingFix = { type: "add_decision_index_row", decisionId: "DECISION-2026-06-17-foo", status: "active", touches: [], date: "2026-06-17" };
    await applyAuditFixes(pmDir, [fix]);
    expect(r("decisions/index.md")).toMatch(/\| Yes \|/);
  });

  it.each([
    ["boolean false", "false"],
    ["string false", '"false"'],
  ])("applies_globally %s → Global column = -", async (_label, yamlValue) => {
    w(
      "decisions/DECISION-2026-06-17-foo.md",
      `---\nid: DECISION-2026-06-17-foo\nstatus: active\nprimary_scope: workflow\napplies_globally: ${yamlValue}\n---\n# Foo\n`
    );
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n`);
    const fix: PendingFix = { type: "add_decision_index_row", decisionId: "DECISION-2026-06-17-foo", status: "active", touches: [], date: "2026-06-17" };
    await applyAuditFixes(pmDir, [fix]);
    const content = r("decisions/index.md");
    expect(content).toMatch(/\| - \|/);
    expect(content).not.toMatch(/\| Yes \|/);
  });
});

describe("apply_audit_fixes — fix_decision_index_status", () => {
  it("flips the Status cell of an existing row", async () => {
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-06-17 | DECISION-2026-06-17-foo | s | active | - | t | c |\n`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-06-17-foo", correctStatus: "superseded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    expect(r("decisions/index.md")).toMatch(/\| superseded \|/);
  });

  it("is no-op when status already correct", async () => {
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-06-17 | DECISION-2026-06-17-foo | s | superseded | - | t | c |\n`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-06-17-foo", correctStatus: "superseded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied[0].summary).toMatch(/already/);
  });

  it("recognizes and preserves a hyphenated status (e.g. on-hold)", async () => {
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-06-17 | DECISION-2026-06-17-foo | s | on-hold | - | t | c |\n`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-06-17-foo", correctStatus: "active" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].summary).toMatch(/on-hold.*active|active/);
    expect(r("decisions/index.md")).toMatch(/\| active \|/);
  });

  it("is no-op when existing hyphenated status matches correctStatus", async () => {
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-06-17 | DECISION-2026-06-17-foo | s | in-progress | - | t | c |\n`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-06-17-foo", correctStatus: "in-progress" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied[0].summary).toMatch(/already/);
    expect(r("decisions/index.md")).toMatch(/\| in-progress \|/);
  });

  it("matches row with trailing whitespace after section header (whitespace tolerance)", async () => {
    // Section header has trailing spaces — the table header is still found and row is still updated
    w("decisions/index.md", `## Active   \n\n| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-06-17 | DECISION-2026-06-17-foo | s | active | - | t | c |\n`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-06-17-foo", correctStatus: "superseded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    expect(r("decisions/index.md")).toMatch(/\| superseded \|/);
  });
});

describe("apply_audit_fixes — assign_adr_id", () => {
  it("inserts adr_id: into DECISION frontmatter", async () => {
    w("decisions/DECISION-2026-06-17-foo.md", `---\nid: DECISION-2026-06-17-foo\nstatus: active\n---\n# Foo\n`);
    const fix: PendingFix = { type: "assign_adr_id", decisionId: "DECISION-2026-06-17-foo", adrId: "42" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    expect(r("decisions/DECISION-2026-06-17-foo.md")).toContain("adr_id: 42");
  });

  it("replaces null adr_id", async () => {
    w("decisions/DECISION-2026-06-17-foo.md", `---\nid: DECISION-2026-06-17-foo\nstatus: active\nadr_id: null\n---\n`);
    const fix: PendingFix = { type: "assign_adr_id", decisionId: "DECISION-2026-06-17-foo", adrId: "42" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    expect(r("decisions/DECISION-2026-06-17-foo.md")).toContain("adr_id: 42");
    expect(r("decisions/DECISION-2026-06-17-foo.md")).not.toContain("adr_id: null");
  });
});

describe("apply_audit_fixes — create_adr_file", () => {
  it("writes a stub ADR with TODO placeholders and returns partial", async () => {
    w("config.yml", `adr_dir: adr\n`);
    w("decisions/DECISION-2026-06-17-foo.md", `---\nid: DECISION-2026-06-17-foo\nstatus: active\n---\n# Foo Title\n\n## Context\nBody.\n`);
    const fix: PendingFix = { type: "create_adr_file", decisionId: "DECISION-2026-06-17-foo", adrId: "0042" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.partial).toHaveLength(1);
    const adrPath = path.join(tmpRoot, "adr", "0042-foo.md");
    expect(fs.existsSync(adrPath)).toBe(true);
    const adrContent = fs.readFileSync(adrPath, "utf-8");
    expect(adrContent).toContain("# Foo Title");
    expect(adrContent).toContain("Status: Accepted");
    expect(adrContent).toContain("<!-- TODO");
  });

  const adrStatusCases: Array<[string, string]> = [
    ["active", "Accepted"],
    ["accepted", "Accepted"],
    ["superseded", "Superseded"],
    ["deprecated", "Deprecated"],
    ["rejected", "Rejected"],
    ["proposed", "Proposed"],
    ["draft", "Draft"],
    ["custom-status", "Custom-status"],
  ];

  it.each(adrStatusCases)("maps decision status %s → ADR Status: %s", async (inputStatus, expectedStatus) => {
    w("config.yml", `adr_dir: adr\n`);
    w(
      "decisions/DECISION-2026-06-17-statustest.md",
      `---\nid: DECISION-2026-06-17-statustest\nstatus: ${inputStatus}\n---\n# Status Test\n\n## Context\nBody.\n`,
    );
    const fix: PendingFix = { type: "create_adr_file", decisionId: "DECISION-2026-06-17-statustest", adrId: "0099" };
    await applyAuditFixes(pmDir, [fix]);
    const adrPath = path.join(tmpRoot, "adr", `0099-statustest.md`);
    const adrContent = fs.readFileSync(adrPath, "utf-8");
    expect(adrContent).toContain(`Status: ${expectedStatus}`);
  });
});

describe("apply_audit_fixes — fix_decision_index_status (non-canonical schema)", () => {
  it("non-canonical 6-col (missing Scope, Claim/Touches swapped)", async () => {
    w("decisions/index.md", `| Date | ID | Status | Global | Claim | Touches |
|---|---|---|---|---|---|
| 2026-07-03 | DECISION-2026-07-03-foo | active | No | Claim text | touch1, touch2 |
`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-07-03-foo", correctStatus: "superseded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    const content = r("decisions/index.md");
    // Status column (3rd) should be updated, Global column (4th) should remain unchanged
    expect(content).toMatch(/\| superseded \| No \|/);
    // Specifically verify the full line
    const expectedRow = "| 2026-07-03 | DECISION-2026-07-03-foo | superseded | No | Claim text | touch1, touch2 |";
    expect(content).toContain(expectedRow);
  });

  it("non-canonical schema no-op when status already correct", async () => {
    w("decisions/index.md", `| Date | ID | Status | Global | Claim | Touches |
|---|---|---|---|---|---|
| 2026-07-03 | DECISION-2026-07-03-foo | superseded | No | Claim text | touch1, touch2 |
`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-07-03-foo", correctStatus: "superseded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied[0].summary).toMatch(/already/);
  });

  it("canonical schema still works (regression)", async () => {
    w("decisions/index.md", `| Date | ID | Scope | Status | Global | Touches | Claim |
|---|---|---|---|---|---|---|---|
| 2026-06-17 | DECISION-2026-06-17-foo | s | active | - | t | c |
`);
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "DECISION-2026-06-17-foo", correctStatus: "superseded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    const content = r("decisions/index.md");
    expect(content).toMatch(/\| superseded \|/);
    // Scope (-), Global (-), Touches (t), Claim (c) all unchanged
    expect(content).toContain("| s | superseded | - | t | c |");
  });
});

describe("apply_audit_fixes — regression guards from review", () => {
  it("assign_adr_id: works on CRLF frontmatter (Windows line endings)", async () => {
    w("decisions/DECISION-2026-06-17-foo.md", `---\r\nid: DECISION-2026-06-17-foo\r\nstatus: active\r\n---\r\n# Body\r\n`);
    const fix: PendingFix = { type: "assign_adr_id", decisionId: "DECISION-2026-06-17-foo", adrId: "7" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    const content = r("decisions/DECISION-2026-06-17-foo.md");
    expect(content).toContain("adr_id: 7");
    // Insertion must be INSIDE the frontmatter block (before closing ---)
    const closingIdx = content.indexOf("---", content.indexOf("---") + 3);
    expect(content.indexOf("adr_id: 7")).toBeLessThan(closingIdx);
  });
});

describe("apply_audit_fixes — add_discussion_index_row", () => {
  it("prepends a row with TODO summary placeholder and returns partial", async () => {
    w("discussions/DISCUSSION-2026-07-08-test.md", `---
id: DISCUSSION-2026-07-08-test
status: open
---
# Test Discussion

outcome:
  type: none
`);
    w("discussions/index.md", `# Discussions

| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|---|
| 2026-07-07 | DISCUSSION-2026-07-07-prev | open | none | - | earlier |
`);

    const fix: PendingFix = { type: "add_discussion_index_row", discussionId: "DISCUSSION-2026-07-08-test", status: "open", date: "2026-07-08" };
    const result = await applyAuditFixes(pmDir, [fix]);

    expect(result.partial).toHaveLength(1);
    const content = r("discussions/index.md");
    expect(content).toContain("DISCUSSION-2026-07-08-test");
    expect(content).toContain("<!-- TODO: summary -->");
  });

  it("marks already-present rows as already_present in partial", async () => {
    w("discussions/DISCUSSION-2026-07-08-test.md", `---
id: DISCUSSION-2026-07-08-test
status: open
---
# Body
`);
    w("discussions/index.md", `| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|---|
| 2026-07-08 | DISCUSSION-2026-07-08-test | open | none | - | existing |
`);
    const fix: PendingFix = { type: "add_discussion_index_row", discussionId: "DISCUSSION-2026-07-08-test", status: "open", date: "2026-07-08" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.partial).toHaveLength(1);
    expect(result.partial[0].context.already_present).toBe(true);
  });

  it("derives outcome from discussion frontmatter", async () => {
    w("discussions/DISCUSSION-2026-07-08-foo.md", `---
id: DISCUSSION-2026-07-08-foo
status: concluded
outcome: DECISION-2026-07-08-something
---
# Foo
`);
    w("discussions/index.md", `| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|---|
`);
    const fix: PendingFix = { type: "add_discussion_index_row", discussionId: "DISCUSSION-2026-07-08-foo", status: "concluded", date: "2026-07-08" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.partial).toHaveLength(1);
    expect(r("discussions/index.md")).toContain("DECISION-2026-07-08-something");
  });
});

describe("apply_audit_fixes — fix_discussion_index_status", () => {
  it("flips the Status cell of an existing row", async () => {
    w("discussions/index.md", `| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|---|
| 2026-07-08 | DISCUSSION-2026-07-08-test | open | none | - | summary |
`);
    const fix: PendingFix = { type: "fix_discussion_index_status", discussionId: "DISCUSSION-2026-07-08-test", correctStatus: "concluded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    expect(r("discussions/index.md")).toMatch(/\| concluded \|/);
  });

  it("is no-op when status already correct", async () => {
    w("discussions/index.md", `| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|---|
| 2026-07-08 | DISCUSSION-2026-07-08-test | concluded | none | - | summary |
`);
    const fix: PendingFix = { type: "fix_discussion_index_status", discussionId: "DISCUSSION-2026-07-08-test", correctStatus: "concluded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied[0].summary).toMatch(/already/);
  });

  it("matches row with trailing whitespace", async () => {
    w("discussions/index.md", `## Discussions   

| Date | ID | Status | Outcome | Tags | Summary |
|---|---|---|---|---|---|---|
| 2026-07-08 | DISCUSSION-2026-07-08-test | open | none | - | s |
`);
    const fix: PendingFix = { type: "fix_discussion_index_status", discussionId: "DISCUSSION-2026-07-08-test", correctStatus: "concluded" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied).toHaveLength(1);
    expect(r("discussions/index.md")).toMatch(/\| concluded \|/);
  });
});

describe("apply_audit_fixes — batch + flags", () => {
  it("rerun_audit_recommended is true when state-changing fixes applied", async () => {
    w("decisions/DECISION-2026-06-17-foo.md", `---\nid: DECISION-2026-06-17-foo\nstatus: active\n---\n`);
    const fix: PendingFix = { type: "assign_adr_id", decisionId: "DECISION-2026-06-17-foo", adrId: "9" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.rerun_audit_recommended).toBe(true);
  });

});

describe("apply_audit_fixes — path traversal hardening", () => {
  it("add_decision_index_row: rejects decisionId with traversal sequence", async () => {
    const fix: PendingFix = { type: "add_decision_index_row", decisionId: "../../etc/passwd", status: "active", touches: [], date: "2026-06-17" };
    await expect(applyAuditFixes(pmDir, [fix])).rejects.toThrow("Invalid memory ID");
  });

  it("assign_adr_id: rejects decisionId with traversal sequence", async () => {
    const fix: PendingFix = { type: "assign_adr_id", decisionId: "../../etc/passwd", adrId: "1" };
    await expect(applyAuditFixes(pmDir, [fix])).rejects.toThrow("Invalid memory ID");
  });

  it("create_adr_file: rejects decisionId with traversal sequence", async () => {
    w("config.yml", `adr_dir: adr\n`);
    const fix: PendingFix = { type: "create_adr_file", decisionId: "../../etc/passwd", adrId: "1" };
    await expect(applyAuditFixes(pmDir, [fix])).rejects.toThrow("Invalid memory ID");
  });

  it("fix_decision_index_status: rejects decisionId with traversal sequence", async () => {
    const fix: PendingFix = { type: "fix_decision_index_status", decisionId: "../../etc/passwd", correctStatus: "active" };
    await expect(applyAuditFixes(pmDir, [fix])).rejects.toThrow("Invalid memory ID");
  });
});
