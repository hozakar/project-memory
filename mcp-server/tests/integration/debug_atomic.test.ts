import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { atomicRebuild, getTable, getConnection, dbPath } from "../../src/db";
import * as path from "path";
import { findDecisionConflicts } from "../../src/tools/find_decision_conflicts";
import type { LanceRecord } from "../../src/types";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;

  fs.writeFileSync(
    join(tmp.pmDir, "config.yml"),
    "adr_enabled: false\naudit_ignore: []\n",
  );

  const phasesDir = join(tmp.pmDir, "phases");
  fs.mkdirSync(phasesDir, { recursive: true });
  fs.writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
});

afterAll(() => {
  try { tmp.cleanup(); } catch {}
});

describe("debug findDecisionConflicts internals", () => {
  it("trace each step", async () => {
    const records: LanceRecord[] = [
      { id: "D1", type: "decision", title: "Test A", text: "test a", vector: new Array(384).fill(0), status: "active" },
      { id: "D2", type: "decision", title: "Test B", text: "test b", vector: new Array(384).fill(0.5), status: "active" },
    ];

    await atomicRebuild(records);
    
    // Step through what findDecisionConflicts does
    const pmDir = path.resolve(tmp.pmDir);
    const projectRoot = path.dirname(pmDir);
    console.log("pmDir:", pmDir);
    console.log("projectRoot:", projectRoot);
    console.log("dbPath():", dbPath());
    
    process.env.PROJECT_MEMORY_DIR = projectRoot;
    
    const table = await getTable();
    
    // Try query WITHOUT where clause
    const allRows = await table.query().toArray();
    console.log("all rows:", allRows.length);
    for (const r of allRows) {
      console.log("  row:", r.id, r.title, "status:", r.status, "type:", r.type);
    }
    
    // Try query WITH where clause
    const filteredRows = await table.query()
      .where("type = 'decision' AND (status IS NULL OR status != 'superseded')")
      .toArray();
    console.log("filtered rows:", filteredRows.length);
    
    // Try simpler where
    const simpleWhere = await table.query()
      .where("type = 'decision'")
      .toArray();
    console.log("type='decision' rows:", simpleWhere.length);
    
    // Now try findDecisionConflicts directly
    const result = await findDecisionConflicts(tmp.pmDir, 0.0, 50);
    console.log("findDecisionConflicts result count:", result.length);
  });
});
