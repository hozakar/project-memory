import type { PhaseIndexData, DecisionIndexData, DiscussionIndexData, CommitDiff, EraIndexData } from "./types";

export function buildPhaseText(data: PhaseIndexData): string {
  const parts: string[] = [
    data.title,
    data.tags.join(" "),
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
    data.touches.join(" "),
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
    data.outcome,
    data.tags.join(" "),
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
