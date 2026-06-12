import { embed } from "../embedder";
import { upsert } from "../db";
import { buildEraText } from "../utils";
import type { EraIndexData, LanceRecord } from "../types";

export async function indexEra(
  data: EraIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const text = buildEraText(data);
    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "era",
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
