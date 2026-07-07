/**
 * Stress-test query runner for project-memory.
 *
 * Runs the 15 queries from queries.md against the generated stress-test index
 * and prints similarity-scored results for manual quality evaluation.
 *
 * Usage (from repo root):
 *   npx tsx stress-test/query.ts stress-test/generated
 *
 * PROJECT_MEMORY_DIR must be set before db-touching modules load — same
 * constraint as index.ts. Uses dynamic await import() inside main().
 */

import * as path from "path";
import * as fs from "fs";

const generatedDir = process.argv[2];
if (!generatedDir) {
  console.error("Usage: npx tsx stress-test/query.ts <path-to-generated-dir>");
  process.exit(1);
}

const resolvedDir = path.resolve(generatedDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`Error: directory not found: ${resolvedDir}`);
  process.exit(1);
}

process.env.PROJECT_MEMORY_DIR = resolvedDir;

// ── Query definitions ──────────────────────────────────────────────────────

interface Query {
  id: number;
  category: string;
  label: string;
  query: string;
  typeFilter?: string;
  outcomeTypeFilter?: string;
  diversify?: boolean;
}

const QUERIES: Query[] = [
  // Temporal
  {
    id: 1,
    category: "Temporal",
    label: "Connection pooling alternatives",
    query: "database connection pooling strategy alternatives evaluated rejected reasons",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 2,
    category: "Temporal",
    label: "Event sourcing conflicts with early decisions",
    query: "event sourcing architecture conflicts early project decisions",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 3,
    category: "Temporal",
    label: "API gateway migration cluster",
    query: "API gateway migration decisions deferred follow-up unresolved",
    diversify: true,
  },
  {
    id: 4,
    category: "Temporal",
    label: "Lock-in after primary database choice",
    query: "primary database choice secondary decisions lock-in costly to reverse",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 5,
    category: "Temporal",
    label: "Auth / session early constraints",
    query: "authentication session management early decisions constraints shaped later",
    typeFilter: "decision",
    diversify: true,
  },
  // Cross-cutting semantic
  {
    id: 6,
    category: "Cross-cutting",
    label: "Migration data integrity risks",
    query: "migration schema change traffic cutover silent data integrity risk mitigation",
    diversify: true,
  },
  {
    id: 7,
    category: "Cross-cutting",
    label: "Contradictory cache invalidation strategies",
    query: "caching strategy invalidation stale reads contradictory across services",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 8,
    category: "Cross-cutting",
    label: "Infrastructure deployment failure patterns",
    query: "infrastructure deployment failure modes lessons learned recurring systemic gap",
    typeFilter: "discussion",
    diversify: true,
  },
  {
    id: 9,
    category: "Cross-cutting",
    label: "Security × API/auth/payments",
    query: "security constraint API authentication payments decisions",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 10,
    category: "Cross-cutting",
    label: "Discussions with no outcome later addressed",
    query: "architecture discussion deferred no consensus competing constraints unresolved revisit",
    typeFilter: "discussion",
    outcomeTypeFilter: "none",
    diversify: true,
  },
  // Conflict detection
  {
    id: 11,
    category: "Conflict",
    label: "Message broker replacement",
    query: "async message broker choice alternatives rejected dependent decisions",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 12,
    category: "Conflict",
    label: "REST → gRPC migration impact",
    query: "REST HTTP internal service communication protocol assumptions decisions",
    diversify: true,
  },
  {
    id: 13,
    category: "Conflict",
    label: "bcrypt → Argon2id password hashing",
    query: "password hashing bcrypt algorithm security credential storage downstream",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 14,
    category: "Conflict",
    label: "Object storage consolidation constraints",
    query: "object storage provider backend data residency compliance constraint consolidation",
    typeFilter: "decision",
    diversify: true,
  },
  {
    id: 15,
    category: "Conflict",
    label: "Data warehouse / ETL lakehouse migration",
    query: "data warehouse ETL pipeline schema data model retention policy analytics migration",
    diversify: true,
  },
];

// ── Formatting ─────────────────────────────────────────────────────────────

function bar(score: number, width = 20): string {
  const filled = Math.round(score * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function fmt(score: number): string {
  return score.toFixed(3);
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const { searchMemory } = await import("../mcp-server/src/tools/search_memory");

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  project-memory stress-test — query quality evaluation");
  console.log(`  DB: ${resolvedDir}`);
  console.log("══════════════════════════════════════════════════════════════\n");

  let prevCategory = "";
  for (const q of QUERIES) {
    if (q.category !== prevCategory) {
      console.log(`\n─── ${q.category} ${"─".repeat(50 - q.category.length)}`);
      prevCategory = q.category;
    }

    const t0 = Date.now();
    const results = await searchMemory(q.query, 5, false, undefined, q.typeFilter, undefined, undefined, undefined, undefined, undefined, q.outcomeTypeFilter, q.diversify);
    const ms = Date.now() - t0;

    console.log(`\nQ${q.id}: ${q.label}${q.typeFilter ? ` [${q.typeFilter}]` : ""}`);
    console.log(`     "${q.query.slice(0, 72)}${q.query.length > 72 ? "…" : ""}"`);

    if (results.length === 0) {
      console.log("     (no results)");
    } else {
      for (const r of results) {
        const score = (r as { similarity?: number }).similarity ?? 0;
        const label = r.title ?? r.id;
        const truncated = label.length > 55 ? label.slice(0, 52) + "…" : label.padEnd(55);
        console.log(`     ${bar(score)} ${fmt(score)}  ${truncated}  [${r.id}]`);
      }
    }
    console.log(`     (${ms}ms)`);
  }

  console.log("\n══════════════════════════════════════════════════════════════\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
