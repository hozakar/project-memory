import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import * as fs from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import {
  findDecisionConflicts,
  pairKey,
} from "../../src/tools/find_decision_conflicts";
import { atomicRebuild } from "../../src/db";
import type { LanceRecord } from "../../src/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a 384-dim vector with specified leading values (rest are 0). */
function makeVector(...values: number[]): number[] {
  const v = new Array(384).fill(0);
  for (let i = 0; i < Math.min(values.length, 384); i++) {
    v[i] = values[i];
  }
  return v;
}

/** Build a minimal decision LanceRecord for conflict testing. */
function makeDecision(
  id: string,
  title: string,
  vector: number[],
  status: string = "active",
): LanceRecord {
  return { id, type: "decision", title, text: title, vector, status };
}

// ---------------------------------------------------------------------------
// Fixed records with known pairwise cosine similarities.
//
// Vectors (384-dim, only first 5 entries shown):
//   D1: [1,   0,   0,   0,   0, …]  "ONNX Runtime"
//   D2: [0.9, 0.1, 0,   0,   0, …]  "ONNX Adopt"         → cos(D1,D2)=0.90
//   D3: [0.6, 0,   0.6, 0,   0, …]  "Mid Range"          → cos(D1,D3)=0.60
//                                                           cos(D2,D3)=0.54
//   D4: [0,   1,   0,   0,   0, …]  "Storage A"
//   D5: [0,   0.9, 0.1, 0,   0, …]  "Storage B"          → cos(D4,D5)=0.90
//   D6: identical to D1 but superseded
//
// Cross-pair similarities that fall between thresholds:
//   threshold=0.9 → (D1,D2), (D4,D5)         → 2 pairs
//   threshold=0.5 → + (D1,D3), (D2,D3)       → 4 pairs
// ---------------------------------------------------------------------------

const D1 = makeDecision("DECISION-0001", "First Decision — ONNX Runtime", makeVector(1, 0, 0, 0, 0));
const D2 = makeDecision("DECISION-0002", "Second Decision — ONNX Adopt", makeVector(0.9, 0.1, 0, 0, 0));
const D3 = makeDecision("DECISION-0003", "Third Decision — Mid Range", makeVector(0.6, 0, 0.6, 0, 0));
const D4 = makeDecision("DECISION-0004", "Fourth Decision — Storage A", makeVector(0, 1, 0, 0, 0));
const D5 = makeDecision("DECISION-0005", "Fifth Decision — Storage B", makeVector(0, 0.9, 0.1, 0, 0));
const D6 = makeDecision("DECISION-0006", "Superseded — ONNX Legacy", makeVector(1, 0, 0, 0, 0), "superseded");

let tmp: TmpDir;

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;

  // Write minimal config (clean slate for each test via beforeEach)
  fs.writeFileSync(
    join(tmp.pmDir, "config.yml"),
    "adr_enabled: false\naudit_ignore: []\n",
  );

  // phases/index.yml required by some parsing helpers
  const phasesDir = join(tmp.pmDir, "phases");
  fs.mkdirSync(phasesDir, { recursive: true });
  fs.writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
});

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // LanceDB may hold file handles on Windows; best-effort cleanup
  }
});

beforeEach(async () => {
  // Reset config.yml to clean state so tests don't leak audit_ignore
  fs.writeFileSync(
    join(tmp.pmDir, "config.yml"),
    "adr_enabled: false\naudit_ignore: []\n",
  );
});

/** Seed the LanceDB table with the given records (replace-all). */
async function seed(...records: LanceRecord[]): Promise<void> {
  await atomicRebuild(records);
}

// ---------------------------------------------------------------------------
// 1. Threshold filtering
// ---------------------------------------------------------------------------

