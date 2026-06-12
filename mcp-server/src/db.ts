// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const lancedb: any = require("@lancedb/lancedb");
import type { LanceRecord, SearchResult } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _conn: any = null;

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

export async function upsert(record: LanceRecord): Promise<void> {
  const table = await getTable();
  await table.delete(`id = '${record.id}'`);
  await table.add([record]);
}

export async function search(
  vector: number[],
  topK: number,
  typeFilter?: string,
  excludeCommits: boolean = true
): Promise<SearchResult[]> {
  try {
    const table = await getTable();
    const fetchLimit = typeFilter ? topK * 20 : topK;
    const rows = await table
      .vectorSearch(vector)
      .limit(fetchLimit)
      .toArray();

    let results = rows
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
      .sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity);

    if (excludeCommits && !typeFilter) {
      results = results.filter((r: SearchResult) => r.type !== "commit");
    }

    if (typeFilter) {
      results = results.filter((r: SearchResult) => r.type === typeFilter);
    }

    return results.slice(0, topK);
  } catch {
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
