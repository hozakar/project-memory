import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { atomicRebuild, getTable, getConnection } from "./src/db.js";

const dir = mkdtempSync(join(tmpdir(), "pm-debug-"));
const pmDir = join(dir, ".project-memory");
mkdirSync(pmDir, { recursive: true });
process.env.PROJECT_MEMORY_DIR = dir;

console.log("Dir:", dir);
console.log("pmDir:", pmDir);

async function main() {
  // 1. Try atomicRebuild
  const r = await atomicRebuild([
    { id: "DECISION-TEST-1", type: "decision", title: "Test A", text: "test a", vector: new Array(384).fill(0), status: "active" },
    { id: "DECISION-TEST-2", type: "decision", title: "Test B", text: "test b", vector: new Array(384).fill(0.5), status: "active" },
  ]);
  console.log("atomicRebuild result:", JSON.stringify(r));

  // 2. Query the table directly
  const table = await getTable();
  const rows = await table.query().toArray();
  console.log("rows found:", rows.length);
  for (const row of rows) {
    console.log("  row:", row.id, "|", row.title, "| status:", row.status, "| type:", row.type);
  }

  // 3. Try findDecisionConflicts
  const { findDecisionConflicts } = await import("./src/tools/find_decision_conflicts.js");
  const results = await findDecisionConflicts(pmDir, 0.5, 50);
  console.log("findDecisionConflicts results:", results.length);
  for (const p of results) {
    console.log("  pair:", p.idA, "|", p.idB, "| sim:", p.similarity);
  }
}

main().catch(e => console.error("ERROR:", e.message, e.stack));
