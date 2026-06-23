import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as path from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexPhase } from "../../src/tools/index_phase";
import { indexDiscussion } from "../../src/tools/index_discussion";

// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const lancedb: any = require("@lancedb/lancedb");

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // LanceDB may hold file handles open on Windows; cleanup is best-effort
  }
});

describe("getTable() schema nullability", () => {
  it("fresh DB produces all-nullable columns (id/vector excluded)", async () => {
    const r = await indexPhase({
      id: "phase-20260623-nullability-fresh-check",
      title: "Fresh DB nullability check",
      tags: ["test"],
      planText: "irrelevant",
      implementationText: "irrelevant",
      commitDiffs: [],
      status: "planning",
    });
    expect(r.success).toBe(true);

    const vectorIndexDir = path.join(tmp.pmDir, "vector-index");
    const conn = await lancedb.connect(vectorIndexDir);
    const tbl = await conn.openTable("memory");
    const schema = await tbl.schema();
    const offenders = schema.fields
      .filter(
        (f: { name: string; nullable: boolean }) =>
          !f.nullable && f.name !== "id" && f.name !== "vector"
      )
      .map((f: { name: string }) => f.name);
    expect(offenders).toEqual([]);
  });

  it("remediates legacy non-nullable primaryScope on open", async () => {
    // Fabricate ISSUE-2026-06-22 conditions: drop and recreate the memory
    // table with an explicit Arrow schema where primaryScope is non-nullable
    // (matches the post-f16be81/05525bf legacy state). Without the remediation
    // in getTable(), the subsequent indexDiscussion call would fail with
    // "Append with different schema: missing=[primaryScope]".
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const arrow = require("apache-arrow");

    const vectorIndexDir = path.join(tmp.pmDir, "vector-index");
    const conn = await lancedb.connect(vectorIndexDir);
    await conn.dropTable("memory").catch(() => {});

    const stringField = (name: string, nullable: boolean) =>
      new arrow.Field(name, new arrow.Utf8(), nullable);

    const badSchema = new arrow.Schema([
      stringField("id", false),
      stringField("type", true),
      stringField("title", true),
      stringField("text", true),
      new arrow.Field(
        "vector",
        new arrow.FixedSizeList(
          384,
          new arrow.Field("item", new arrow.Float32(), true)
        ),
        true
      ),
      stringField("createdByName", true),
      stringField("createdByEmail", true),
      stringField("contributorsJson", true),
      stringField("tagsJson", true),
      stringField("touchesJson", true),
      stringField("assignedToEmail", true),
      stringField("assignedByEmail", true),
      stringField("primaryScope", false), // THE BUG
      stringField("outcomeType", true),
      stringField("status", true),
    ]);

    await conn.createEmptyTable("memory", badSchema);

    // Verify setup actually produced the bad state.
    const reopenedBefore = await conn.openTable("memory");
    const schemaBefore = await reopenedBefore.schema();
    const beforeField = schemaBefore.fields.find(
      (f: { name: string }) => f.name === "primaryScope"
    );
    expect(beforeField?.nullable).toBe(false);

    // Trigger remediation via a non-decision index_* call — this is the exact
    // path that broke in ISSUE-2026-06-22.
    const r = await indexDiscussion({
      id: "DISCUSSION-2026-06-23-nullability-remediation",
      title: "Remediation test",
      status: "concluded",
      outcome: "none",
      tags: ["test"],
      summary: "Triggers getTable() remediation path",
      bodyText: "Body for nullability remediation regression test.",
    });
    expect(r.success).toBe(true);

    const reopenedAfter = await conn.openTable("memory");
    const schemaAfter = await reopenedAfter.schema();
    const afterField = schemaAfter.fields.find(
      (f: { name: string }) => f.name === "primaryScope"
    );
    expect(afterField?.nullable).toBe(true);
  });
});
