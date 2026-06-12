import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchMemory } from "./tools/search_memory";
import { indexPhase } from "./tools/index_phase";
import { indexDecision } from "./tools/index_decision";
import { indexDiscussion } from "./tools/index_discussion";
import { checkConsistency } from "./tools/check_consistency";
import { rebuildIndex } from "./tools/rebuild_index";
import { findSimilarCommit } from "./tools/find_similar_commit";
import type { IndexEntry } from "./types";

export const server = new McpServer({
  name: "project-memory",
  version: "0.2.0"
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const srv = server as any;

srv.tool(
  "search_memory",
  "Semantic search over indexed project memory (phases, decisions, discussions). Returns top-K results sorted by similarity. Use at Pre-Implementation Gate and when user asks about past work.",
  {
    query: z.string().describe("Natural language search query"),
    top_k: z.number().int().min(1).max(20).optional().default(8).describe("Number of results"),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const results = await searchMemory(args.query, args.top_k);
    return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
  }
);

srv.tool(
  "index_phase",
  "Index or update a phase in the vector DB. Call on phase open (empty implementationText) and on phase close (full content). Also indexes per-commit records for find_similar_commit. Upsert by ID.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/).describe("Phase ID, e.g. phase-20260612-mcp-companion-mvp"),
    title: z.string(),
    tags: z.array(z.string()),
    planText: z.string(),
    implementationText: z.string(),
    commitDiffs: z.array(z.object({
      hash: z.string(),
      message: z.string(),
      files: z.array(z.string()),
      diffSnippet: z.string(),
    })),
    status: z.string(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await indexPhase(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "index_decision",
  "Index or update a decision in the vector DB. Call on DECISION file creation and on status changes. Upsert by ID.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/).describe("Decision ID, e.g. DECISION-2026-06-12-roadmap-mcp-first"),
    title: z.string(),
    status: z.string(),
    context: z.string(),
    decisionBody: z.string(),
    touches: z.array(z.string()),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await indexDecision(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "index_discussion",
  "Index or update a discussion in the vector DB. Call when a discussion is concluded or its status changes. Upsert by ID.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/).describe("Discussion ID, e.g. DISCUSSION-2026-06-12-mcp-architecture"),
    title: z.string(),
    status: z.string(),
    outcome: z.string(),
    tags: z.array(z.string()),
    summary: z.string(),
    bodyText: z.string(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await indexDiscussion(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "check_consistency",
  "Compare vector DB index against .project-memory/ filesystem. Returns missing IDs (file exists, not in DB) and orphaned IDs (in DB, file gone). Covers phases, decisions, and discussions.",
  {
    project_memory_dir: z.string().describe("Absolute path to the .project-memory/ directory"),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await checkConsistency(args.project_memory_dir);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "rebuild_index",
  "Atomically replace the entire vector DB index. The skill assembles all IndexEntry objects and passes them here. Drops existing index, embeds all entries (including per-commit records for phases), creates fresh index.",
  {
    entries: z.array(z.object({
      type: z.enum(["phase", "decision", "discussion"]),
      data: z.record(z.unknown()),
    })).describe("All entries to index"),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const entries = args.entries as unknown as IndexEntry[];
    const result = await rebuildIndex(entries);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "find_similar_commit",
  "Search for past commits with similar code changes. Embed a diff snippet and search per-commit vector records. Useful for squash recovery and finding prior art.",
  {
    diff_snippet: z.string().describe("A code diff or description of the change to search for"),
    top_k: z.number().int().min(1).max(20).optional().default(5).describe("Number of results"),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const results = await findSimilarCommit(args.diff_snippet, args.top_k);
    return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
  }
);
