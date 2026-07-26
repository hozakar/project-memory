import * as path from "path";
import * as fs from "fs";
import { embed } from "../embedder";
import { atomicRebuild } from "../db";
import { buildDecisionText, buildDiscussionText, buildCommitText, buildInstructionText, buildAssignmentText, buildNoteText, deriveOutcomeType } from "../utils";
import { parseDecisionFile, parseDiscussionFile, parseInstructionFile, parseAssignmentFile, parseNoteFile, ParseError } from "../parser";
import type { IndexEntry, LanceRecord, CommitDiff, PhaseIndexData, DecisionIndexData, DiscussionIndexData, InstructionIndexData, AssignmentIndexData, NoteIndexData, Identity } from "../types";

const UNKNOWN_IDENTITY: Identity = { name: "unknown", email: "unknown" };

// ---------------------------------------------------------------------------
// Public API with overloaded signature
// ---------------------------------------------------------------------------

/**
 * Backward compat: accept array for existing callers (e.g. rebuild_index_commit_survival.test.ts)
 */
export async function rebuildIndex(
  arg: IndexEntry[] | RebuildOptions,
): Promise<{ indexed: number; failed: number; skipped?: number }> {
  if (Array.isArray(arg)) {
    return rebuildFromEntries(arg);
  }
  if (arg.mode === "fs") {
    return rebuildFromFs(arg.projectMemoryDir);
  }
  return rebuildFromEntries(arg.entries);
}

// ---------------------------------------------------------------------------
// Options types
// ---------------------------------------------------------------------------

interface RebuildEntriesOptions {
  mode: "entries";
  entries: IndexEntry[];
  projectMemoryDir?: string;
}

interface RebuildFsOptions {
  mode: "fs";
  projectMemoryDir: string;
}

type RebuildOptions = RebuildEntriesOptions | RebuildFsOptions;

// ---------------------------------------------------------------------------
// Entries mode (existing behaviour, extracted as private function)
// ---------------------------------------------------------------------------

async function rebuildFromEntries(
  entries: IndexEntry[],
): Promise<{ indexed: number; failed: number }> {
  const records: LanceRecord[] = [];
  let failCount = 0;

  // Phase 1: Build main content records from all entry types
  for (const entry of entries) {
    try {
      let text: string;
      let createdBy: Identity | undefined;
      let contributors: Identity[] | undefined;
      if (entry.type === "phase") {
        const d = entry.data as PhaseIndexData;
        const parts: string[] = [
          d.title,
          (d.tags ?? []).join(" "),
          d.planText,
          d.implementationText,
        ];
        for (const diff of d.commitDiffs) {
          parts.push(`${diff.message}\n${diff.files.join(" ")}\n${diff.diffSnippet}`);
        }
        text = parts.join("\n").slice(0, 6000);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      } else if (entry.type === "decision") {
        const d = entry.data as DecisionIndexData;
        text = buildDecisionText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      } else if (entry.type === "era") {
        // era: legacy type — no build handler (era concept dropped 2026-07-11). Historical era rows remain in DB but are not rebuilt.
        continue;
      } else if (entry.type === "instruction") {
        const d = entry.data as InstructionIndexData;
        text = buildInstructionText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = [];
      } else if (entry.type === "assignment") {
        const d = entry.data as AssignmentIndexData;
        text = buildAssignmentText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      } else if (entry.type === "note") {
        const d = entry.data as NoteIndexData;
        text = buildNoteText(d);
        createdBy = d.createdBy;
        contributors = [];
      } else {
        const d = entry.data as DiscussionIndexData;
        text = buildDiscussionText(d);
        createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
        contributors = d.contributors ?? [];
      }

      if (createdBy) {
        text += `\nAuthor: ${createdBy.name} <${createdBy.email}>`;
      }

      const vector = await embed(text);
      const title = entry.type === "instruction" ? entry.data.id : (entry.data as PhaseIndexData | DecisionIndexData | DiscussionIndexData | NoteIndexData).title;
      const record: LanceRecord = {
        id: entry.data.id,
        type: entry.type,
        title,
        text,
        vector,
        status: "",
      };
      if (entry.type === "phase") {
        const pData = entry.data as PhaseIndexData;
        record.tagsJson = JSON.stringify(pData.tags ?? []);
      } else if (entry.type === "note") {
        const nData = entry.data as NoteIndexData;
        record.tagsJson = JSON.stringify(nData.tags ?? []);
      } else if (entry.type === "decision") {
        const dData = entry.data as DecisionIndexData;
        record.touchesJson = JSON.stringify(dData.touches ?? []);
        record.status = dData.status;
      } else if (entry.type === "discussion") {
        const discData = entry.data as DiscussionIndexData;
        record.tagsJson = JSON.stringify(discData.tags ?? []);
        record.outcomeType = deriveOutcomeType(discData.outcome);
      }
      if (createdBy) {
        record.createdByName = createdBy.name;
        record.createdByEmail = createdBy.email;
        record.contributorsJson = JSON.stringify(contributors ?? []);
      }
      if (entry.type === "assignment") {
        const aData = entry.data as AssignmentIndexData;
        record.assignedToEmail = aData.assignedTo.email;
        record.assignedByEmail = aData.assignedBy.email;
      }
      records.push(record);
    } catch (err) {
      console.error("rebuild_index entry failed:", err);
      failCount++;
    }
  }

  // Phase 2: Build per-commit records from any entry that carries commitDiffs
  // (decoupled from phase guard so commit records survive rebuilds with zero phase entries)
  for (const entry of entries) {
    try {
      const maybeDiffs: CommitDiff[] | undefined = (entry.data as { commitDiffs?: CommitDiff[] }).commitDiffs;
      if (!maybeDiffs || maybeDiffs.length === 0) continue;
      for (const diff of maybeDiffs) {
        const commitText = buildCommitText(diff);
        const commitVector = await embed(commitText);
        records.push({
          id: `${entry.data.id}__commit__${diff.hash}`,
          type: "commit",
          title: diff.message,
          text: commitText,
          vector: commitVector,
          status: "",
        });
      }
    } catch (err) {
      console.error("rebuild_index commit entry failed:", err);
      failCount++;
    }
  }

  try {
    const result = await atomicRebuild(records);
    return { indexed: result.indexed, failed: result.failed + failCount };
  } catch (err) {
    console.error("rebuild_index atomicRebuild failed:", err);
    return { indexed: 0, failed: entries.length };
  }
}

