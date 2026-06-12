import { embed } from "../embedder";
import { atomicRebuild } from "../db";
import { buildPhaseText, buildDecisionText, buildDiscussionText, buildCommitText } from "../utils";
import type { IndexEntry, LanceRecord, PhaseIndexData, DecisionIndexData, DiscussionIndexData } from "../types";

export async function rebuildIndex(entries: IndexEntry[]): Promise<{ indexed: number; failed: number }> {
  const records: LanceRecord[] = [];
  let failCount = 0;

  for (const entry of entries) {
    try {
      let text: string;
      if (entry.type === "phase") {
        text = buildPhaseText(entry.data as PhaseIndexData);
      } else if (entry.type === "decision") {
        text = buildDecisionText(entry.data as DecisionIndexData);
      } else {
        text = buildDiscussionText(entry.data as DiscussionIndexData);
      }

      const vector = await embed(text);
      records.push({
        id: entry.data.id,
        type: entry.type,
        title: entry.data.title,
        text,
        vector,
      });

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
