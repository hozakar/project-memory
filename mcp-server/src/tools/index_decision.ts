import { embed } from "../embedder";
import { upsert } from "../db";
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
    // Build embeddable text from decision fields
    const text = [
      data.title,
      data.status,
      data.touches.join(" "),
      data.context,
      data.decisionBody,
    ]
      .join("\n")
      .slice(0, 4000);

    // Generate the embedding vector
    const vector = await embed(text);

    // Build the LanceDB record
    const record: LanceRecord = {
      id: data.id,
      type: "decision",
      title: data.title,
      text,
      vector,
    };

    // Upsert into the vector database
    await upsert(record);

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}