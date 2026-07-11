import * as fs from "fs";
import * as path from "path";
import { getTable } from "../db";
import type { ConflictPair } from "../types";

/**
 * Compute cosine similarity between two vectors.
 * Vectors are assumed to be L2-normalized (cosine sim = dot product).
 * Result is clamped to [0, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return Math.max(0, Math.min(1, dot));
}

/**
 * Generate a canonical pair key by sorting two IDs lexicographically and joining with ":".
 */
export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
}

/**
 * Check if a pair is in the audit_ignore list.
 * The ignore list contains entries like "decision-contradiction:<ID1>:<ID2>".
 */
export function isIgnored(idA: string, idB: string, ignoreList: string[]): boolean {
  const key = `decision-contradiction:${pairKey(idA, idB)}`;
  return ignoreList.some(entry => entry === key);
}

/**
 * Read audit_ignore key entries from config.yml.
 * Extracts the section between `audit_ignore:` and the next top-level key or EOF.
 * Handles both inline empty list (`audit_ignore: []`) and block list format
 * (`audit_ignore:\n  - key: "..."`).
 */
export function readAuditIgnoreList(projectMemoryDir: string): string[] {
  const configPath = path.join(projectMemoryDir, "config.yml");
  let content: string;
  try {
    content = fs.readFileSync(configPath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.split("\n");

  // Find the audit_ignore: line
  let auditIgnoreIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === "audit_ignore:" || trimmed.startsWith("audit_ignore:")) {
      auditIgnoreIdx = i;
      break;
    }
  }

  if (auditIgnoreIdx < 0) return [];

  const auditIgnoreLine = lines[auditIgnoreIdx].trim();

  // Case 1: inline empty list → audit_ignore: []
  if (auditIgnoreLine.includes("[]")) return [];

  // Case 2: block list format with - key: entries
  if (auditIgnoreLine === "audit_ignore:" || auditIgnoreLine.startsWith("audit_ignore:")) {
    const ignoreKeys: string[] = [];
    for (let i = auditIgnoreIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (trimmed === "") continue;
      // Next top-level key (not indented) → stop
      if (!line.startsWith(" ") && !line.startsWith("\t")) break;
      // Match - key: "..." or - key: ...
      const keyMatch = trimmed.match(/^-\s+key:\s+"?([^"\n]+)"?/);
      if (keyMatch) {
        ignoreKeys.push(keyMatch[1].trim());
      }
    }
    return ignoreKeys;
  }

  return [];
}

export async function findDecisionConflicts(
  projectMemoryDir: string,
  threshold: number = 0.75,
  topK: number = 10
): Promise<ConflictPair[]> {
  try {
    if (topK <= 0) return [];

    // Set up PROJECT_MEMORY_DIR for db connection
    const pmDir = path.resolve(projectMemoryDir);
    const projectRoot = path.dirname(pmDir);
    process.env.PROJECT_MEMORY_DIR = projectRoot;

    // Read audit_ignore
    const ignoreList = readAuditIgnoreList(projectMemoryDir);

    // Fetch all active (non-superseded) decision records from the DB
    const table = await getTable();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await table.query()
      .where("type = 'decision' AND (status IS NULL OR status != 'superseded')")
      .toArray();

    if (rows.length < 2) return [];

    // Extract id, title, vector
    const decisions: Array<{ id: string; title: string; vector: number[] }> = rows.map(
      (r: Record<string, unknown>) => ({
        id: r.id as string,
        title: r.title as string,
        vector: r.vector as number[],
      })
    );

    // Generate all pairs and compute cosine similarity
    const pairs: Array<{ idA: string; titleA: string; idB: string; titleB: string; similarity: number }> = [];

    for (let i = 0; i < decisions.length; i++) {
      for (let j = i + 1; j < decisions.length; j++) {
        const sim = cosineSimilarity(decisions[i].vector, decisions[j].vector);
        if (sim >= threshold) {
          if (!isIgnored(decisions[i].id, decisions[j].id, ignoreList)) {
            pairs.push({
              idA: decisions[i].id,
              titleA: decisions[i].title,
              idB: decisions[j].id,
              titleB: decisions[j].title,
              similarity: sim,
            });
          }
        }
      }
    }

    // Sort by similarity descending, take top K
    pairs.sort((a, b) => b.similarity - a.similarity);
    return pairs.slice(0, topK);

  } catch (err) {
    console.error("findDecisionConflicts failed:", err);
    return [];
  }
}
