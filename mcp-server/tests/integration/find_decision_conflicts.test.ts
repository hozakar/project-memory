import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { getTable } from "../../src/db";
import { findDecisionConflicts, pairKey } from "../../src/tools/find_decision_conflicts";
import type { LanceRecord } from "../../src/types";

let tmp: TmpDir;

/** Clear the table then seed records with known vectors. */
async function seed(...records: LanceRecord[]): Promise<void> {
  const table = await getTable();
  await table.delete("id IS NOT NULL");
  if (records.length > 0) {
    await table.add(records);
  }
}

/** Create a 384-dim vector with specified leading values (rest are 0). */
function makeVector(...values: number[]): number[] {
  const v = new Array(384).fill(0);
  for (let i = 0; i < Math.min(values.length, 384); i++) v[i] = values[i];
  return v;
}

function makeDecision(id: string, title: string, vector: number[], status = "active"): LanceRecord {
  return { id, type: "decision", title, text: title, vector, status };
}

// Known pairwise cosine similarities (dot product of our vectors).
// Using values exactly representable in binary float32:
//   D1: [1,    0,     0,  …]
//   D2: [0.75, 0.25,  0,  …]  dot(D1,D2)=0.75 (3×2⁻²)
//   D3: [0.5,  0,     0.5,…]  dot(D1,D3)=0.50 (2⁻¹)   dot(D2,D3)=0.375 (3×2⁻³)
//   D4: [0,    1,     0,  …]
//   D5: [0,    0.75,  0.25,…]  dot(D4,D5)=0.75 (3×2⁻²)
//   D6: [1,    0,     0,  …]  superseded → excluded
const D1 = makeDecision("DECISION-0001", "ONNX Runtime", makeVector(1, 0, 0, 0, 0));
const D2 = makeDecision("DECISION-0002", "ONNX Adopt", makeVector(0.75, 0.25, 0, 0, 0));
const D3 = makeDecision("DECISION-0003", "Mid Range", makeVector(0.5, 0, 0.5, 0, 0));
const D4 = makeDecision("DECISION-0004", "Storage A", makeVector(0, 1, 0, 0, 0));
const D5 = makeDecision("DECISION-0005", "Storage B", makeVector(0, 0.75, 0.25, 0, 0));
const D6 = makeDecision("DECISION-0006", "Superseded ONNX", makeVector(1, 0, 0, 0, 0), "superseded");

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
  fs.writeFileSync(join(tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");
  const phasesDir = join(tmp.pmDir, "phases");
  fs.mkdirSync(phasesDir, { recursive: true });
  fs.writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
});

afterAll(() => {
  try { tmp.cleanup(); } catch { /* Windows best-effort */ }
});

