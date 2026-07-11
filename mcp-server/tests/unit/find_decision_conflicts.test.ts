import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  cosineSimilarity,
  pairKey,
  isIgnored,
  readAuditIgnoreList,
} from "../../src/tools/find_decision_conflicts";

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe("cosineSimilarity", () => {
  it("identical vectors → 1.0", () => {
    const v = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10);
  });

  it("orthogonal (perpendicular) unit vectors → 0.0", () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
  });

  it("opposite vectors → 0.0 (clamped, not -1.0)", () => {
    // For normalized L2 vectors: opposite = -1.0, which should clamp to 0.0
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10);
  });

  it("parallel normalized vectors → 1.0", () => {
    const a = [0.6, 0.8];
    const b = [0.6, 0.8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
  });

  it("clamps negative values to 0", () => {
    // Two 384-dim vectors that would produce a negative dot product
    const a: number[] = new Array(384).fill(0.1);
    const b: number[] = new Array(384).fill(-0.1);
    // Dot product = 384 * 0.1 * (-0.1) = -3.84
    expect(cosineSimilarity(a, b)).toBe(0.0);
  });

  it("clamps values above 1 to 1", () => {
    // Two identical non-normalized unit vectors: dot = 1
    const a = [1, 0, 0, 0];
    const b = [1, 0, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 10);
  });

  it("handles 384-dim vectors (realistic size)", () => {
    const a: number[] = new Array(384).fill(0.1);
    const b: number[] = new Array(384).fill(0.1);
    // Dot product of two identical vectors where each entry is 0.1
    // = 384 * 0.1 * 0.1 = 3.84. Since the vectors are not normalized,
    // this would normally produce > 1 but we clamp to [0, 1]
    expect(cosineSimilarity(a, b)).toBeGreaterThanOrEqual(0);
    expect(cosineSimilarity(a, b)).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// pairKey
// ---------------------------------------------------------------------------

describe("pairKey", () => {
  it("returns IDs in lexicographic order when B < A", () => {
    expect(pairKey("DECISION-B", "DECISION-A")).toBe("DECISION-A:DECISION-B");
  });

  it("returns IDs in lexicographic order when A < B", () => {
    expect(pairKey("DECISION-A", "DECISION-B")).toBe("DECISION-A:DECISION-B");
  });

  it("handles identical IDs", () => {
    expect(pairKey("DECISION-A", "DECISION-A")).toBe("DECISION-A:DECISION-A");
  });

  it("handles numeric suffixes correctly", () => {
    expect(pairKey("DECISION-001", "DECISION-002")).toBe("DECISION-001:DECISION-002");
    expect(pairKey("DECISION-002", "DECISION-001")).toBe("DECISION-001:DECISION-002");
  });
});

// ---------------------------------------------------------------------------
// isIgnored
// ---------------------------------------------------------------------------

describe("isIgnored", () => {
  it("pair in list → true", () => {
    const ignoreList = ["decision-contradiction:DECISION-A:DECISION-B"];
    expect(isIgnored("DECISION-A", "DECISION-B", ignoreList)).toBe(true);
  });

  it("pair not in list → false", () => {
    const ignoreList = ["decision-contradiction:DECISION-A:DECISION-B"];
    expect(isIgnored("DECISION-A", "DECISION-C", ignoreList)).toBe(false);
  });

  it("different order in list → true (canonical key)", () => {
    // Pair key sorts lexicographically, so (B, A) → "DECISION-A:DECISION-B"
    const ignoreList = ["decision-contradiction:DECISION-A:DECISION-B"];
    expect(isIgnored("DECISION-B", "DECISION-A", ignoreList)).toBe(true);
  });

  it("empty list → false", () => {
    expect(isIgnored("DECISION-A", "DECISION-B", [])).toBe(false);
  });

  it("ignores non-contradiction entries in list", () => {
    const ignoreList = ["decision-drift:DECISION-A:missing-row"];
    expect(isIgnored("DECISION-A", "DECISION-B", ignoreList)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// readAuditIgnoreList
// ---------------------------------------------------------------------------

describe("readAuditIgnoreList", () => {
  let tmpRoot: string;
  let pmDir: string;

  function w(relPath: string, content: string): void {
    const full = path.join(pmDir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "find-decision-conflicts-"));
    pmDir = path.join(tmpRoot, ".project-memory");
    fs.mkdirSync(pmDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns [] when config.yml does not exist", () => {
    expect(readAuditIgnoreList(pmDir)).toEqual([]);
  });

  it("returns [] when audit_ignore is empty inline list", () => {
    w("config.yml", "profile: full\naudit_ignore: []\n");
    expect(readAuditIgnoreList(pmDir)).toEqual([]);
  });

  it("returns [] when audit_ignore key is absent", () => {
    w("config.yml", "profile: full\nadr_enabled: false\n");
    expect(readAuditIgnoreList(pmDir)).toEqual([]);
  });

  it("parses single entry from block list", () => {
    w("config.yml", [
      "profile: full",
      "audit_ignore:",
      '  - key: "decision-contradiction:DECISION-A:DECISION-B"',
      "",
    ].join("\n"));
    expect(readAuditIgnoreList(pmDir)).toEqual(["decision-contradiction:DECISION-A:DECISION-B"]);
  });

  it("parses multiple entries from block list", () => {
    w("config.yml", [
      "profile: full",
      "audit_ignore:",
      '  - key: "decision-contradiction:DECISION-A:DECISION-B"',
      '  - key: "decision-contradiction:DECISION-C:DECISION-D"',
      "",
    ].join("\n"));
    expect(readAuditIgnoreList(pmDir)).toEqual([
      "decision-contradiction:DECISION-A:DECISION-B",
      "decision-contradiction:DECISION-C:DECISION-D",
    ]);
  });

  it("stops at next top-level key", () => {
    w("config.yml", [
      "profile: full",
      "audit_ignore:",
      '  - key: "decision-contradiction:DECISION-A:DECISION-B"',
      "adr_enabled: false",
    ].join("\n"));
    // Should NOT interpret adr_enabled as part of audit_ignore
    expect(readAuditIgnoreList(pmDir)).toEqual(["decision-contradiction:DECISION-A:DECISION-B"]);
  });

  it("handles entries without surrounding quotes", () => {
    w("config.yml", [
      "audit_ignore:",
      "  - key: decision-contradiction:DECISION-A:DECISION-B",
    ].join("\n"));
    expect(readAuditIgnoreList(pmDir)).toEqual(["decision-contradiction:DECISION-A:DECISION-B"]);
  });

  it("returns [] for empty block list (no items)", () => {
    w("config.yml", [
      "audit_ignore:",
    ].join("\n"));
    expect(readAuditIgnoreList(pmDir)).toEqual([]);
  });
});