// ---------------------------------------------------------------------------
// Filesystem mode
// ---------------------------------------------------------------------------

async function rebuildFromFs(
  projectMemoryDir: string,
): Promise<{ indexed: number; failed: number; skipped: number }> {
  const records: LanceRecord[] = [];
  let failCount = 0;
  let skipCount = 0;

  const dirConfig: Array<{
    subdir: string;
    parse: (filePath: string) => DecisionIndexData | DiscussionIndexData | InstructionIndexData | AssignmentIndexData | NoteIndexData;
    type: "decision" | "discussion" | "instruction" | "assignment" | "note";
  }> = [
    { subdir: "decisions", parse: parseDecisionFile, type: "decision" },
    { subdir: "discussions", parse: parseDiscussionFile, type: "discussion" },
    { subdir: "instructions", parse: parseInstructionFile, type: "instruction" },
    { subdir: "assignments", parse: parseAssignmentFile, type: "assignment" },
    { subdir: "notes", parse: parseNoteFile, type: "note" },
  ];

  for (const { subdir, parse, type } of dirConfig) {
    const dirPath = path.join(projectMemoryDir, subdir);
    let fileNames: string[];
    try {
      fileNames = fs.readdirSync(dirPath).filter(
        (f) => f.endsWith(".md") && f !== "index.md" && f !== "index.yml",
      );
    } catch {
      // Directory does not exist or cannot be read — skip silently
      continue;
    }

    for (const fileName of fileNames) {
      const filePath = path.join(dirPath, fileName);
      try {
        const parsed = parse(filePath);
        let text: string;
        let createdBy: Identity | undefined;
        let contributors: Identity[] | undefined;

        switch (type) {
          case "decision": {
            const d = parsed as DecisionIndexData;
            text = buildDecisionText(d);
            createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
            contributors = d.contributors ?? [];
            break;
          }
          case "discussion": {
            const d = parsed as DiscussionIndexData;
            text = buildDiscussionText(d);
            createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
            contributors = d.contributors ?? [];
            break;
          }
          case "instruction": {
            const d = parsed as InstructionIndexData;
            text = buildInstructionText(d);
            createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
            contributors = [];
            break;
          }
          case "assignment": {
            const d = parsed as AssignmentIndexData;
            text = buildAssignmentText(d);
            createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
            contributors = d.contributors ?? [];
            break;
          }
          case "note": {
            const d = parsed as NoteIndexData;
            text = buildNoteText(d);
            createdBy = d.createdBy;
            contributors = [];
            break;
          }
        }

        if (createdBy) {
          text += `\nAuthor: ${createdBy.name} <${createdBy.email}>`;
        }

        const vector = await embed(text);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const title = type === "instruction" ? (parsed as any).id : (parsed as any).title || (parsed as any).id;
        const record: LanceRecord = {
          id: (parsed as { id: string }).id,
          type,
          title,
          text,
          vector,
          status: "",
        };

        // Type-specific extra fields
        if (type === "decision") {
          const d = parsed as DecisionIndexData;
          record.touchesJson = JSON.stringify(d.touches ?? []);
          record.status = d.status;
        } else if (type === "discussion") {
          const d = parsed as DiscussionIndexData;
          record.tagsJson = JSON.stringify(d.tags ?? []);
          record.outcomeType = deriveOutcomeType(d.outcome);
        } else if (type === "note") {
          const d = parsed as NoteIndexData;
          record.tagsJson = JSON.stringify(d.tags ?? []);
        } else if (type === "assignment") {
          const d = parsed as AssignmentIndexData;
          record.assignedToEmail = d.assignedTo.email;
          record.assignedByEmail = d.assignedBy.email;
        }

        if (createdBy) {
          record.createdByName = createdBy.name;
          record.createdByEmail = createdBy.email;
          record.contributorsJson = JSON.stringify(contributors ?? []);
        }

        records.push(record);
      } catch (err) {
        if (err instanceof ParseError) {
          skipCount++;
        } else {
          console.error(`rebuild_index fs-mode entry failed (${filePath}):`, err);
          failCount++;
        }
      }
    }
  }

  try {
    const result = await atomicRebuild(records);
    return { indexed: result.indexed, failed: result.failed + failCount, skipped: skipCount };
  } catch (err) {
    console.error("rebuild_index atomicRebuild failed:", err);
    return { indexed: 0, failed: records.length + failCount, skipped: skipCount };
  }
}
