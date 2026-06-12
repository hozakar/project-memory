export interface CommitDiff {
  hash: string;
  message: string;
  files: string[];
  diffSnippet: string; // first 2000 chars of git show output
}

export interface PhaseIndexData {
  id: string;              // e.g. "phase-20260612-mcp-companion-mvp"
  title: string;
  tags: string[];
  planText: string;        // plan.md content, max 2000 chars
  implementationText: string; // implementation.md content, max 2000 chars
  commitDiffs: CommitDiff[];
  status: string;          // "planning" | "implementation" | "review" | "completed"
}

export interface DecisionIndexData {
  id: string;              // e.g. "DECISION-2026-06-12-roadmap-mcp-first"
  title: string;
  status: string;          // "active" | "superseded"
  context: string;         // first 1000 chars of # Context section body
  decisionBody: string;    // first 1000 chars of # Decision + # Chosen Solution bodies
  touches: string[];       // from frontmatter touches field
}

export interface DiscussionIndexData {
  id: string;              // e.g. "DISCUSSION-2026-06-12-mcp-companion-architecture"
  title: string;
  status: string;          // "open" | "concluded"
  outcome: string;         // e.g. "phase-20260612-foo" | "DECISION-2026-06-12-bar" | "roadmap" | "none"
  tags: string[];
  summary: string;         // one-line summary (from discussions/index.md)
  bodyText: string;        // first 2000 chars of the DISCUSSION-*.md body
}

export interface SearchResult {
  id: string;
  type: "phase" | "decision" | "discussion" | "commit";
  similarity: number;      // 0 to 1, higher = more similar
  title: string;
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
  type: "phase" | "decision" | "discussion";
  data: PhaseIndexData | DecisionIndexData | DiscussionIndexData;
}

export interface LanceRecord {
  id: string;
  type: string;
  title: string;
  text: string;        // concatenated embeddable text representation
  vector: number[];    // 384-dimensional float32 vector from all-MiniLM-L6-v2
}
