import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { searchMemory } from "./tools/search_memory";
import { indexDecision } from "./tools/index_decision";
import { indexDiscussion } from "./tools/index_discussion";
import { checkConsistency } from "./tools/check_consistency";
import { rebuildIndex } from "./tools/rebuild_index";
import { findSimilarCommit } from "./tools/find_similar_commit";
import { indexEra } from "./tools/index_era";
import { indexInstruction } from "./tools/index_instruction";
import { indexAssignment } from "./tools/index_assignment";
import { indexNote } from "./tools/index_note";
import { runAudit } from "./tools/run_audit";
import { applyAuditFixes } from "./tools/apply_audit_fixes";
import { listContributors } from "./tools/list_contributors";
import { deleteNote } from "./tools/delete_note";
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
  "Semantic search over indexed project memory (phases, decisions, discussions, eras, instructions, notes). Returns top-K results sorted by similarity. Use at Pre-Implementation Gate and when user asks about past work.",
  {
    query: z.string().describe("Natural language search query"),
    top_k: z.number().int().min(1).max(20).optional().default(8).describe("Number of results"),
    include_commits: z.boolean().optional().default(false).describe("Include per-commit vector records in results (default: false)"),
    created_by_email: z.string().optional().describe("Filter results to a specific creator email. Default: no filter. Use to scope instruction searches to current user."),
    created_by_name: z.string().optional().describe("Filter results to a specific creator name (partial match via LIKE %...%). Default: no filter."),
    assigned_to_email: z.string().optional(),
    assigned_by_email: z.string().optional(),
    type_filter: z.string().optional().describe("Filter results to a specific type (phase, decision, discussion, era, instruction, note, assignment). Default: no filter. When type is 'note', created_by_email is auto-applied if not provided — users can only search their own notes."),
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
  "index_note",
  "Index or update a note in the vector DB. Call when a NOTE file is created or updated. Notes are user-scoped (private) — only the owner can search their own notes. Upsert by ID.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/).describe("Note ID, e.g. NOTE-2026-06-21-some-slug"),
    title: z.string(),
    tags: z.array(z.string()).optional(),
    tagsJson: z.string().optional(),
    created_by: z.object({
      name: z.string(),
      email: z.string(),
    }).describe("Author identity from git config or explicit user override."),
    body: z.string(),
    created_at: z.string(),
    updated_at: z.string(),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    if (!args.tags && args.tagsJson) {
      try { args.tags = JSON.parse(args.tagsJson); } catch {}
    }
    const data = {
      id: args.id,
      title: args.title,
      tags: args.tags,
      createdBy: args.created_by,
      body: args.body,
      createdAt: args.created_at,
      updatedAt: args.updated_at,
    };
    const result = await indexNote(data);
      return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "delete_note",
  "Delete a note from the vector DB and filesystem. Accepts a note ID. Deletes the LanceDB record and the corresponding .project-memory/notes/NOTE-*.md file. Returns success/failure with per-store details. Notes are user-scoped (private) — deletion is owner-triggered only.",
  {
    id: z.string().regex(/^[a-zA-Z0-9-]+$/).describe("Note ID, e.g. NOTE-2026-06-21-some-slug"),
    callerEmail: z.string().describe("Email of the caller requesting deletion. Must match the note's created_by_email. Notes are user-scoped (private) — only the owner may delete."),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await deleteNote(args.id, args.callerEmail);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "check_consistency",
  "Compare vector DB index against .project-memory/ filesystem. Returns missing IDs (file exists, not in DB) and orphaned IDs (in DB, file gone). Covers phases, decisions, discussions, eras, instructions, and notes.",
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
      type: z.enum(["phase", "decision", "discussion", "era", "instruction", "note"]),
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
  "Run deterministic audit checks on a project-memory directory. Returns structured findings: auto_fixed (Cat 5/11 file moves executed), pending_fixes (Cat 6 decision index drift and Cat 8 ADR drift), escalations (all other findings with severity and interactive flag). Profile-aware: profile=minimal returns an empty report.",
  {
    project_memory_dir: z.string().describe("Absolute path to the .project-memory/ directory"),
    profile: z.enum(["standard", "minimal", "full", "lite"]).optional().default("standard").describe("Active project-memory profile. Default 'standard'. 'full' and 'lite' are normalized to 'standard'. 'minimal' returns empty findings (no audit by design)."),
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any) => {
    const result = await runAudit(args.project_memory_dir, args.profile ?? "standard");
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  }
);

srv.tool(
  "apply_audit_fixes",
  "Deterministically execute the pending_fixes payload returned by run_audit. Handles assign_commit, add_decision_index_row, fix_decision_index_status, assign_adr_id, create_adr_file. Idempotent: re-running with the same payload is a no-op. Source-of-truth safe: never reads the vector index, never synthesizes prose (template cells with prose content are returned as `partial` for LLM completion).",
  {
    project_memory_dir: z.string().describe("Absolute path to the .project-memory/ directory"),
    pending_fixes: z.array(z.object({
      type: z.enum(["assign_commit", "add_decision_index_row", "fix_decision_index_status", "assign_adr_id", "create_adr_file"]),
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
  "Index or update an era summary in the vector DB. Call when a new era-NNN.md is written. New eras pass `records` (list of DECISION/DISCUSSION IDs) + `date_range`; legacy eras may pass `phases` for backward-compat re-indexing. Upsert by ID.",
  {
    id: z.string().regex(/^era-[0-9]{3,}$/).describe("Era ID, e.g. era-001"),
    title: z.string(),
    records: z.array(z.string()).optional().default([]).describe("Primary record IDs (DECISION/DISCUSSION) covered by this era. Omit (or pass []) for legacy eras that use phases instead."),
    phases: z.array(z.string()).optional().describe("Legacy: frozen historical era phase IDs for backward-compat re-indexing"),
    date_range: z.string(),
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
