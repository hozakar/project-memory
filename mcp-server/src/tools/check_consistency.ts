import * as fs from "fs";
import * as path from "path";
import { listAllIds } from "../db";
import type { ConsistencyReport } from "../types";

/**
 * Compares the vector DB index against the filesystem to find inconsistencies.
 *
 * @param {string} projectMemoryDir - Absolute path to the `.project-memory/` directory.
 * @returns {Promise<ConsistencyReport>} Report with missing and orphaned IDs.
 */
export async function checkConsistency(
  projectMemoryDir: string
): Promise<ConsistencyReport> {
  try {
    // 1. Collect filesystem IDs
    const filesystemIds = new Set<string>();

    // a. Extract phase IDs from phases/index.yml using regex
    const indexPath = path.join(projectMemoryDir, "phases", "index.yml");
    if (fs.existsSync(indexPath)) {
      const ymlText = fs.readFileSync(indexPath, "utf-8");
      const phaseIdRegex = /^\s+- id:\s+(.+)$/gm;
      let match: RegExpExecArray | null;
      while ((match = phaseIdRegex.exec(ymlText)) !== null) {
        // Trim whitespace and surrounding quotes from the captured ID
        const rawId = match[1].trim();
        const cleanId = rawId.replace(/^['"]|['"]$/g, "");
        filesystemIds.add(cleanId);
      }
    }

    // b. Extract decision IDs from decisions/DECISION-*.md filenames
    const decisionsDir = path.join(projectMemoryDir, "decisions");
    if (fs.existsSync(decisionsDir)) {
      const entries = fs.readdirSync(decisionsDir);
      for (const entry of entries) {
        if (entry.startsWith("DECISION-") && entry.endsWith(".md")) {
          const id = entry.slice(0, -3); // strip .md extension
          filesystemIds.add(id);
        }
      }
    }

    // 2. Get DB IDs, filter out __init__
    const dbIdList = await listAllIds();
    const dbIds = new Set<string>(dbIdList.filter((id) => id !== "__init__"));

    // 3. Compute differences
    const missing: string[] = [];
    const orphaned: string[] = [];

    for (const id of filesystemIds) {
      if (!dbIds.has(id)) {
        missing.push(id);
      }
    }

    for (const id of dbIds) {
      if (!filesystemIds.has(id)) {
        orphaned.push(id);
      }
    }

    return { missing, orphaned };
  } catch {
    return { missing: [], orphaned: [] };
  }
}