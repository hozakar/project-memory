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
import { indexAssignment } from "./tools/index_assignment";
import { runAudit } from "./tools/run_audit";
import { applyAuditFixes } from "./tools/apply_audit_fixes";
import { listContributors } from "./tools/list_contributors";
import { findTouchingPhases } from "./tools/find_touching_phases";
import type { IndexEntry, PendingFix } from "./types";
import { version } from "../package.json";

export const server = new McpServer({
  name: "project-memory",
  version
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
    created_by_name: z.string().optional().describe("Filter results to a specific creator name (partial match via LIKE %...%). Default: no filter."),
    assigned_to_email: z.string().optional(),
    assigned_by_email: z.string().optional(),
    type_filter: z.string().optional().describe("Filter results to a specific type (phase, decision, discussion, era, instruction). Default: no filter."),
    touches_filter: z.array(z.string()).optional().describe("Exact AND-filter on decision touches field. E.g. [\"conventions_md\"] returns only decisions that touch conventions_md. Multiple values narrow further (AND semantics). Only effective on type=decision records."),
    tags_filter: z.array(z.string()).optional().describe("Exact AND-filter on phase/discussion tags field. E.g. [\"mcp\", \"schema\"] returns records tagged with both. Only effective on type=phase and type=discussion records."),
    scope_filter: z.array(z.string()).optional().describe("Exact OR-filter on decision primary_scope field. E.g. [\"constraint\"] returns only decisions with primary_scope=constraint. Multiple values broaden (OR semantics). Only effective on type=decision records."),
    outcome_type_filter: z.string().optional().describe("Filter results to a specific discussion outcome type (none, phase, decision, roadmap). Exact match on derived outcomeType column. Only effective on type=discussion records."),
    diversify: z.boolean().optional().default(false).describe("Apply MMR reranking for result diversity. Set true for survey/exploration queries ('what have we done about X', 'find all decisions touching Y and Z') with top_k >= 5; leave false for pinpoint lookups ('find the decision where we chose X') or top_k <= 3. When true: over-fetches 5x and reranks with lambda=0.7 (relevance-leaning). P@1 preserved (first pick = max similarity). Default: false."),
    include_superseded: z.boolean().optional().default(false).describe("Include superseded decisions in results (default: false). Superseded decisions are excluded by default to prevent the Pre-Implementation Gate from surfacing rejected choices as active constraints. Set to true for historical lookup queries ('what did we used to do about X')."),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const results = await searchMemory(args.query, args.top_k, args.include_commits, args.created_by_email, args.created_by_name, args.type_filter, args.touches_filter, args.tags_filter, args.assigned_to_email, args.assigned_by_email, args.scope_filter, args.outcome_type_filter, args.diversify, args.include_superseded);
    return { content: [{ type: "text" as const, text: JSON.stringify(results) }] };
  }
);

