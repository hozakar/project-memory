import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchMemory } from "./tools/search_memory";
import { indexPhase } from "./tools/index_phase";
import { indexDecision } from "./tools/index_decision";
import { checkConsistency } from "./tools/check_consistency";
import { rebuildIndex } from "./tools/rebuild_index";
import type { IndexEntry } from "./types";

export const server = new McpServer({
  name: "project-memory",
  version: "0.1.0"
});

server.tool(
  "search_memory",
  "Semantic search over indexed project memory (phases and decisions). Returns top-K results sorted by similarity. Use at Pre-Implementation Gate and when user asks about past work.",
  {
    query: z.string().describe("Natural language search query"),
    top_k: z.number().int().min(1).max(20).optional().default(8).describe("Number of results"),
  },
  async (args) => {
    const results = await searchMemory(args.query, args.top_k);
    return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
  }
);

server.tool(
  "index_phase",
  "Index or update a phase in the vector DB. Call on phase open (empty implementationText) and on phase close (full content). Upsert by ID.",
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
  async (args) => {
    const result = await indexPhase(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

server.tool(
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
  async (args) => {
    const result = await indexDecision(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

server.tool(
  "check_consistency",
  "Compare vector DB index against .project-memory/ filesystem. Returns missing IDs (file exists, not in DB) and orphaned IDs (in DB, file gone).",
  {
    project_memory_dir: z.string().describe("Absolute path to the .project-memory/ directory"),
  },
  async (args) => {
    const result = await checkConsistency(args.project_memory_dir);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

server.tool(
  "rebuild_index",
  "Atomically replace the entire vector DB index. The skill assembles all IndexEntry objects and passes them here. Drops existing index, embeds all entries, creates fresh index.",
  {
    entries: z.array(z.object({
      type: z.enum(["phase", "decision"]),
      data: z.record(z.unknown()),
    })).describe("All entries to index"),
  },
  async (args) => {
    const entries = args.entries as IndexEntry[];
    const result = await rebuildIndex(entries);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);