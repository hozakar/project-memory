import { embed } from "../embedder";
import { upsert } from "../db";
import { buildPhaseText } from "../utils";
import type { PhaseIndexData, LanceRecord } from "../types";

/**
 * Indexes or updates a phase in the vector database.
 * Called on phase open (with empty implementationText) and on phase close (with full content).
 */
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

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}