srv.tool(
  "index_phase",
  "Index or update a phase in the vector DB. Call on phase open (empty implementationText) and on phase close (full content). Also indexes per-commit records for find_similar_commit. Upsert by ID.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/).describe("Phase ID, e.g. phase-20260612-mcp-companion-mvp"),
    title: z.string(),
    tags: z.array(z.string()).optional(),
    tagsJson: z.string().optional(),
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
    if (!args.tags && args.tagsJson) {
      try { args.tags = JSON.parse(args.tagsJson); } catch {}
    }
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
    primary_scope: z.string().optional().describe("Categorical scope of the decision, e.g. constraint, workflow, schema, conventions. Enables scope_filter in search_memory."),
    context: z.string(),
    decisionBody: z.string(),
    touches: z.array(z.string()).optional(),
    touchesJson: z.string().optional(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    if (!args.touches && args.touchesJson) {
      try { args.touches = JSON.parse(args.touchesJson); } catch {}
    }
    const result = await indexDecision({ ...args, primaryScope: args.primary_scope });
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
    tags: z.array(z.string()).optional(),
    tagsJson: z.string().optional(),
    summary: z.string(),
    bodyText: z.string(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    if (!args.tags && args.tagsJson) {
      try { args.tags = JSON.parse(args.tagsJson); } catch {}
    }
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
  "index_assignment",
  "Index or update an assignment in the vector DB. Call on ASSIGNMENT file creation and on status change (pending→accepted/rejected, accepted→ongoing, ongoing→completed). Upsert by ID.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/),
    title: z.string(),
    status: z.string(),
    description: z.string().optional(),
    assignedTo: z.object({ name: z.string(), email: z.string() }).optional(),
    assignedBy: z.object({ name: z.string(), email: z.string() }).optional(),
    assignedAt: z.string().optional(),
    targetType: z.string().nullable().optional(),
    targetId: z.string().nullable().optional(),
    rejectReason: z.string().nullable().optional(),
    completionNote: z.string().nullable().optional(),
    createdBy: z.object({ name: z.string(), email: z.string() }).optional(),
    contributors: z.array(z.object({ name: z.string(), email: z.string() })).optional(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {
      id: args.id,
      title: args.title,
      status: args.status,
      description: args.description || null,
      type: args.targetType && args.targetId ? "direct" : "freeform",
      assignedTo: args.assignedTo || { name: "unknown", email: "unknown" },
      assignedBy: args.assignedBy || { name: "unknown", email: "unknown" },
      assignedAt: args.assignedAt || new Date().toISOString().slice(0, 10),
      targetType: args.targetType || null,
      targetId: args.targetId || null,
      rejectionReason: args.rejectReason || null,
      completionNote: args.completionNote || null,
      remindCount: 0,
      createdBy: args.createdBy,
      contributors: args.contributors,
    };
    await indexAssignment(data);
    return { content: [{ type: "text", text: `Indexed assignment: ${args.id}` }] };
  },
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
  "Run deterministic audit checks on a project-memory directory. Returns structured findings: auto_fixed (Cat 5/11 file moves executed), pending_fixes (Cat 7 YAML annotations for LLM to apply), escalations (all other findings with severity and interactive flag), cat4_gap_count (present when raise_cat4=false — count of Cat 4 open-phase gaps suppressed server-side). Profile-aware: profile=lite skips Cat 9 and Cat 11 and reduces Cat 10 to phase.yml-only; profile=minimal returns an empty report.",
  {
    project_memory_dir: z.string().describe("Absolute path to the .project-memory/ directory"),
    profile: z.enum(["full", "lite", "minimal"]).optional().default("full").describe("Active project-memory profile. Default 'full'. 'lite' skips Cat 9 + Cat 11 and reduces Cat 10 to require phase.yml only. 'minimal' returns empty findings (no audit by design)."),
    raise_cat4: z.boolean().optional().default(false).describe("When false (default, for on-load audits), Cat 4 open-phase gaps are suppressed from escalations and returned as cat4_gap_count instead — non-blocking info line. When true (for manual 'Skill project-memory audit' runs), Cat 4 findings are returned in escalations as interactive=true for user triage."),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await runAudit(args.project_memory_dir, args.profile ?? "full", args.raise_cat4 ?? false);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "apply_audit_fixes",
  "Deterministically execute the pending_fixes payload returned by run_audit. Handles annotate_orphan, assign_commit, add_decision_index_row, fix_decision_index_status, assign_adr_id, create_adr_file, create_phase_stub. Idempotent: re-running with the same payload is a no-op. Source-of-truth safe: never reads the vector index, never synthesizes prose (template cells with prose content are returned as `partial` for LLM completion).",
  {
    project_memory_dir: z.string().describe("Absolute path to the .project-memory/ directory"),
    pending_fixes: z.array(z.object({
      type: z.enum(["annotate_orphan", "assign_commit", "add_decision_index_row", "fix_decision_index_status", "assign_adr_id", "create_adr_file", "create_phase_stub"]),
    }).passthrough()).describe("The pending_fixes array from run_audit, passed through verbatim."),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const fixes = args.pending_fixes as PendingFix[];
    const result = await applyAuditFixes(args.project_memory_dir, fixes);
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

srv.tool(
  "list_contributors",
  "List all contributors across project-memory records. Walks phase, decision, discussion, issue, and assignment files, extracts created_by and contributors from frontmatter, deduplicates by email, and returns sorted by name. Useful for understanding who has touched the project memory.",
  {},
  async () => {
    const result = await listContributors();
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "find_touching_phases",
  "Find which phases touched a given file. Runs git log on the file, then matches commit hashes against phase.yml commit lists. Returns phases sorted by most recent touch. Unmatched commits (not in any phase) are returned separately. Useful for reverse lookup: 'which phase last changed this file?'",
  {
    file_path: z.string().describe("File path relative to the project root (e.g. 'mcp-server/src/db.ts')."),
  },
  async (args: any) => {
    const result = await findTouchingPhases(args.file_path);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);
