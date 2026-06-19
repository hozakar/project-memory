/**
 * CI P@1 evaluation harness for stress-test corpus.
 *
 * Runs 15 queries, checks that top-1 result matches expected keyword(s),
 * asserts P@1 >= 14/15.
 *
 * Usage: npx tsx stress-test/eval.ts <generated-dir>
 * Exit 0 = PASS (P@1 >= 14/15). Exit 1 = FAIL.
 *
 * Keyword lists match template-mode corpus IDs/titles.
 * Update EXPECTED after corpus template renames.
 */
import * as path from "path";
import * as fs from "fs";

const generatedDir = process.argv[2];
if (!generatedDir) {
  console.error("Usage: npx tsx stress-test/eval.ts <path-to-generated-dir>");
  process.exit(1);
}
const resolvedDir = path.resolve(generatedDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`Error: directory not found: ${resolvedDir}`);
  process.exit(1);
}
process.env.PROJECT_MEMORY_DIR = resolvedDir;

interface Expectation {
  id: number;
  label: string;
  query: string;
  keywords: string[];
  typeFilter?: string;
  outcomeTypeFilter?: string;
  diversify?: boolean;
}

const EXPECTED: Expectation[] = [
  {
    id: 1, label: "Connection pooling alternatives",
    query: "database connection pooling strategy alternatives evaluated rejected reasons",
    keywords: ["connection-pool", "db-pool", "pooling", "pool"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 2, label: "Event sourcing conflicts",
    query: "event sourcing architecture conflicts early project decisions",
    keywords: ["event-sourc", "event_sourc"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 3, label: "API gateway migration cluster",
    query: "API gateway migration phases decisions deferred follow-up unresolved",
    keywords: ["api-gateway", "gateway", "api_gateway"],
    diversify: true,
  },
  {
    id: 4, label: "Database lock-in",
    query: "primary database choice secondary decisions lock-in costly to reverse",
    keywords: ["database", "primary-db", "db-choice", "db-select"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 5, label: "Auth early constraints",
    query: "authentication session management early decisions constraints shaped later",
    keywords: ["auth", "session", "login", "identity"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 6, label: "Migration data integrity",
    query: "migration schema change traffic cutover silent data integrity risk mitigation",
    keywords: ["migrat"],
    diversify: true,
  },
  {
    id: 7, label: "Cache invalidation contradictions",
    query: "caching strategy invalidation stale reads contradictory across services",
    keywords: ["cach"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 8, label: "Infra deployment failure patterns",
    query: "infrastructure deployment failure modes lessons learned recurring systemic gap",
    keywords: ["deploy", "infra", "infrastructure", "release"],
    typeFilter: "discussion", diversify: true,
  },
  {
    id: 9, label: "Security × api/auth/payments",
    query: "security constraint API authentication payments decisions",
    keywords: ["security", "auth", "payment", "oauth"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 10, label: "Discussions with no outcome",
    query: "architecture discussion deferred no consensus competing constraints unresolved revisit",
    keywords: [],
    typeFilter: "discussion", outcomeTypeFilter: "none", diversify: true,
  },
  {
    id: 11, label: "Message broker replacement",
    query: "async message broker choice alternatives rejected dependent decisions",
    keywords: ["broker", "message-queue", "rabbitmq", "kafka", "message"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 12, label: "REST → gRPC migration",
    query: "REST HTTP internal service communication protocol assumptions decisions phases",
    keywords: ["grpc", "rest", "http", "protocol"],
    diversify: true,
  },
  {
    id: 13, label: "bcrypt → Argon2id",
    query: "password hashing bcrypt algorithm security credential storage downstream",
    keywords: ["password", "hash", "bcrypt", "argon", "credential"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 14, label: "Object storage consolidation",
    query: "object storage provider backend data residency compliance constraint consolidation",
    keywords: ["storage", "s3", "object-store", "blob", "gcs", "minio"],
    typeFilter: "decision", diversify: true,
  },
  {
    id: 15, label: "Data warehouse / ETL migration",
    query: "data warehouse ETL pipeline schema data model retention policy analytics migration",
    keywords: ["warehouse", "etl", "data-model", "analytics", "lakehouse", "data-warehouse"],
    diversify: true,
  },
];

async function main() {
  const { searchMemory } = await import("../mcp-server/src/tools/search_memory");

  let hits = 0;
  const lines: string[] = [];

  for (const exp of EXPECTED) {
    const res = await searchMemory(
      exp.query, 5, false, undefined,
      exp.typeFilter, undefined, undefined, undefined, undefined, undefined,
      exp.outcomeTypeFilter, exp.diversify
    );

    if (res.length === 0) {
      lines.push(`Q${String(exp.id).padStart(2)} MISS (no results): ${exp.label}`);
      continue;
    }

    const top = res[0];
    const haystack = ((top.id ?? "") + " " + (top.title ?? "")).toLowerCase();
    const isHit = exp.keywords.length === 0
      ? true
      : exp.keywords.some(kw => haystack.includes(kw.toLowerCase()));

    if (isHit) {
      hits++;
      lines.push(`Q${String(exp.id).padStart(2)} HIT  (${((top as { similarity?: number }).similarity ?? 0).toFixed(3)}): ${top.id}`);
    } else {
      lines.push(`Q${String(exp.id).padStart(2)} MISS: got "${top.id}" — expected keyword(s): [${exp.keywords.join(", ")}]`);
    }
  }

  lines.forEach(l => console.log(l));
  console.log(`\nP@1: ${hits}/15  (threshold: 14/15)`);

  if (hits < 14) {
    console.error("FAIL: P@1 below threshold — search regression detected");
    process.exit(1);
  }
  console.log("PASS");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
