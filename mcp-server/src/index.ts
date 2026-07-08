import * as path from "path";
import * as fs from "fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { server } from "./server";
import { startBackgroundAudit } from "./tools/background_audit";

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Head-start: begin the silent background audit on connect (best-effort).
  // The SKILL.md On-Load call is the reliable trigger; this is a bonus that
  // deduplicates via the in-flight guard in startBackgroundAudit.
  try {
    const root = process.env.PROJECT_MEMORY_DIR ?? process.cwd();
    const pmDir = path.join(root, ".project-memory");
    if (fs.existsSync(pmDir)) {
      void startBackgroundAudit(pmDir, "standard");
    }
  } catch {
    // best-effort; the SKILL.md On-Load call is the reliable trigger
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});