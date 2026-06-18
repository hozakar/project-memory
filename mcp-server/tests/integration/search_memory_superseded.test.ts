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

describe("searchMemory superseded exclusion", () => {
  it("excludes superseded decisions by default, includes with flag, returns status field", async () => {
    const entries: IndexEntry[] = [
      {
        type: "decision",
        data: {
          id: "DECISION-test-active",
          title: "Active decision about auth tokens",
          status: "active",
          primaryScope: "auth",
          context: "We decided to use JWT for authentication tokens.",
          decisionBody: "Use JWT with 24-hour expiry for auth tokens.",
          touches: ["auth_token", "jwt"],
        },
      },
      {
        type: "decision",
        data: {
          id: "DECISION-test-superseded",
          title: "Superseded decision about auth tokens",
          status: "superseded",
          primaryScope: "auth",
          context: "We originally decided to use session cookies for authentication.",
          decisionBody: "Use server-side session cookies for auth tokens.",
          touches: ["auth_token", "session_cookie"],
        },
      },
      {
        type: "decision",
        data: {
          id: "DECISION-test-amended",
          title: "Amended decision about auth token expiry",
          status: "amended",
          primaryScope: "auth",
          context: "We refined the JWT expiry duration.",
          decisionBody: "Use JWT with 12-hour expiry instead of 24-hour.",
          touches: ["auth_token", "jwt"],
        },
      },
    ];

    const rebuildResult = await rebuildIndex(entries);
    expect(rebuildResult.indexed).toBe(3);
    expect(rebuildResult.failed).toBe(0);

    // All 3 IDs should exist in the DB

    // Default search — should return active + amended, NOT superseded
    const defaultResults = await searchMemory(
      "auth token decision", 10, false, undefined, "decision",
      undefined, undefined, undefined, undefined, undefined, undefined, false, false
    );
    const defaultIds = defaultResults.map(r => r.id);
    expect(defaultIds).toContain("DECISION-test-active");
    expect(defaultIds).toContain("DECISION-test-amended");
    expect(defaultIds).not.toContain("DECISION-test-superseded");

    // Opt-in search — should return all 3 including superseded
    const optInResults = await searchMemory(
      "auth token decision", 10, false, undefined, "decision",
      undefined, undefined, undefined, undefined, undefined, undefined, false, true
    );
    const optInIds = optInResults.map(r => r.id);
    expect(optInIds).toContain("DECISION-test-active");
    expect(optInIds).toContain("DECISION-test-amended");
    expect(optInIds).toContain("DECISION-test-superseded");

    // Status field populated on returned decision results
    const decisionsWithStatus = optInResults.filter(r => r.status !== undefined);
    expect(decisionsWithStatus.length).toBe(3);
    const activeResult = optInResults.find(r => r.id === "DECISION-test-active");
    expect(activeResult?.status).toBe("active");
    const supersededResult = optInResults.find(r => r.id === "DECISION-test-superseded");
    expect(supersededResult?.status).toBe("superseded");
    const amendedResult = optInResults.find(r => r.id === "DECISION-test-amended");
    expect(amendedResult?.status).toBe("amended");
  });
});
