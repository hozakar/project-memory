import { embed } from "../embedder";
import { upsert } from "../db";
import { buildInstructionText } from "../utils";
import type { InstructionIndexData, LanceRecord, Identity } from "../types";

/**
 * Indexes or updates an instruction in the vector database.
 * Called when an INSTRUCTION file is created or when its state changes
 * (e.g. active → dropped).
 */
export async function indexInstruction(
  data: InstructionIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    const createdBy: Identity = data.createdBy ?? { name: "unknown", email: "unknown" };

    let text = buildInstructionText(data);
    text += `\nAuthor: ${createdBy.name} <${createdBy.email}>`;

    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "instruction",
      title: data.id,  // instructions don't have a separate title — use ID
      text,
      vector,
      createdByName: createdBy.name,
      createdByEmail: createdBy.email,
      contributorsJson: JSON.stringify([]),
    };

    await upsert(record);

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
