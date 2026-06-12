import { embed } from "../embedder";
import { upsert } from "../db";
import { buildDiscussionText } from "../utils";
import type { DiscussionIndexData, LanceRecord } from "../types";

export async function indexDiscussion(
  data: DiscussionIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const text = buildDiscussionText(data);
    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "discussion",
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
