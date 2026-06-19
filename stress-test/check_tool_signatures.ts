/**
 * Checks that search_memory parameter docs are in sync with server.ts Zod schema.
 *
 * Parses the srv.tool("search_memory", ...) block in server.ts by text, extracts
 * every `    <name>: z.` parameter, then verifies each name appears in both
 * mcp-integration.md and mcp-server/README.md.
 *
 * Run: npx tsx stress-test/check_tool_signatures.ts
 * Exit 0 = in sync. Exit 1 = drift detected.
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf-8");
}

function extractSearchMemoryParams(serverTs: string): string[] {
  // Isolate the search_memory tool registration block:
  // starts at `"search_memory",` and ends at the closing async handler line
  const startIdx = serverTs.indexOf('"search_memory"');
  if (startIdx === -1) throw new Error('Could not find "search_memory" in server.ts');
  const endIdx = serverTs.indexOf("async (args:", startIdx);
  if (endIdx === -1) throw new Error("Could not find async handler in search_memory block");
  const block = serverTs.slice(startIdx, endIdx);
  // Extract lines like `    query: z.` or `    include_superseded: z.`
  const matches = Array.from(block.matchAll(/^\s{4}(\w+):\s*z\./gm));
  return matches.map(m => m[1]);
}

const serverTs = read("mcp-server/src/server.ts");
const mcpIntegration = read("mcp-integration.md");
const readme = read("mcp-server/README.md");

let params: string[];
try {
  params = extractSearchMemoryParams(serverTs);
} catch (e: unknown) {
  console.error("Parse error:", e);
  process.exit(1);
}

if (params.length === 0) {
  console.error("ERROR: No search_memory params extracted — check server.ts structure.");
  process.exit(1);
}

console.log(`search_memory params in server.ts (${params.length}): ${params.join(", ")}`);

const errors: string[] = [];
for (const param of params) {
  if (!mcpIntegration.includes(param)) {
    errors.push(`mcp-integration.md missing: ${param}`);
  }
  if (!readme.includes(param)) {
    errors.push(`mcp-server/README.md missing: ${param}`);
  }
}

if (errors.length === 0) {
  console.log("OK: all search_memory params are documented in both mcp-integration.md and mcp-server/README.md");
} else {
  console.error(`DRIFT: ${errors.length} discrepancy(s):`);
  errors.forEach(e => console.error(`  ${e}`));
  process.exit(1);
}
