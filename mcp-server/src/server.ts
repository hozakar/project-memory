import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchMemory } from "./tools/search_memory";
import { indexPhase } from "./tools/index_phase";
import { indexDecision } from "./tools/index_decision";
import { indexDiscussion } from "./tools/index_discussion";
import { checkConsistency } from "./tools/check_consistency";
import { rebuildIndex } from "./tools/rebuild_index";
import { findSimilarCommit } from "./tools/find_similar_commit";
import { indexEra } from "./tools/index_era";
import { indexInstruction } from "./tools/index_instruction";
import { runAudit } from "./tools/run_audit";
import type { IndexEntry } from "./types";

export const server = new McpServer({
  name: "project-memory",
  version: "0.0.1"
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const srv = server as any;

srv.tool(
  "search_memory",
  "Semantic search over indexed project memory (phases, decisions, discussions, eras, instructions). Returns top-K results sorted by similarity. Use at Pre-Implementation Gate and when user asks about past work.",
  {
    query: z.string().describe("Natural language search query"),
    top_k: z.number().int().min(1).max(20).optional().default(8).describe("Number of results"),
    include_commits: z.boolean().optional().default(false).describe("Include per-commit vector records in results (default: false)"),
    created_by_email: z.string().optional().describe("Filter results to a specific creator email. Default: no filter. Use to scope instruction searches to current user."),
    type_filter: z.string().optional().describe("Filter results to a specific type (phase, decision, discussion, era, instruction). Default: no filter."),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const results = await searchMemory(args.query, args.top_k, args.include_commits, args.created_by_email, args.type_filter);
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
      hash: z.string().regex(/^[0-9a-f]{7,40}$/).describe("Git commit hash (hex, 7–40 chars)"),
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
    provenance: z.enum(["directive", "collaborative"]).optional().describe("How the decision originated: directive (user-imposed) or collaborative (joint design)"),
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
    provenance: z.enum(["directive", "collaborative"]).optional().describe("How the discussion originated: directive (user-imposed save) or collaborative (joint exploration)"),
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
  "index_instruction",
  "Index or update an instruction in the vector DB. Call when an INSTRUCTION file is created or its state changes (active ↔ dropped). Upsert by ID.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/).describe("Instruction ID, e.g. INSTRUCTION-2026-06-13-branch-per-phase"),
    prompt: z.string(),
    state: z.string(),
    createdBy: z.object({
      name: z.string(),
      email: z.string(),
    }).optional().describe("Author identity from git config. Defaults to unknown if omitted."),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await indexInstruction(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "check_consistency",
  "Compare vector DB index against .project-memory/ filesystem. Returns missing IDs (file exists, not in DB) and orphaned IDs (in DB, file gone). Covers phases, decisions, discussions, eras, and instructions.",
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
      type: z.enum(["phase", "decision", "discussion", "era", "instruction"]),
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

srv.tool(
  "run_audit",
  "Run all deterministic audit checks (13 categories) on a project-memory directory. Returns structured findings: auto_fixed (Cat 5/11 file moves executed), pending_fixes (Cat 7 YAML annotations for LLM to apply), escalations (all other findings with severity and interactive flag).",
  {
    project_memory_dir: z.string().describe("Absolute path to the .project-memory/ directory"),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await runAudit(args.project_memory_dir);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "index_era",
  "Index or update an era summary in the vector DB. Call when a new era-NNN.md is written. Upsert by ID.",
  {
    id: z.string().regex(/^era-[0-9]{3,}$/).describe("Era ID, e.g. era-001"),
    title: z.string(),
    phases: z.array(z.string()),
    dateRange: z.string(),
    narrative: z.string(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await indexEra(args);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);
