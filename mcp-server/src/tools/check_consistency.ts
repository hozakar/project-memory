import * as fs from "fs";
import * as path from "path";
import { listAllIds } from "../db";
import type { ConsistencyReport } from "../types";

/**
 * Compares the vector DB index against the filesystem to find inconsistencies.
 *
 * @param {string} projectMemoryDir - Absolute path to the `.project-memory/` directory.
 * Covers phases, decisions, discussions, eras, instructions, and assignments.
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

    // c. Extract discussion IDs from discussions/DISCUSSION-*.md filenames
    const discussionsDir = path.join(projectMemoryDir, "discussions");
    if (fs.existsSync(discussionsDir)) {
      const entries = fs.readdirSync(discussionsDir);
      for (const entry of entries) {
        if (entry.startsWith("DISCUSSION-") && entry.endsWith(".md")) {
          const id = entry.slice(0, -3); // strip .md extension
          filesystemIds.add(id);
        }
      }
    }

    // d. Extract era IDs from eras/era-NNN.md filenames
    const erasDir = path.join(projectMemoryDir, "eras");
    if (fs.existsSync(erasDir)) {
      const entries = fs.readdirSync(erasDir);
      for (const entry of entries) {
        if (/^era-[0-9]{3,}\.md$/.test(entry)) {
          filesystemIds.add(entry.slice(0, -3)); // "era-001"
        }
      }
    }

    // e. Extract instruction IDs from instructions/INSTRUCTION-*.md filenames
    const instructionsDir = path.join(projectMemoryDir, "instructions");
    if (fs.existsSync(instructionsDir)) {
      const entries = fs.readdirSync(instructionsDir);
      for (const entry of entries) {
        if (entry.startsWith("INSTRUCTION-") && entry.endsWith(".md")) {
          const id = entry.slice(0, -3); // strip .md extension
          filesystemIds.add(id);
        }
      }
    }

    // f. Extract assignment IDs from assignments/ASSIGNMENT-*.md filenames
    const assignmentsDir = path.join(projectMemoryDir, "assignments");
    if (fs.existsSync(assignmentsDir)) {
      const entries = fs.readdirSync(assignmentsDir);
      for (const entry of entries) {
        if (entry.startsWith("ASSIGNMENT-") && entry.endsWith(".md")) {
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
      if (id.includes("__commit__")) continue; // commit records are not file-backed
      if (!filesystemIds.has(id)) {
        orphaned.push(id);
      }
    }

    return { missing, orphaned };
  } catch {
    return { missing: [], orphaned: [] };
  }
}