import type { PhaseIndexData, DecisionIndexData } from "./types";

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
