// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const lancedb: any = require("@lancedb/lancedb");
import type { LanceRecord, SearchResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _conn: any = null;
// Singleton: one connection per process lifetime. If PROJECT_MEMORY_DIR
// changes between calls in the same process (rare), the wrong DB is reused.
// For test teardown, restart the process or add a resetConnection() export.

function dbPath(): string {
  const root = process.env.PROJECT_MEMORY_DIR ?? process.cwd();
  return `${root}/.project-memory/vector-index`;
}

export async function getConnection(): Promise<unknown> {
  if (!_conn) {
    _conn = await lancedb.connect(dbPath());
  }
  return _conn;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getTable(): Promise<any> {
  const conn = await getConnection();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const names: string[] = await (conn as any).tableNames();
  if (!names.includes("memory")) {
    const dummy: LanceRecord = {
      id: "__init__",
      type: "init",
      title: "",
      text: "",
      vector: new Array(384).fill(0),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const table = await (conn as any).createTable("memory", [dummy]);
    await table.delete('id = "__init__"');
    return table;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (conn as any).openTable("memory");
}

// WARNING: This upsert is non-atomic (delete then add). If the process crashes
// between these two operations, the record is permanently removed from the
// vector index. Recovery path: Cat 13 / proactive sync (check_consistency +
// index_phase/index_decision) on the next session. LanceDB does not support
// multi-statement transactions.
export async function upsert(record: LanceRecord): Promise<void> {
  const table = await getTable();
  await table.delete(`id = '${record.id}'`);
  await table.add([record]);
}

function escapeLike(value: string): string {
  return value.replace(/'/g, "''");
}

export async function search(
  vector: number[],
  topK: number,
  typeFilter?: string,
  excludeCommits: boolean = true,
  createdByEmail?: string,
  touchesFilter?: string[],
  tagsFilter?: string[],
  assignedToEmail?: string,
  assignedByEmail?: string
): Promise<SearchResult[]> {
  try {
    const table = await getTable();
    const fetchLimit = topK;
    let query = table.vectorSearch(vector);

    // Build WHERE clauses for pre-filtering
    const whereClauses: string[] = [];
    if (typeFilter) {
      whereClauses.push(`type = '${typeFilter}'`);
    }
    if (createdByEmail) {
      whereClauses.push(`createdByEmail = '${createdByEmail}'`);
    }
    if (assignedToEmail) {
      whereClauses.push(`assignedToEmail = '${assignedToEmail.replace(/'/g, "''")}'`);
    }
    if (assignedByEmail) {
      whereClauses.push(`assignedByEmail = '${assignedByEmail.replace(/'/g, "''")}'`);
    }
    if (touchesFilter && touchesFilter.length > 0) {
      for (const touch of touchesFilter) {
        whereClauses.push(`touchesJson LIKE '%"${escapeLike(touch)}"%'`);
      }
    }
    if (tagsFilter && tagsFilter.length > 0) {
      for (const tag of tagsFilter) {
        whereClauses.push(`tagsJson LIKE '%"${escapeLike(tag)}"%'`);
      }
    }

    if (whereClauses.length > 0) {
      query = query.where(whereClauses.join(" AND "));
    }

    const rows = await query.limit(fetchLimit).toArray();

    let results = rows
      .map((row: Record<string, unknown>) => {
        const distance = row._distance as number;
        const similarity = Math.max(
          0,
          1 - (distance * distance) / 2
        );
        const createdByName = row.createdByName as string | undefined;
        const createdByEmail = row.createdByEmail as string | undefined;
        const result: SearchResult = {
          id: row.id as string,
          type: row.type as SearchResult["type"],
          title: row.title as string,
          similarity,
        };
        if (createdByName && createdByEmail) {
          result.createdBy = { name: createdByName, email: createdByEmail };
        }
        return result;
      })
      .sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity);

    if (excludeCommits && !typeFilter) {
      results = results.filter((r: SearchResult) => r.type !== "commit");
    }

    return results.slice(0, topK);
  } catch (err) {
    console.error("search failed:", err);
    return [];
  }
}

export async function listAllIds(): Promise<string[]> {
  try {
    const table = await getTable();
    const rows = await table.query().toArray();
    return rows.map((row: Record<string, unknown>) => row.id as string);
  } catch {
    return [];
  }
}

export async function atomicRebuild(
  records: LanceRecord[]
): Promise<{ indexed: number; failed: number }> {
  try {
    const conn = await getConnection();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (conn as any).dropTable("memory").catch(() => {});
    if (records.length === 0) {
      return { indexed: 0, failed: 0 };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (conn as any).createTable("memory", records, { mode: "overwrite" });
    return { indexed: records.length, failed: 0 };
  } catch {
    return { indexed: 0, failed: records.length };
  }
}
