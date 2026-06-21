import type { PhaseIndexData, DecisionIndexData, DiscussionIndexData, CommitDiff, EraIndexData, InstructionIndexData, AssignmentIndexData, NoteIndexData } from "./types";

export function buildPhaseText(data: PhaseIndexData): string {
  const parts: string[] = [
    data.title,
    (data.tags ?? []).join(" "),
    data.planText,
    data.implementationText,
  ];
  for (const diff of data.commitDiffs) {
    parts.push(`${diff.message}\n${diff.files.join(" ")}\n${diff.diffSnippet}`);
  }
  return parts.join("\n").slice(0, 6000);
}

export function buildDecisionText(data: DecisionIndexData): string {
  return [
    data.title,
    data.status,
    data.provenance ?? "",
    data.primaryScope ?? "",
    (data.touches ?? []).join(" "),
    data.context,
    data.decisionBody,
  ]
    .join("\n")
    .slice(0, 4000);
}

export function buildDiscussionText(data: DiscussionIndexData): string {
  return [
    data.title,
    data.status,
    data.provenance ?? "",
    data.outcome,
    (data.tags ?? []).join(" "),
    data.summary,
    data.bodyText,
  ]
    .join("\n")
    .slice(0, 3000);
}

export function buildCommitText(diff: CommitDiff): string {
  return [
    diff.message,
    diff.files.join(" "),
    diff.diffSnippet,
  ]
    .join("\n")
    .slice(0, 3000);
}

export function buildEraText(data: EraIndexData): string {
  return [
    data.id,
    data.title,
    data.dateRange,
    data.phases.join(" "),
    data.narrative,
  ]
    .join("\n")
    .slice(0, 4000);
}

export function buildInstructionText(data: InstructionIndexData): string {
  return [
    data.id,
    data.state,
    data.prompt,
    data.origin ?? "",
  ]
    .join("\n")
    .slice(0, 2000);
}

export function buildNoteText(data: NoteIndexData): string {
  return [
    data.title,
    (data.tags ?? []).join(" "),
    data.body,
  ]
    .join("\n")
    .slice(0, 3000);
}

export function buildAssignmentText(data: AssignmentIndexData): string {
  const parts: string[] = [];
  parts.push(`Assignment: ${data.id}`);
  parts.push(`Status: ${data.status}`);
  parts.push(`Type: ${data.type}`);
  parts.push(`Assigned To: ${data.assignedTo.name} <${data.assignedTo.email}>`);
  parts.push(`Assigned By: ${data.assignedBy.name} <${data.assignedBy.email}>`);
  parts.push(`Assigned At: ${data.assignedAt}`);
  if (data.type === "direct" && data.targetType && data.targetId) {
    parts.push(`Target: ${data.targetType} ${data.targetId}`);
  }
  if (data.description) {
    parts.push(`Description: ${data.description}`);
  }
  if (data.status === "rejected" && data.rejectedAt) {
    parts.push(`Rejected: ${data.rejectedAt}`);
    if (data.rejectionReason) {
      parts.push(`Rejection Reason: ${data.rejectionReason}`);
    }
  }
  if (data.status === "completed" && data.completedAt) {
    parts.push(`Completed: ${data.completedAt}`);
    if (data.completionNote) {
      parts.push(`Completion Note: ${data.completionNote}`);
    }
  }
  parts.push(`Reminders: ${data.remindCount}`);
  return parts.join("\n").slice(0, 2000);
}

export function deriveOutcomeType(outcome: string): string {
  if (!outcome || outcome === "none") return "none";
  if (outcome.startsWith("phase-")) return "phase";
  if (outcome.startsWith("DECISION-")) return "decision";
  if (outcome === "roadmap") return "roadmap";
  return "none";
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Maximum Marginal Relevance reranking.
 *
 * Greedy selection: first pick = max similarity to query (P@1 preserved);
 * subsequent picks = max [lambda * sim(query, item) - (1 - lambda) * max(sim(item, selected))].
 *
 * @param queryVec  query embedding
 * @param rows      over-fetched rows; each must expose `vector: number[]` and `_distance: number`
 * @param lambda    relevance/diversity trade-off (0.7 = relevance-leaning, preserves P@1)
 * @param topK      number of results to select
 * @returns         array of indices into `rows`, length min(topK, rows.length), MMR-ordered
 */
export function mmrRerank(
  queryVec: number[],
  rows: Array<{ vector: number[]; _distance: number }>,
  lambda: number,
  topK: number
): number[] {
  if (rows.length <= topK) return rows.map((_, i) => i);

  // Query-item similarity via LanceDB _distance (cosine for normalized vectors).
  const querySim = rows.map(r => Math.max(0, 1 - (r._distance * r._distance) / 2));

  const selected: number[] = [];
  const remaining = new Set<number>(rows.map((_, i) => i));

  // First pick: max similarity to query (guarantees P@1 unchanged).
  let firstIdx = -1;
  let firstSim = -Infinity;
  for (const i of remaining) {
    if (querySim[i] > firstSim) { firstSim = querySim[i]; firstIdx = i; }
  }
  selected.push(firstIdx);
  remaining.delete(firstIdx);

  // Subsequent picks: MMR score.
  while (selected.length < topK && remaining.size > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    for (const r of remaining) {
      let maxSimSelected = -Infinity;
      for (const s of selected) {
        const sim = cosine(rows[r].vector, rows[s].vector);
        if (sim > maxSimSelected) maxSimSelected = sim;
      }
      const score = lambda * querySim[r] - (1 - lambda) * maxSimSelected;
      if (score > bestScore) { bestScore = score; bestIdx = r; }
    }
    selected.push(bestIdx);
    remaining.delete(bestIdx);
  }

  return selected;
}
