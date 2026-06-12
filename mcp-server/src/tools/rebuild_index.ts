import { embed } from "../embedder";
import { atomicRebuild } from "../db";
import type { IndexEntry, LanceRecord, PhaseIndexData, DecisionIndexData } from "../types";

export async function rebuildIndex(entries: IndexEntry[]): Promise<{ indexed: number; failed: number }> {
  const records: LanceRecord[] = [];
  let failCount = 0;

  for (const entry of entries) {
    try {
      let text: string;

      if (entry.type === "phase") {
        const data = entry.data as PhaseIndexData;
        const diffsText = data.commitDiffs
          .map(d => `[${d.hash}] ${d.message}: ${d.files.join(", ")}\n${d.diffSnippet}`)
          .join("\n");
        text = `${data.title}\n${data.tags.join(", ")}\n${data.planText}\n${data.implementationText}\n${diffsText}`;
        text = text.slice(0, 6000);
      } else {
        const data = entry.data as DecisionIndexData;
        text = `${data.title}\n${data.status}\n${data.touches.join(", ")}\n${data.context}\n${data.decisionBody}`;
        text = text.slice(0, 4000);
      }

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
    return result;
  } catch {
    return { indexed: 0, failed: entries.length };
  }
}