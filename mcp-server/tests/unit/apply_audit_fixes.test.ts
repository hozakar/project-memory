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

describe("apply_audit_fixes — annotate_orphan", () => {
  it("annotates a bare commit hash in both index.yml and phase.yml", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits:\n      - deadbee\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits:\n  - deadbee\n`);

    const fix: PendingFix = { type: "annotate_orphan", phase_id: "phase-x", hash: "deadbee", location: "commits", date: "2026-06-17" };
    const result = await applyAuditFixes(pmDir, [fix]);

    expect(result.applied).toHaveLength(1);
    expect(r("phases/phase-x/phase.yml")).toContain("deadbee [orphaned 2026-06-17]");
    expect(r("phases/index.yml")).toContain("deadbee [orphaned 2026-06-17]");
  });

  it("is idempotent — already-annotated hash is a no-op", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits:\n      - deadbee [orphaned 2026-06-17]\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits:\n  - deadbee [orphaned 2026-06-17]\n`);

    const fix: PendingFix = { type: "annotate_orphan", phase_id: "phase-x", hash: "deadbee", location: "commits", date: "2026-06-17" };
    const result = await applyAuditFixes(pmDir, [fix]);

    expect(result.applied).toHaveLength(1);
    expect(result.applied[0].summary).toMatch(/already annotated/);
    expect(r("phases/phase-x/phase.yml").match(/deadbee \[orphaned/g)?.length).toBe(1);
  });

  it("fails cleanly if the phase file does not exist", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits: []\n`);
    const fix: PendingFix = { type: "annotate_orphan", phase_id: "phase-missing", hash: "deadbee", location: "commits", date: "2026-06-17" };
    const result = await applyAuditFixes(pmDir, [fix]);

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toBe("file_not_found");
  });
});

describe("apply_audit_fixes — assign_commit", () => {
  it("appends a commit to phase.yml commits: [] and index.yml", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits: []\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits: []\n`);

    const fix: PendingFix = { type: "assign_commit", phaseId: "phase-x", commitHash: "abc1234", files: ["x.ts"] };
    const result = await applyAuditFixes(pmDir, [fix]);

    expect(result.applied).toHaveLength(1);
    expect(r("phases/phase-x/phase.yml")).toContain("- abc1234");
    expect(r("phases/index.yml")).toContain("- abc1234");
  });

  it("is idempotent — hash already present is a no-op", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits:\n      - abc1234\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits:\n  - abc1234\n`);

    const fix: PendingFix = { type: "assign_commit", phaseId: "phase-x", commitHash: "abc1234", files: [] };
    const result = await applyAuditFixes(pmDir, [fix]);

    expect(result.applied[0].summary).toMatch(/already in/);
    expect(r("phases/phase-x/phase.yml").match(/abc1234/g)?.length).toBe(1);
  });
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
});

describe("apply_audit_fixes — create_phase_stub", () => {
  it("creates a missing implementation.md stub", async () => {
    fs.mkdirSync(path.join(pmDir, "phases", "phase-x"), { recursive: true });
    const fix: PendingFix = { type: "create_phase_stub", phaseId: "phase-x", missingFile: "implementation.md" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.partial).toHaveLength(1);
    expect(r("phases/phase-x/implementation.md")).toContain("# Summary");
    expect(r("phases/phase-x/implementation.md")).toContain("<!-- TODO -->");
  });

  it("returns partial-already-present when file exists", async () => {
    fs.mkdirSync(path.join(pmDir, "phases", "phase-x"), { recursive: true });
    w("phases/phase-x/implementation.md", "# existing\n");
    const fix: PendingFix = { type: "create_phase_stub", phaseId: "phase-x", missingFile: "implementation.md" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.partial[0].context.already_present).toBe(true);
    expect(r("phases/phase-x/implementation.md")).toBe("# existing\n");
  });
});

describe("apply_audit_fixes — regression guards from review", () => {
  it("annotate_orphan: abbreviated hash does not corrupt a stored full-length hash", async () => {
    const fullHash = "deadbee" + "abcdef0123456789012345678901234"; // 41 char? actually need 40 total
    const trueFull = "deadbeeabcdef0123456789012345678901234567"; // 41 — let's use 40
    const fortyHash = "deadbee0123456789abcdef0123456789abcdef0"; // 40 hex chars
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits:\n      - ${fortyHash}\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits:\n  - ${fortyHash}\n`);
    // Fix payload carries abbreviated hash; must NOT match the 40-char one.
    const fix: PendingFix = { type: "annotate_orphan", phase_id: "phase-x", hash: "deadbee", location: "commits", date: "2026-06-17" };
    void fullHash; void trueFull;
    const result = await applyAuditFixes(pmDir, [fix]);
    // No corruption: 40-char hash still intact, no partial annotation injected
    expect(r("phases/phase-x/phase.yml")).toContain(fortyHash);
    expect(r("phases/phase-x/phase.yml")).not.toMatch(/deadbee \[orphaned/);
    expect(result.applied[0].summary).toMatch(/already annotated|no-op/);
  });

  it("assign_commit: hash appearing in unrelated field (notes) is not mistaken for already-present", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits: []\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\nnotes: "see abc1234 for context"\ncommits: []\n`);
    const fix: PendingFix = { type: "assign_commit", phaseId: "phase-x", commitHash: "abc1234", files: [] };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.applied[0].summary).toMatch(/^Assigned/);
    expect(r("phases/phase-x/phase.yml")).toMatch(/commits:\s*\n\s+- abc1234/);
  });

  it("assign_commit index.yml: new hash lands under commits:, not under sibling tags: list", async () => {
    w("phases/index.yml",
      `phases:\n` +
      `  - id: phase-x\n` +
      `    commits:\n` +
      `      - oldhash1\n` +
      `    tags:\n` +
      `      - foo\n` +
      `      - bar\n` +
      `    summary: x\n`,
    );
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits:\n  - oldhash1\n`);
    const fix: PendingFix = { type: "assign_commit", phaseId: "phase-x", commitHash: "newhash9", files: [] };
    await applyAuditFixes(pmDir, [fix]);
    const idx = r("phases/index.yml");
    // newhash9 must appear under commits:, BEFORE tags: line
    const newhashLineIdx = idx.indexOf("- newhash9");
    const tagsLineIdx = idx.indexOf("tags:");
    expect(newhashLineIdx).toBeGreaterThan(-1);
    expect(tagsLineIdx).toBeGreaterThan(-1);
    expect(newhashLineIdx).toBeLessThan(tagsLineIdx);
  });

  it("assign_commit index.yml: writes to the correct phase block when multiple phases exist with same-prefix hashes", async () => {
    w("phases/index.yml",
      `phases:\n` +
      `  - id: phase-a\n` +
      `    commits:\n` +
      `      - sharedhash\n` +
      `  - id: phase-b\n` +
      `    commits: []\n`,
    );
    w("phases/phase-b/phase.yml", `id: phase-b\ncommits: []\n`);
    // phase-a already has `sharedhash`. We want to assign `sharedhash` to phase-b.
    // The block-scoped idempotency must allow this (different phase blocks).
    const fix: PendingFix = { type: "assign_commit", phaseId: "phase-b", commitHash: "sharedhash", files: [] };
    await applyAuditFixes(pmDir, [fix]);
    expect(r("phases/index.yml").match(/- sharedhash/g)?.length).toBe(2);
  });

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

  it("create_phase_stub: covers all four stub templates", async () => {
    fs.mkdirSync(path.join(pmDir, "phases", "phase-x"), { recursive: true });
    for (const f of ["plan.md", "implementation.md", "review-and-fixes.md", "followup.md"]) {
      const fix: PendingFix = { type: "create_phase_stub", phaseId: "phase-x", missingFile: f };
      const result = await applyAuditFixes(pmDir, [fix]);
      expect(result.partial).toHaveLength(1);
      expect(r(`phases/phase-x/${f}`)).toContain("<!-- TODO -->");
    }
  });

  it("create_phase_stub: unknown filename returns failed", async () => {
    fs.mkdirSync(path.join(pmDir, "phases", "phase-x"), { recursive: true });
    const fix: PendingFix = { type: "create_phase_stub", phaseId: "phase-x", missingFile: "unknown.md" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].reason).toBe("schema_mismatch");
  });

  it("two consecutive calls with the same payload — true idempotency", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits: []\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits: []\n`);
    const fix: PendingFix = { type: "assign_commit", phaseId: "phase-x", commitHash: "abc1234", files: [] };
    await applyAuditFixes(pmDir, [fix]);
    const afterFirst = r("phases/phase-x/phase.yml");
    const second = await applyAuditFixes(pmDir, [fix]);
    expect(second.applied[0].summary).toMatch(/already in/);
    expect(r("phases/phase-x/phase.yml")).toBe(afterFirst);
  });
});

describe("apply_audit_fixes — batch + flags", () => {
  it("rerun_audit_recommended is true when state-changing fixes applied", async () => {
    w("decisions/DECISION-2026-06-17-foo.md", `---\nid: DECISION-2026-06-17-foo\nstatus: active\n---\n`);
    const fix: PendingFix = { type: "assign_adr_id", decisionId: "DECISION-2026-06-17-foo", adrId: "9" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.rerun_audit_recommended).toBe(true);
  });

  it("rerun_audit_recommended is false for annotate_orphan only", async () => {
    w("phases/index.yml", `phases:\n  - id: phase-x\n    commits:\n      - deadbee\n`);
    w("phases/phase-x/phase.yml", `id: phase-x\ncommits:\n  - deadbee\n`);
    const fix: PendingFix = { type: "annotate_orphan", phase_id: "phase-x", hash: "deadbee", location: "commits", date: "2026-06-17" };
    const result = await applyAuditFixes(pmDir, [fix]);
    expect(result.rerun_audit_recommended).toBe(false);
  });
});
