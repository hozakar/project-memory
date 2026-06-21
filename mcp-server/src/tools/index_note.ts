import { embed } from "../embedder";
import { upsert } from "../db";
import { buildNoteText } from "../utils";
import type { NoteIndexData, LanceRecord } from "../types";

/**
 * Indexes or updates a note in the vector database.
 * Called when a NOTE file is created or updated.
 * Notes are user-scoped (private) — search is constrained to the owner's email.
 */
export async function indexNote(
  data: NoteIndexData
): Promise<{ success: boolean; error?: string }> {
  try {
    let text = buildNoteText(data);
    text += `\nAuthor: ${data.createdBy.name} <${data.createdBy.email}>`;

    const vector = await embed(text);
    const record: LanceRecord = {
      id: data.id,
      type: "note",
      title: data.title,
      text,
      vector,
      createdByName: data.createdBy.name,
      createdByEmail: data.createdBy.email,
      contributorsJson: JSON.stringify([]),
      tagsJson: JSON.stringify(data.tags ?? []),
    };

    await upsert(record);

    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
