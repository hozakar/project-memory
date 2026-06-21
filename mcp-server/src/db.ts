// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const lancedb: any = require("@lancedb/lancedb");
import * as fs from "fs";
import * as path from "path";
import type { LanceRecord, SearchResult } from "./types";
import { mmrRerank } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _conn: any = null;
// Singleton: one connection per process lifetime. If PROJECT_MEMORY_DIR
// changes between calls in the same process (rare), the wrong DB is reused.
// For test teardown, restart the process or add a resetConnection() export.

export function dbPath(): string {
  const envVal = process.env.PROJECT_MEMORY_DIR;
  const GARBAGE = new Set(["undefined", "null", ""]);
  const raw = envVal !== undefined && !GARBAGE.has(envVal) ? envVal : null;

  if (raw !== null && !path.isAbsolute(raw)) {
    throw new Error(
      `PROJECT_MEMORY_DIR must be an absolute path; got: "${raw}"`
    );
  }

  const root = raw ?? process.cwd();
  const projectMemoryDir = path.join(root, ".project-memory");

  if (!fs.existsSync(projectMemoryDir)) {
    throw new Error(
      `No .project-memory/ directory found at "${root}". ` +
      `Ensure PROJECT_MEMORY_DIR points to the project root where the skill was initialized. ` +
      `Expected: ${projectMemoryDir}`
    );
  }

  return path.join(projectMemoryDir, "vector-index");
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
      createdByName: "",
      createdByEmail: "",
      contributorsJson: "",
      tagsJson: "",
      touchesJson: "",
      assignedToEmail: "",
      assignedByEmail: "",
      primaryScope: "",
      outcomeType: "",
      status: "",
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
  try {
    await table.add([record]);
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (!msg.includes("Found field not in schema")) throw err;
    // Schema evolution: non-destructive column addition via addColumns.
    // Detects which fields in record are missing from the table and adds them.
    const schema = await table.schema();
    const existingFields = new Set(schema.fields.map((f: { name: string }) => f.name));
    const newFields = Object.keys(record).filter(k => k !== "vector" && !existingFields.has(k));
    for (const field of newFields) {
      await table.addColumns([{ name: field, valueSql: "cast('' as string)" }]);
    }
    await table.add([record]);
  }
}

export function escapeLike(value: string): string {
  return value.replace(/'/g, "''");
}

export async function search(
  vector: number[],
  topK: number,
  typeFilter?: string,
  excludeCommits: boolean = true,
  createdByEmail?: string,
  createdByName?: string,
  touchesFilter?: string[],
  tagsFilter?: string[],
  assignedToEmail?: string,
  assignedByEmail?: string,
  scopeFilter?: string[],
  outcomeTypeFilter?: string,
  diversify?: boolean,
  includeSuperseded: boolean = false
): Promise<SearchResult[]> {
  try {
    const table = await getTable();
    const fetchLimit = diversify ? Math.max(topK, topK * 5) : topK;
    let query = table.vectorSearch(vector);

    // Build WHERE clauses for pre-filtering
    const whereClauses: string[] = [];
    if (typeFilter) {
      whereClauses.push(`type = '${typeFilter}'`);
    }
    if (createdByEmail) {
      whereClauses.push(`createdByEmail = '${escapeLike(createdByEmail)}'`);
    }
    if (createdByName) {
      whereClauses.push(`createdByName LIKE '%${escapeLike(createdByName)}%'`);
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
    if (scopeFilter && scopeFilter.length > 0) {
      const scopeClauses = scopeFilter.map(s => `primaryScope = '${escapeLike(s)}'`);
      whereClauses.push(`(${scopeClauses.join(" OR ")})`);
    }
    if (outcomeTypeFilter) {
      whereClauses.push(`outcomeType = '${escapeLike(outcomeTypeFilter)}'`);
    }
    if (!includeSuperseded) {
      whereClauses.push(`(status IS NULL OR status != 'superseded')`);
    }

    if (whereClauses.length > 0) {
      query = query.where(whereClauses.join(" AND "));
    }

    const rows = await query.limit(fetchLimit).toArray();

    // Pre-filter commits before MMR so commit exclusion doesn't shrink below topK.
    let candidateRows = rows;
    if (excludeCommits && !typeFilter) {
      candidateRows = candidateRows.filter((r: Record<string, unknown>) => r.type !== "commit");
    }
    // Notes are user-scoped private records — excluded from all searches except
    // when explicitly requested via type_filter="note".
    if (!typeFilter || typeFilter !== "note") {
      candidateRows = candidateRows.filter((r: Record<string, unknown>) => r.type !== "note");
    }
    // MMR reranking for diversity (opt-in). First pick = max sim (P@1 preserved).
    if (diversify && candidateRows.length > topK) {
      const indices = mmrRerank(vector, candidateRows as Array<{ vector: number[]; _distance: number }>, 0.7, topK);
      candidateRows = indices.map(i => candidateRows[i]);
    }

    let results = candidateRows
      .map((row: Record<string, unknown>) => {
        const distance = row._distance as number;
        const similarity = Math.max(
          0,
          1 - (distance * distance) / 2
        );
        const createdByName = row.createdByName as string | undefined;
        const createdByEmail = row.createdByEmail as string | undefined;
        const status = row.status as string | undefined;
        const result: SearchResult = {
          id: row.id as string,
          type: row.type as SearchResult["type"],
          title: row.title as string,
          similarity,
        };
        if (status) {
          result.status = status;
        }
        if (createdByName && createdByEmail) {
          result.createdBy = { name: createdByName, email: createdByEmail };
        }
        if (row.type === "instruction" && row.text) {
          result.body = `THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION:\n${row.text as string}`;
        }
        return result;
      })
    if (!diversify) {
      results = results.sort((a: SearchResult, b: SearchResult) => b.similarity - a.similarity);
    }

    // Commit exclusion is handled above in the pre-filter for both diversify and non-diversify paths.

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
