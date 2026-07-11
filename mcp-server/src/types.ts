export interface CommitDiff {
  hash: string;
  message: string;
  files: string[];
  diffSnippet: string; // first 2000 chars of git show output
}

export interface Identity {
  name: string;
  email: string;
}

export interface PhaseIndexData {
  id: string;              // e.g. "phase-20260612-mcp-companion-mvp"
  title: string;
  tags: string[];
  planText: string;        // plan.md content, max 2000 chars
  implementationText: string; // implementation.md content, max 2000 chars
  commitDiffs: CommitDiff[];
  status: string;          // "planning" | "implementation" | "review" | "completed"
  createdBy?: Identity;
  contributors?: Identity[];
}

export interface DecisionIndexData {
  id: string;              // e.g. "DECISION-2026-06-12-roadmap-mcp-first"
  title: string;
  status: string;          // "active" | "superseded"
  provenance?: string;     // "directive" | "collaborative" — how the decision originated
  primaryScope?: string;   // e.g. "constraint", "workflow", "schema", "conventions"
  context: string;         // first 1000 chars of # Context section body
  decisionBody: string;    // first 1000 chars of # Decision + # Chosen Solution bodies
  touches: string[];       // from frontmatter touches field
  createdBy?: Identity;
  contributors?: Identity[];
}

export interface DiscussionIndexData {
  id: string;              // e.g. "DISCUSSION-2026-06-12-mcp-companion-architecture"
  title: string;
  status: string;          // "open" | "concluded"
  provenance?: string;     // "directive" | "collaborative" — how the discussion originated
  outcome: string;         // e.g. "phase-20260612-foo" | "DECISION-2026-06-12-bar" | "roadmap" | "none"
  tags: string[];
  summary: string;         // one-line summary (from discussions/index.md)
  bodyText: string;        // first 2000 chars of the DISCUSSION-*.md body
  createdBy?: Identity;
  contributors?: Identity[];
}

export interface EraIndexData {
  id: string;              // e.g. "era-001"
  title: string;
  records: string[];       // primary record IDs (DECISION/DISCUSSION) covered
  phases?: string[];       // legacy: frozen historical eras use phases instead of records
  date_range: string;       // e.g. "2026-06-08 to 2026-06-11"
  narrative: string;       // full body text, up to 3000 chars
}

export interface InstructionIndexData {
  id: string;              // e.g. "INSTRUCTION-2026-06-13-branch-per-phase"
  prompt: string;          // the instruction prompt text
  state: string;           // "active" | "dropped"
  createdBy?: Identity;
  origin?: string;         // INSTRUCTION-ID if forked from another user
  originUpdated?: boolean; // true when origin instruction has been modified since fork
}

export interface NoteIndexData {
  id: string;              // e.g. "NOTE-2026-06-21-some-slug"
  title: string;
  tags?: string[];
  createdBy: Identity;
  body: string;            // free-form markdown body
  createdAt: string;       // YYYY-MM-DD
  updatedAt: string;       // YYYY-MM-DD
}

export interface AssignmentIndexData {
  id: string;
  status: string;              // pending | accepted | rejected | ongoing | completed
  type: string;                // direct | freeform
  assignedTo: Identity;
  assignedBy: Identity;
  assignedAt: string;          // YYYY-MM-DD
  targetType: string | null;   // issue | phase | discussion | roadmap_item
  targetId: string | null;
  description: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  completedAt: string | null;
  completionNote: string | null;
  completedDecisionId: string | null;
  completedDiscussionId: string | null;
  remindCount: number;
  lastRemindedAt: string | null;
  createdBy?: Identity;
  contributors?: Identity[];
}

export interface SearchResult {
  id: string;
  type: "phase" | "decision" | "discussion" | "commit" | "era" | "instruction" | "assignment" | "note";
  similarity: number;      // 0 to 1, higher = more similar
  title: string;
  createdBy?: Identity;
  status?: string;            // record status (e.g. decision: active | superseded | amended)
  body?: string;              // instruction only: "THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION:\n{prompt}"
}

export interface CommitSearchResult {
  hash: string;
  message: string;
  similarity: number;
}

export interface ConsistencyReport {
  missing: string[];   // IDs: file exists in .project-memory/ but not indexed in DB
  orphaned: string[];  // IDs: in DB but corresponding file does not exist
}

export interface IndexEntry {
  type: "phase" | "decision" | "discussion" | "era" | "instruction" | "assignment" | "note";
  data: PhaseIndexData | DecisionIndexData | DiscussionIndexData | EraIndexData | InstructionIndexData | AssignmentIndexData | NoteIndexData;
}

// removed: 'create_phase_stub' from PendingFix.type in 2026-07-06 phase-removal
export interface PendingFix {
  type: "add_decision_index_row" | "fix_decision_index_status" | "add_discussion_index_row" | "fix_discussion_index_status" | "assign_adr_id" | "create_adr_file" | "fix_decision_supersession_status";
  // add_decision_index_row / fix_decision_index_status fields
  decisionId?: string;
  status?: string;
  touches?: string[];
  correctStatus?: string;
  date?: string;
  // assign_adr_id / create_adr_file / fix_adr_status fields
  adrId?: string;
  decisionContent?: string;
  decisionStatus?: string;
  adrStatus?: string;
  // add_discussion_index_row / fix_discussion_index_status fields
  discussionId?: string;
  // fix_decision_supersession_status fields
  supersededBy?: string;
}

export interface AuditReport {
  auto_fixed: string[];
  pending_fixes: PendingFix[];
}

export interface AppliedFix {
  fix_type: PendingFix["type"];
  target_file: string;     // relative to project root
  summary: string;         // one-line, suitable for audit-log
}

export interface PartialFix {
  fix_type: PendingFix["type"];
  target_file: string;
  llm_must_do: string;     // structured instruction for LLM follow-up
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: Record<string, any>;
}

export interface FailedFix {
  fix_type: PendingFix["type"];
  reason: "file_not_found" | "concurrent_modification" | "ambiguous_target" | "schema_mismatch" | "unknown_type";
  details: string;
}

export interface ApplyResult {
  applied: AppliedFix[];
  partial: PartialFix[];
  failed: FailedFix[];
  rerun_audit_recommended: boolean;
}

export interface LanceRecord {
  id: string;
  type: string;
  title: string;
  text: string;        // concatenated embeddable text representation
  vector: number[];    // 384-dimensional float32 vector from all-MiniLM-L6-v2
  createdByName?: string;
  createdByEmail?: string;
  contributorsJson?: string; // JSON.stringify(Identity[])
  touchesJson?: string;      // JSON.stringify(string[]) — decision touches; supports exact WHERE filter
  tagsJson?: string;         // JSON.stringify(string[]) — phase/discussion tags; supports exact WHERE filter
  assignedToEmail?: string;
  assignedByEmail?: string;
  primaryScope?: string;     // decision primary_scope — supports exact WHERE filter via scope_filter
  outcomeType?: string;      // derived discussion outcome category (none, phase, decision, roadmap) — supports exact WHERE filter via outcomeTypeFilter
  status?: string;            // record status (e.g. decision: active | superseded | amended)
  body?: string;              // instruction only: "THIS IS A NON-NEGOTIABLE BINDING USER INSTRUCTION:\n{prompt}"
}
