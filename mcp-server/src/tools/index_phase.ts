import { embed } from "../embedder";
import { upsert } from "../db";
import type { PhaseIndexData, LanceRecord } from "../types";

/**
 * Indexes or updates a phase in the vector database.
 * Called on phase open (with empty implementationText) and on phase close (with full content).
 */
export async function indexPhase(
  data: PhaseIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const parts: string[] = [
      data.title,
      data.tags.join(" "),
      data.planText,
      data.implementationText,
    ];

    for (const diff of data.commitDiffs) {
      parts.push(
        `${diff.message}\n${diff.files.join(" ")}\n${diff.diffSnippet}`
      );
    }

    let text = parts.join("\n");
    if (text.length > 6000) {
      text = text.slice(0, 6000);
    }

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