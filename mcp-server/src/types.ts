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
  phases: string[];        // phase IDs covered
  dateRange: string;       // e.g. "2026-06-08 to 2026-06-11"
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

export interface SearchResult {
  id: string;
  type: "phase" | "decision" | "discussion" | "commit" | "era" | "instruction";
  similarity: number;      // 0 to 1, higher = more similar
  title: string;
  createdBy?: Identity;
}

export interface CommitSearchResult {
  hash: string;
  phaseId: string;
  message: string;
  similarity: number;
}

export interface ConsistencyReport {
  missing: string[];   // IDs: file exists in .project-memory/ but not indexed in DB
  orphaned: string[];  // IDs: in DB but corresponding file does not exist
}

export interface IndexEntry {
  type: "phase" | "decision" | "discussion" | "era" | "instruction";
  data: PhaseIndexData | DecisionIndexData | DiscussionIndexData | EraIndexData | InstructionIndexData;
}

export interface AuditFinding {
  category: number;
  severity: "high" | "medium" | "low";
  description: string;
  interactive: boolean; // true = enters interactive triage, false = report-only
  data: Record<string, unknown>;
}

export interface PendingFix {
  type: "annotate_orphan" | "assign_commit" | "add_decision_index_row" | "fix_decision_index_status" | "assign_adr_id" | "create_adr_file" | "fix_adr_status" | "create_phase_stub";
  // annotate_orphan fields
  phase_id?: string;
  hash?: string;
  location?: "commits" | "merge_commit";
  date?: string;
  // assign_commit fields
  phaseId?: string;
  commitHash?: string;
  files?: string[];
  // add_decision_index_row / fix_decision_index_status fields
  decisionId?: string;
  status?: string;
  touches?: string[];
  correctStatus?: string;
  // assign_adr_id / create_adr_file / fix_adr_status fields
  adrId?: string;
  decisionContent?: string;
  decisionStatus?: string;
  adrStatus?: string;
  // create_phase_stub fields
  missingFile?: string;
}

export interface AuditReport {
  auto_fixed: string[];
  pending_fixes: PendingFix[];
  escalations: AuditFinding[];
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
}
