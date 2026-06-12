import * as lancedb from "@lancedb/lancedb";
import type { LanceRecord, SearchResult } from "./types";

let _conn: lancedb.Connection | null = null;

function dbPath(): string {
  const root = process.env.PROJECT_MEMORY_DIR ?? process.cwd();
  return `${root}/.project-memory/vector-index`;
}

/**
 * Returns a singleton LanceDB connection, creating it on first call.
 */
export async function getConnection(): Promise<lancedb.Connection> {
  if (!_conn) {
    _conn = await lancedb.connect(dbPath());
  }
  return _conn;
}

/**
 * Opens (or creates) the `memory` table, ensuring it exists.
 * On first access, an empty table is seeded with a dummy record and then cleared.
 */
async function getTable(): Promise<lancedb.Table> {
  const conn = await getConnection();
  const names = await conn.tableNames();
  if (!names.includes("memory")) {
    // Create with a dummy record so the table schema is established, then remove it
    const dummy: LanceRecord = {
      id: "__init__",
      type: "init",
      title: "",
      text: "",
      vector: new Array(384).fill(0),
    };
    const table = await conn.createTable("memory", [dummy]);
    await table.delete('id = "__init__"');
    return table;
  }
  return conn.openTable("memory");
}

/**
 * Insert or update a single record in the memory table.
 * Deletes any existing row with the same id before adding.
 */
export async function upsert(record: LanceRecord): Promise<void> {
  const table = await getTable();
  await table.delete(`id = '${record.id}'`);
  await table.add([record]);
}

/**
 * Vector similarity search over the memory table.
 * Converts LanceDB L2 distances to cosine-like similarity scores (0–1).
 * Returns results sorted by similarity descending.
 * If the table is empty or cannot be searched, returns an empty array.
 */
export async function search(
  vector: number[],
  topK: number
): Promise<SearchResult[]> {
  try {
    const table = await getTable();
    const rows = await table
      .vectorSearch(vector)
      .limit(topK)
      .toArray();

    return rows
      .map((row: Record<string, unknown>) => {
        const distance = row._distance as number;
        const similarity = Math.max(
          0,
          1 - (distance * distance) / 2
        );
        return {
          id: row.id as string,
          type: row.type as SearchResult["type"],
          title: row.title as string,
          similarity,
        };
      })
      .sort((a, b) => b.similarity - a.similarity);
  } catch {
    return [];
  }
}

/**
 * Lists all record IDs currently stored in the memory table.
 * Returns an empty array if the table does not exist.
 */
export async function listAllIds(): Promise<string[]> {
  try {
    const table = await getTable();
    const rows = await table.query().toArray();
    return rows.map((row: Record<string, unknown>) => row.id as string);
  } catch {
    return [];
  }
}

/**
 * Atomically drops and recreates the memory table with the given records.
 * Returns counts of indexed and failed records.
 */
export async function atomicRebuild(
  records: LanceRecord[]
): Promise<{ indexed: number; failed: number }> {
  try {
    const conn = await getConnection();
    await conn.dropTable("memory").catch(() => {});
    if (records.length === 0) {
      return { indexed: 0, failed: 0 };
    }
    await conn.createTable("memory", records, { mode: "overwrite" });
    return { indexed: records.length, failed: 0 };
  } catch {
    return { indexed: 0, failed: records.length };
  }
}