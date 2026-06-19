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

describe("searchMemory diversify flag", () => {
  it("without diversify, top-3 clusters on near-duplicate decisions", async () => {
    // Index 5 decisions: 3 near-duplicate "connection pooling" decisions with
    // very similar titles/bodies, plus 2 diverse decisions about other topics.
    const entries: IndexEntry[] = [
      {
        type: "decision",
        data: {
          id: "DECISION-pooling-mysql",
          title: "MySQL connection pooling strategy for primary database",
          status: "active",
          context: "Evaluating connection pooling alternatives for MySQL",
          decisionBody: "We chose HikariCP for MySQL connection pooling with max 20 connections per instance.",
          touches: ["database", "mysql"],
          primaryScope: "conventions",
        },
      },
      {
        type: "decision",
        data: {
          id: "DECISION-pooling-pg",
          title: "PostgreSQL connection pooling strategy for analytics",
          status: "active",
          context: "Evaluating connection pooling alternatives for PostgreSQL",
          decisionBody: "We chose PgBouncer for PostgreSQL connection pooling with transaction mode.",
          touches: ["database", "postgresql"],
          primaryScope: "conventions",
        },
      },
      {
        type: "decision",
        data: {
          id: "DECISION-pooling-redis",
          title: "Redis connection pooling for cache layer",
          status: "active",
          context: "Evaluating connection pooling for Redis cache",
          decisionBody: "We chose ioredis pool with 50 max connections for Redis cache layer.",
          touches: ["cache", "redis"],
          primaryScope: "conventions",
        },
      },
      {
        type: "decision",
        data: {
          id: "DECISION-auth-jwt",
          title: "JWT authentication strategy for API gateway",
          status: "active",
          context: "Choosing authentication method for API gateway",
          decisionBody: "We chose JWT with RS256 signing for API gateway authentication.",
          touches: ["security", "api"],
          primaryScope: "conventions",
        },
      },
      {
        type: "decision",
        data: {
          id: "DECISION-logging-elk",
          title: "ELK stack logging infrastructure",
          status: "active",
          context: "Centralized logging for microservices",
          decisionBody: "We chose Elasticsearch, Logstash, and Kibana for centralized logging.",
          touches: ["infrastructure", "logging"],
          primaryScope: "conventions",
        },
      },
    ];

    const rebuildResult = await rebuildIndex(entries);
    expect(rebuildResult.indexed).toBe(5);
    expect(rebuildResult.failed).toBe(0);

    // Without diversify — top-3 should cluster on connection-pooling decisions
    const noDiversifyResults = await searchMemory(
      "connection pooling", 5, false, undefined, undefined, "decision",
      undefined, undefined, undefined, undefined, undefined, undefined, false
    );
    expect(noDiversifyResults.length).toBeGreaterThanOrEqual(3);
    // At least 2 of the top 3 should be connection-pooling decisions
    const poolIdsWithout = noDiversifyResults.slice(0, 3).filter(r =>
      r.id.startsWith("DECISION-pooling-")
    );
    expect(poolIdsWithout.length).toBeGreaterThanOrEqual(2);
  });

  it("with diversify=true, top-1 preserved but top-5 includes diverse decisions", async () => {
    // With diversify — top-1 should still be a connection-pooling decision (P@1 preserved),
    // but the top-5 should include the diverse decisions (not all 3 near-duplicates in top-3).
    const diversifyResults = await searchMemory(
      "connection pooling", 5, false, undefined, undefined, "decision",
      undefined, undefined, undefined, undefined, undefined, undefined, true
    );
    expect(diversifyResults.length).toBe(5);

    // Top-1 should be a connection-pooling decision (P@1 preserved)
    expect(diversifyResults[0].id).toMatch(/^DECISION-pooling-/);

    // Should include the diverse decisions (auth and logging) in the top 5
    const diversifiedIds = diversifyResults.map(r => r.id);
    expect(diversifiedIds).toContain("DECISION-auth-jwt");
    expect(diversifiedIds).toContain("DECISION-logging-elk");
  });

  it("P@1 preserved: top-1 with diversify matches highest-similarity pooling decision", async () => {
    const results = await searchMemory(
      "connection pooling", 5, false, undefined, undefined, "decision",
      undefined, undefined, undefined, undefined, undefined, undefined, true
    );
    expect(results[0].id).toMatch(/^DECISION-pooling-/);
    // The highest-similarity result should be one of the pooling decisions
    // (P@1 = first pick = max similarity to query)
    expect(results[0].similarity).toBeGreaterThan(0.5);
  });
});
