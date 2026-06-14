import type { PhaseIndexData, DecisionIndexData, DiscussionIndexData, CommitDiff, EraIndexData, InstructionIndexData, AssignmentIndexData } from "./types";

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
