import { embed } from "../embedder";
import { upsert } from "../db";
import { buildPhaseText, buildCommitText } from "../utils";
import type { PhaseIndexData, LanceRecord } from "../types";

export async function indexPhase(
  data: PhaseIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const text = buildPhaseText(data);
    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "phase",
      title: data.title,
      text,
      vector,
    };
    await upsert(record);

    // Upsert per-commit records for find_similar_commit
    for (const diff of data.commitDiffs) {
      try {
        const commitText = buildCommitText(diff);
        const commitVector = await embed(commitText);
        await upsert({
          id: `${data.id}__commit__${diff.hash}`,
          type: "commit",
          title: diff.message,
          text: commitText,
          vector: commitVector,
        });
      } catch {
        // non-fatal: individual commit index failure does not fail the phase index
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
