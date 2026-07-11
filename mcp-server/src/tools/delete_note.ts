import * as fs from "fs";
import * as path from "path";
import { deleteRecord, getRecord, dbPath } from "../db";
import { validateMemoryId } from "../validation.js";

/**
 * Deletes a note from both the LanceDB vector index and the filesystem.
 * Called when a user deletes their own note.
 * Notes are user-scoped (private) — deletion is owner-triggered only.
 */
export async function deleteNote(
  id: string,
  callerEmail?: string
): Promise<{ success: boolean; error?: string; details?: { dbDeleted: boolean; fsDeleted: boolean } }> {
  // Ownership check: verify callerEmail matches the note's created_by_email
  if (callerEmail) {
    const record = await getRecord(id);
    if (record) {
      const noteOwnerEmail = record.createdByEmail as string | undefined;
      if (noteOwnerEmail && noteOwnerEmail !== callerEmail) {
        return {
          success: false,
          error: `Ownership mismatch: caller email "${callerEmail}" does not match note owner email "${noteOwnerEmail}". Notes are user-scoped (private) — only the owner may delete.`,
          details: { dbDeleted: false, fsDeleted: false },
        };
      }
    }
  }

  const result = {
    success: false,
    dbDeleted: false,
    fsDeleted: false,
    error: undefined as string | undefined,
  };

  // 1. Delete from LanceDB
  const dbResult = await deleteRecord(id);
  result.dbDeleted = dbResult.success;
  if (!dbResult.success) {
    result.error = `DB delete failed: ${dbResult.error}`;
  }

  // 2. Delete from filesystem
  try {
    const projectMemoryDir = path.dirname(dbPath());
    validateMemoryId(id, "id");
    const notePath = path.join(projectMemoryDir, "notes", `${id}.md`);
    if (fs.existsSync(notePath)) {
      fs.unlinkSync(notePath);
      result.fsDeleted = true;
    } else {
      result.fsDeleted = false;
      if (!result.error) {
        result.error = `Note file not found: ${notePath}`;
      }
    }
  } catch (err) {
    if (!result.error) {
      result.error = `FS delete failed: ${(err as Error).message}`;
    }
    result.fsDeleted = false;
  }

  result.success = result.dbDeleted && result.fsDeleted;
  return {
    success: result.success,
    error: result.success ? undefined : result.error,
    details: { dbDeleted: result.dbDeleted, fsDeleted: result.fsDeleted },
  };
}
