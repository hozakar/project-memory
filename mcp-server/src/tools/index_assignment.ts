import { embed } from "../embedder";
import { upsert } from "../db";
import { buildAssignmentText } from "../utils";
import type { AssignmentIndexData, LanceRecord, Identity } from "../types";

/**
 * Indexes or updates an assignment in the vector database.
 * Called when an ASSIGNMENT file is created or when its status changes
 * (e.g. pending → accepted, ongoing → completed).
 */
export async function indexAssignment(
  data: AssignmentIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const createdBy: Identity = data.createdBy ?? { name: "unknown", email: "unknown" };
    const contributors: Identity[] = data.contributors ?? [];

    let text = buildAssignmentText(data);
    text += `\nAuthor: ${createdBy.name} <${createdBy.email}>`;

    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "assignment",
      title: data.id,  // assignments don't have a separate title — use ID
      text,
      vector,
      createdByName: createdBy.name,
      createdByEmail: createdBy.email,
      contributorsJson: JSON.stringify(contributors),
    };

    await upsert(record);

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
