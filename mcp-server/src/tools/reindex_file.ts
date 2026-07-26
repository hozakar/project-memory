import * as fs from "fs";
import * as path from "path";
import { embed } from "../embedder";
import { upsert } from "../db";
import {
  buildDecisionText,
  buildDiscussionText,
  buildInstructionText,
  buildAssignmentText,
  buildNoteText,
  deriveOutcomeType,
} from "../utils";
import {
  ParseError,
  parseDecisionFile,
  parseDiscussionFile,
  parseInstructionFile,
  parseAssignmentFile,
  parseNoteFile,
} from "../parser";
import type { LanceRecord, Identity } from "../types";

export type SupportedType = "decision" | "discussion" | "instruction" | "assignment" | "note";

export interface ReindexResult {
  success: boolean;
  error?: string;
  details?: string;
}

const UNKNOWN_IDENTITY: Identity = { name: "unknown", email: "unknown" };

/**
 * Re-index a single file by reading it from disk, parsing it, and upserting it
 * into the vector DB.  Resolves relative paths against projectMemoryDir.
 */
export async function reindexFile(
  projectMemoryDir: string,
  type: SupportedType,
  filePath: string,
): Promise<ReindexResult> {
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectMemoryDir, filePath);

  // Early check — file must exist on disk
  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      error: "file_not_found",
      details: `File not found: ${absolutePath}`,
    };
  }

  try {
    switch (type) {
      case "decision": {
        const d = parseDecisionFile(absolutePath);
        const text = buildDecisionText(d);
        const createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        const contributors = d.contributors ?? [];

        const vector = await embed(text);
        const record: LanceRecord = {
          id: d.id,
          type: "decision",
          title: d.title,
          text,
          vector,
          createdByName: createdBy.name,
          createdByEmail: createdBy.email,
          contributorsJson: JSON.stringify(contributors),
          touchesJson: JSON.stringify(d.touches ?? []),
          primaryScope: d.primaryScope,
          status: d.status,
        };
        await upsert(record);
        break;
      }
      case "discussion": {
        const d = parseDiscussionFile(absolutePath);
        const text = buildDiscussionText(d);
        const createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        const contributors = d.contributors ?? [];

        const vector = await embed(text);
        const record: LanceRecord = {
          id: d.id,
          type: "discussion",
          title: d.title,
          text,
          vector,
          createdByName: createdBy.name,
          createdByEmail: createdBy.email,
          contributorsJson: JSON.stringify(contributors),
          tagsJson: JSON.stringify(d.tags ?? []),
          outcomeType: deriveOutcomeType(d.outcome),
        };
        await upsert(record);
        break;
      }
      case "instruction": {
        const d = parseInstructionFile(absolutePath);
        const text = buildInstructionText(d);
        const createdBy = d.createdBy ?? UNKNOWN_IDENTITY;

        const vector = await embed(text);
        const record: LanceRecord = {
          id: d.id,
          type: "instruction",
          title: d.id,
          text,
          vector,
          createdByName: createdBy.name,
          createdByEmail: createdBy.email,
          contributorsJson: JSON.stringify([]),
        };
        await upsert(record);
        break;
      }
      case "assignment": {
        const d = parseAssignmentFile(absolutePath);
        const text = buildAssignmentText(d);
        const createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        const contributors = d.contributors ?? [];

        const vector = await embed(text);
        const record: LanceRecord = {
          id: d.id,
          type: "assignment",
          title: d.id,
          text,
          vector,
          createdByName: createdBy.name,
          createdByEmail: createdBy.email,
          contributorsJson: JSON.stringify(contributors),
          assignedToEmail: d.assignedTo.email,
          assignedByEmail: d.assignedBy.email,
        };
        await upsert(record);
        break;
      }
      case "note": {
        const d = parseNoteFile(absolutePath);
        const text = buildNoteText(d);
        const createdBy = d.createdBy;

        const vector = await embed(text);
        const record: LanceRecord = {
          id: d.id,
          type: "note",
          title: d.title,
          text,
          vector,
          createdByName: createdBy.name,
          createdByEmail: createdBy.email,
          contributorsJson: JSON.stringify([]),
          tagsJson: JSON.stringify(d.tags ?? []),
        };
        await upsert(record);
        break;
      }
      default: {
        return {
          success: false,
          error: "unsupported_type",
          details: `Unsupported type: ${type}`,
        };
      }
    }

    return { success: true };
  } catch (err) {
    // Race: file deleted between existsSync and readFileSync
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { success: false, error: "file_not_found", details: `File not found: ${absolutePath}` };
    }
    if (err instanceof ParseError) {
      if (err.kind === "io") {
        return { success: false, error: "io_error", details: err.message };
      }
      return { success: false, error: "parse_error", details: err.message };
    }
    return { success: false, error: "unknown_error", details: (err as Error).message };
  }
}
