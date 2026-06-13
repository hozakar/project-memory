import { embed } from "../embedder";
import { upsert } from "../db";
import { buildDecisionText } from "../utils";
import type { DecisionIndexData, LanceRecord, Identity } from "../types";

/**
 * Indexes or updates a decision in the vector database.
 * Called when a DECISION file is created or when its status changes
 * (e.g. active → superseded).
 */
export async function indexDecision(
  data: DecisionIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const createdBy: Identity = data.createdBy ?? { name: "unknown", email: "unknown" };
    const contributors: Identity[] = data.contributors ?? [];

    let text = buildDecisionText(data);
    text += `\nAuthor: ${createdBy.name} <${createdBy.email}>`;

    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "decision",
      title: data.title,
      text,
      vector,
      createdByName: createdBy.name,
      createdByEmail: createdBy.email,
      contributorsJson: JSON.stringify(contributors),
      touchesJson: JSON.stringify(data.touches),
    };

    await upsert(record);

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}