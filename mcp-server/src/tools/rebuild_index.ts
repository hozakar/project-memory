import { embed } from "../embedder";
import { atomicRebuild } from "../db";
import { buildPhaseText, buildDecisionText, buildDiscussionText, buildCommitText, buildEraText, buildInstructionText, buildAssignmentText } from "../utils";
import type { IndexEntry, LanceRecord, PhaseIndexData, DecisionIndexData, DiscussionIndexData, EraIndexData, InstructionIndexData, AssignmentIndexData, Identity } from "../types";

const UNKNOWN_IDENTITY: Identity = { name: "unknown", email: "unknown" };

export async function rebuildIndex(entries: IndexEntry[]): Promise<{ indexed: number; failed: number }> {
  const records: LanceRecord[] = [];
  let failCount = 0;

  for (const entry of entries) {
    try {
      let text: string;
      let createdBy: Identity | undefined;
      let contributors: Identity[] | undefined;
      if (entry.type === "phase") {
        const d = entry.data as PhaseIndexData;
        text = buildPhaseText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      } else if (entry.type === "decision") {
        const d = entry.data as DecisionIndexData;
        text = buildDecisionText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      } else if (entry.type === "era") {
        text = buildEraText(entry.data as EraIndexData);
        // Eras are out of scope for author attribution
      } else if (entry.type === "instruction") {
        const d = entry.data as InstructionIndexData;
        text = buildInstructionText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = [];
      } else if (entry.type === "assignment") {
        const d = entry.data as AssignmentIndexData;
        text = buildAssignmentText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      } else {
        const d = entry.data as DiscussionIndexData;
        text = buildDiscussionText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      }

      if (createdBy) {
        text += `\nAuthor: ${createdBy.name} <${createdBy.email}>`;
      }

      const vector = await embed(text);
      const title = entry.type === "instruction" ? entry.data.id : (entry.data as PhaseIndexData | DecisionIndexData | DiscussionIndexData | EraIndexData).title;
      const record: LanceRecord = {
        id: entry.data.id,
        type: entry.type,
        title,
        text,
        vector,
      };
      if (entry.type === "phase") {
        const pData = entry.data as PhaseIndexData;
        record.tagsJson = JSON.stringify(pData.tags ?? []);
      } else if (entry.type === "decision") {
        const dData = entry.data as DecisionIndexData;
        record.touchesJson = JSON.stringify(dData.touches ?? []);
      } else if (entry.type === "discussion") {
        const discData = entry.data as DiscussionIndexData;
        record.tagsJson = JSON.stringify(discData.tags ?? []);
      }
      if (createdBy) {
        record.createdByName = createdBy.name;
        record.createdByEmail = createdBy.email;
        record.contributorsJson = JSON.stringify(contributors ?? []);
      }
      if (entry.type === "assignment") {
        const aData = entry.data as AssignmentIndexData;
        record.assignedToEmail = aData.assignedTo.email;
        record.assignedByEmail = aData.assignedBy.email;
      }
      records.push(record);

      // For phase entries, also build per-commit records
      if (entry.type === "phase") {
        const phaseData = entry.data as PhaseIndexData;
        for (const diff of phaseData.commitDiffs) {
          try {
            const commitText = buildCommitText(diff);
            const commitVector = await embed(commitText);
            records.push({
              id: `${phaseData.id}__commit__${diff.hash}`,
              type: "commit",
              title: diff.message,
              text: commitText,
              vector: commitVector,
            });
          } catch {
            failCount++;
          }
        }
      }
    } catch {
      failCount++;
    }
  }

  try {
    const result = await atomicRebuild(records);
    return { indexed: result.indexed, failed: result.failed + failCount };
  } catch {
    return { indexed: 0, failed: entries.length };
  }
}
