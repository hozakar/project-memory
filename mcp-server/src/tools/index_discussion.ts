import { embed } from "../embedder";
import { upsert } from "../db";
import { buildDiscussionText } from "../utils";
import type { DiscussionIndexData, LanceRecord, Identity } from "../types";

export async function indexDiscussion(
  data: DiscussionIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const createdBy: Identity = data.createdBy ?? { name: "unknown", email: "unknown" };
    const contributors: Identity[] = data.contributors ?? [];

    let text = buildDiscussionText(data);
    text += `\nAuthor: ${createdBy.name} <${createdBy.email}>`;

    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "discussion",
      title: data.title,
      text,
      vector,
      createdByName: createdBy.name,
      createdByEmail: createdBy.email,
      contributorsJson: JSON.stringify(contributors),
      tagsJson: JSON.stringify(data.tags),
    };
    await upsert(record);
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
