import { embed } from "../embedder";
import { atomicRebuild } from "../db";
import { buildPhaseText, buildDecisionText } from "../utils";
import type { IndexEntry, LanceRecord, PhaseIndexData, DecisionIndexData } from "../types";

export async function rebuildIndex(entries: IndexEntry[]): Promise<{ indexed: number; failed: number }> {
  const records: LanceRecord[] = [];
  let failCount = 0;

  for (const entry of entries) {
    try {
      const text = entry.type === "phase"
        ? buildPhaseText(entry.data as PhaseIndexData)
        : buildDecisionText(entry.data as DecisionIndexData);

      const vector = await embed(text);
      records.push({
        id: entry.data.id,
        type: entry.type,
        title: entry.data.title,
        text,
        vector,
      });
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