describe("findDecisionConflicts — threshold filtering", () => {
  it("higher threshold returns fewer pairs than lower threshold", async () => {
    await seed(D1, D2, D3, D4, D5);

    const high = await findDecisionConflicts(tmp.pmDir, 0.9, 50);
    const low = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    // threshold=0.9: (D1,D2)=0.9, (D4,D5)=0.9   → 2
    // threshold=0.5: + (D1,D3)=0.6, (D2,D3)=0.54 → 4
    expect(high.length).toBeLessThan(low.length);
    expect(high.length).toBe(2);
    expect(low.length).toBe(4);
  });

  it("results are sorted by similarity descending", async () => {
    await seed(D1, D2, D3, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    for (let i = 1; i < results.length; i++) {
      expect(results[i].similarity).toBeLessThanOrEqual(
        results[i - 1].similarity,
      );
    }

    // Verify the highest-similarity pair comes first
    expect(results[0].similarity).toBeCloseTo(0.9, 5);
  });
});

// ---------------------------------------------------------------------------
// 2. audit_ignore exclusion
// ---------------------------------------------------------------------------

describe("findDecisionConflicts — audit_ignore exclusion", () => {
  it("excludes pairs listed in config.yml audit_ignore", async () => {
    await seed(D1, D2, D4, D5);

    // Add D1:D2 to audit_ignore
    fs.writeFileSync(
      join(tmp.pmDir, "config.yml"),
      [
        "adr_enabled: false",
        "audit_ignore:",
        '  - key: "decision-contradiction:DECISION-0001:DECISION-0002"',
        "",
      ].join("\n"),
    );

    const results = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    // Only (D4,D5) should survive
    expect(results.length).toBe(1);
    const pair = results[0];
    expect(
      (pair.idA === "DECISION-0004" && pair.idB === "DECISION-0005") ||
        (pair.idA === "DECISION-0005" && pair.idB === "DECISION-0004"),
    ).toBe(true);
  });

  it("still returns unignored pairs alongside ignored ones", async () => {
    await seed(D1, D2, D3, D4, D5);

    fs.writeFileSync(
      join(tmp.pmDir, "config.yml"),
      [
        "adr_enabled: false",
        "audit_ignore:",
        '  - key: "decision-contradiction:DECISION-0001:DECISION-0002"',
        "",
      ].join("\n"),
    );

    const results = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    // (D1,D2) must NOT appear
    const d1d2Present = results.some(
      (p) =>
        (p.idA === "DECISION-0001" && p.idB === "DECISION-0002") ||
        (p.idA === "DECISION-0002" && p.idB === "DECISION-0001"),
    );
    expect(d1d2Present).toBe(false);

    // Other pairs (D4,D5), (D1,D3), (D2,D3) should still be present
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(
      results.some(
        (p) =>
          (p.idA === "DECISION-0004" && p.idB === "DECISION-0005") ||
          (p.idA === "DECISION-0005" && p.idB === "DECISION-0004"),
      ),
    ).toBe(true);
    expect(
      results.some(
        (p) =>
          (p.idA === "DECISION-0001" && p.idB === "DECISION-0003") ||
          (p.idA === "DECISION-0003" && p.idB === "DECISION-0001"),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Result shape
// ---------------------------------------------------------------------------

describe("findDecisionConflicts — result shape", () => {
  it("each result has the expected fields", async () => {
    await seed(D1, D2, D3, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    expect(results.length).toBeGreaterThan(0);

    for (const pair of results) {
      // Required fields exist and have correct types
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

    const results = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    expect(results.length).toBeGreaterThan(0);

    for (const pair of results) {
      // Construct the canonical key: lexicographically sorted IDs joined by ":"
      const sortedIds = [pair.idA, pair.idB].sort();
      const expectedKey = `${sortedIds[0]}:${sortedIds[1]}`;

      // pairKey() from the source must produce the same result
      expect(pairKey(pair.idA, pair.idB)).toBe(expectedKey);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Superseded exclusion
// ---------------------------------------------------------------------------

describe("findDecisionConflicts — superseded exclusion", () => {
  it("superseded decisions are excluded from conflict candidates", async () => {
    // D1, D2, D4, D5 are active; D6 is superseded (same vector as D1)
    await seed(D1, D2, D6, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    // If superseded were NOT excluded, D6 would pair with D1 (sim=1.0) and D2 (sim=0.9),
    // producing additional pairs. With exclusion, only active records are considered.
    // For this set: (D1,D2)=0.9, (D4,D5)=0.9 → 2 pairs.
    expect(results.length).toBe(2);

    // D6 must not appear anywhere
    for (const pair of results) {
      expect(pair.idA).not.toBe("DECISION-0006");
      expect(pair.idB).not.toBe("DECISION-0006");
    }
  });

  it("active decisions still produce conflict pairs among themselves", async () => {
    // D1 (active), D6 (superseded) — D1 still pairs with any other active decision
    await seed(D1, D6, D4, D5);

    const results = await findDecisionConflicts(tmp.pmDir, 0.5, 50);

    // Only active-active pairs: (D4,D5)=0.9, and possibly (D1,D4)=0, (D1,D5)=0
    // At threshold 0.5, only (D4,D5) passes
    expect(results.length).toBe(1);

    // D6's ID must not appear
    for (const pair of results) {
      expect(pair.idA).not.toBe("DECISION-0006");
      expect(pair.idB).not.toBe("DECISION-0006");
    }
  });
});
