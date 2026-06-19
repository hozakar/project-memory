import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { rebuildIndex } from "../../src/tools/rebuild_index";
import { searchMemory } from "../../src/tools/search_memory";
import type { IndexEntry } from "../../src/types";

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

describe("searchMemory outcomeTypeFilter", () => {
  it("filters by outcomeType correctly", async () => {
    // Index 3 discussions with different outcomes
    const entries: IndexEntry[] = [
      {
        type: "discussion",
        data: {
          id: "DISCUSSION-2026-06-18-none",
          title: "Discussion with no outcome",
          status: "concluded",
          outcome: "none",
          tags: ["test"],
          summary: "A discussion that never led to anything",
          bodyText: "We discussed various options but no decision was reached.",
        },
      },
      {
        type: "discussion",
        data: {
          id: "DISCUSSION-2026-06-18-phase",
          title: "Discussion leading to a phase",
          status: "concluded",
          outcome: "phase-20260612-foo",
          tags: ["test"],
          summary: "This discussion resulted in a new phase",
          bodyText: "After careful consideration we started a new phase.",
        },
      },
      {
        type: "discussion",
        data: {
          id: "DISCUSSION-2026-06-18-decision",
          title: "Discussion leading to a decision",
          status: "concluded",
          outcome: "DECISION-2026-06-12-bar",
          tags: ["test"],
          summary: "This discussion resulted in a formal decision",
          bodyText: "We reached consensus and filed a decision record.",
        },
      },
    ];

    const rebuildResult = await rebuildIndex(entries);
    expect(rebuildResult.indexed).toBe(3);
    expect(rebuildResult.failed).toBe(0);

    // Filter by outcomeType=none — should return only the "none" discussion
    const noneResults = await searchMemory(
      "test", 10, false, undefined, undefined, "discussion",
      undefined, undefined, undefined, undefined, undefined, "none"
    );
    expect(noneResults.length).toBeGreaterThanOrEqual(1);
    expect(noneResults.every(r => r.id.startsWith("DISCUSSION-2026-06-18-none"))).toBe(true);

    // Filter by outcomeType=phase — should return only the phase discussion
    const phaseResults = await searchMemory(
      "test", 10, false, undefined, undefined, "discussion",
      undefined, undefined, undefined, undefined, undefined, "phase"
    );
    expect(phaseResults.length).toBeGreaterThanOrEqual(1);
    expect(phaseResults.every(r => r.id.startsWith("DISCUSSION-2026-06-18-phase"))).toBe(true);

    // Filter by outcomeType=decision — should return only the decision discussion
    const decisionResults = await searchMemory(
      "test", 10, false, undefined, undefined, "discussion",
      undefined, undefined, undefined, undefined, undefined, "decision"
    );
    expect(decisionResults.length).toBeGreaterThanOrEqual(1);
    expect(decisionResults.every(r => r.id.startsWith("DISCUSSION-2026-06-18-decision"))).toBe(true);

    // No outcomeTypeFilter — should return all 3 discussions
    const allResults = await searchMemory(
      "test", 10, false, undefined, undefined, "discussion"
    );
    expect(allResults.length).toBe(3);
  });
});
