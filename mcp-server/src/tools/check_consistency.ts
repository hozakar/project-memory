import * as fs from "fs";
import * as path from "path";
import { listAllIds } from "../db";
import type { ConsistencyReport } from "../types";

/**
 * Compares the vector DB index against the filesystem to find inconsistencies.
 *
 * @param {string} projectMemoryDir - Absolute path to the `.project-memory/` directory.
 * Covers decisions, discussions, instructions, and notes.
 *
 * Phases and assignments are dropped concepts and are no longer scanned on the
 * filesystem side: neither has an index tool left to satisfy a `missing` entry, so
 * reporting them produced findings the caller could never act on.
 *
 * The two differ on the orphan side. Legacy `phase-*` rows stay in the DB by design —
 * they remain searchable for historical lookup — so they are skipped there too.
 * `ASSIGNMENT-*` rows are not: the feature is being removed, and their files are gone,
 * so they must surface as orphaned exactly once and let Cat 13 purge them. Skipping
 * them would strand them in the DB permanently, still answering broad searches.
 * @returns {Promise<ConsistencyReport>} Report with missing and orphaned IDs.
 */
export async function checkConsistency(
  projectMemoryDir: string
): Promise<ConsistencyReport> {
  try {
    // 1. Collect filesystem IDs
    const filesystemIds = new Set<string>();

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

    // d. Extract instruction IDs from instructions/INSTRUCTION-*.md filenames
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

    // g. Extract note IDs from notes/NOTE-*.md filenames
    const notesDir = path.join(projectMemoryDir, "notes");
    if (fs.existsSync(notesDir)) {
      const entries = fs.readdirSync(notesDir);
      for (const entry of entries) {
        if (entry.startsWith("NOTE-") && entry.endsWith(".md")) {
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
      // Legacy phase rows are retained in the DB for historical search. They have no
      // filesystem counterpart by design, so they are not orphans.
      if (id.startsWith("phase-")) continue;
      if (!filesystemIds.has(id)) {
        orphaned.push(id);
      }
    }

    return { missing, orphaned };
  } catch (err) {
    console.error("check_consistency failed:", err);
    return { missing: [], orphaned: [] };
  }
}