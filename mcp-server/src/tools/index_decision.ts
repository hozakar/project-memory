import { embed } from "../embedder";
import { upsert } from "../db";
import { buildDecisionText } from "../utils";
import type { DecisionIndexData, LanceRecord } from "../types";

/**
 * Indexes or updates a decision in the vector database.
 * Called when a DECISION file is created or when its status changes
 * (e.g. active → superseded).
 */
export async function indexDecision(
  data: DecisionIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const text = buildDecisionText(data);
    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "decision",
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