beforeEach(async () => {
  fs.writeFileSync(join(tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");
});

// ============================================================================
// 1. Threshold filtering
// ============================================================================
describe("findDecisionConflicts — threshold filtering", () => {
  it("higher threshold returns fewer pairs than lower threshold", async () => {
    await seed(D1, D2, D3, D4, D5);

    const high = await findDecisionConflicts(tmp.pmDir, 0.75, 50);
    const low = await findDecisionConflicts(tmp.pmDir, 0.3, 50);

    // threshold=0.75: (D1,D2)=0.75, (D4,D5)=0.75 → 2 pairs
    // threshold=0.30: + (D1,D3)=0.50, (D2,D3)=0.375 → 4 pairs
    expect(high.length).toBeLessThan(low.length);
    expect(high.length).toBe(2);
    expect(low.length).toBe(4);
  });

  it("results are sorted by similarity descending", async () => {
    await seed(D1, D2, D3, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.3, 50);

    for (let i = 1; i < results.length; i++) {
      expect(results[i].similarity).toBeLessThanOrEqual(results[i - 1].similarity);
    }
    expect(results[0].similarity).toBeCloseTo(0.75, 5);
  });
});

// ============================================================================
// 2. audit_ignore exclusion
// ============================================================================
describe("findDecisionConflicts — audit_ignore exclusion", () => {
  it("excludes pairs listed in config.yml audit_ignore", async () => {
    await seed(D1, D2, D4, D5);

    fs.writeFileSync(
      join(tmp.pmDir, "config.yml"),
      ["adr_enabled: false", "audit_ignore:", '  - key: "decision-contradiction:DECISION-0001:DECISION-0002"', ""].join("\n"),
    );

    const results = await findDecisionConflicts(tmp.pmDir, 0.3, 50);
    expect(results.length).toBe(1);
    expect(results[0].idA).toBe("DECISION-0004");
    expect(results[0].idB).toBe("DECISION-0005");
  });

  it("still returns unignored pairs alongside ignored ones", async () => {
    await seed(D1, D2, D3, D4, D5);
    fs.writeFileSync(
      join(tmp.pmDir, "config.yml"),
      ["adr_enabled: false", "audit_ignore:", '  - key: "decision-contradiction:DECISION-0001:DECISION-0002"', ""].join("\n"),
    );

    const results = await findDecisionConflicts(tmp.pmDir, 0.3, 50);

    // (D1,D2) must NOT appear
    expect(results.some(p =>
      (p.idA === "DECISION-0001" && p.idB === "DECISION-0002") ||
      (p.idA === "DECISION-0002" && p.idB === "DECISION-0001")
    )).toBe(false);

    // Remaining: (D4,D5)=0.75, (D1,D3)=0.5, (D2,D3)=0.375 → 3 pairs
    expect(results.length).toBe(3);
  });
});

// ============================================================================
// 3. Result shape
// ============================================================================
describe("findDecisionConflicts — result shape", () => {
  it("each result has the expected fields with correct types", async () => {
    await seed(D1, D2, D3, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.3, 50);
    expect(results.length).toBeGreaterThan(0);

    for (const pair of results) {
      expect(pair).toHaveProperty("idA");
      expect(typeof pair.idA).toBe("string");
      expect(pair).toHaveProperty("idB");
      expect(typeof pair.idB).toBe("string");
      expect(pair).toHaveProperty("titleA");
      expect(typeof pair.titleA).toBe("string");
      expect(pair).toHaveProperty("titleB");
      expect(typeof pair.titleB).toBe("string");
      expect(pair).toHaveProperty("similarity");
      expect(typeof pair.similarity).toBe("number");
      expect(pair.similarity).toBeGreaterThanOrEqual(0);
      expect(pair.similarity).toBeLessThanOrEqual(1);
    }
  });

  it("pair key follows canonical sorted-IDs-joined-by-colon format", async () => {
    await seed(D1, D2, D3, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.3, 50);
    expect(results.length).toBeGreaterThan(0);

    for (const pair of results) {
      const sorted = [pair.idA, pair.idB].sort();
      const expectedKey = `${sorted[0]}:${sorted[1]}`;
      expect(pairKey(pair.idA, pair.idB)).toBe(expectedKey);
    }
  });
});

// ============================================================================
// 4. Superseded exclusion
// ============================================================================
describe("findDecisionConflicts — superseded exclusion", () => {
  it("superseded decisions are excluded from conflict candidates", async () => {
    await seed(D1, D2, D6, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.3, 50);

    // Only active records: (D1,D2)=0.75, (D4,D5)=0.75 → 2 pairs
    // (D1,D6) would be 1.0 but D6 is superseded and excluded
    expect(results.length).toBe(2);
    for (const pair of results) {
      expect(pair.idA).not.toBe("DECISION-0006");
      expect(pair.idB).not.toBe("DECISION-0006");
    }
  });

  it("active decisions still conflict among themselves when superseded ones exist", async () => {
    await seed(D1, D6, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.3, 50);

    // Only active pair exceeding 0.3: (D4,D5)=0.75 → 1 pair
    // (D1,D6) excluded since D6 is superseded
    expect(results.length).toBe(1);

    // Must not include the superseded decision
    for (const pair of results) {
      expect(pair.idA).not.toBe("DECISION-0006");
      expect(pair.idB).not.toBe("DECISION-0006");
    }
  });
});
