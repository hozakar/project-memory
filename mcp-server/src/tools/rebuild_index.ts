import * as path from "path";
import * as fs from "fs";
import { embedBatch } from "../embedder";
import { atomicRebuild } from "../db";
import { buildDecisionText, buildDiscussionText, buildCommitText, buildInstructionText, buildNoteText, deriveOutcomeType } from "../utils";
import { parseDecisionFile, parseDiscussionFile, parseInstructionFile, parseNoteFile, ParseError } from "../parser";
import type { IndexEntry, LanceRecord, CommitDiff, PhaseIndexData, DecisionIndexData, DiscussionIndexData, InstructionIndexData, NoteIndexData, Identity } from "../types";

const UNKNOWN_IDENTITY: Identity = { name: "unknown", email: "unknown" };

// ---------------------------------------------------------------------------
// Public API with overloaded signature
// ---------------------------------------------------------------------------

/**
 * Backward compat: accept array for existing callers (e.g. rebuild_index_commit_survival.test.ts)
 */
export async function rebuildIndex(
  arg: IndexEntry[] | RebuildOptions,
): Promise<{ indexed: number; failed: number; skipped: number }> {
  if (Array.isArray(arg)) {
    return rebuildFromEntries(arg).then(r => ({ ...r, skipped: 0 }));
  }
  if (arg.mode === "fs") {
    return rebuildFromFs(arg.projectMemoryDir);
  }
  return rebuildFromEntries(arg.entries).then(r => ({ ...r, skipped: 0 }));
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
// Helpers
// ---------------------------------------------------------------------------

interface TextTuple {
  text: string;
  createdBy: Identity | undefined;
  contributors: Identity[];
}

interface EntryTextTuple extends TextTuple {
  type: IndexEntry["type"];
  data: IndexEntry["data"];
}

interface FsTextTuple extends TextTuple {
  type: string;
  id: string;
  title: string;
  touches?: string[];
  tags?: string[];
  decisionStatus?: string;
  outcome?: string;
  instructionState?: string;
  instructionPrompt?: string;
}

interface CommitTextTuple {
  text: string;
  id: string;
  title: string;
}

// ---------------------------------------------------------------------------
// Entries mode (existing behaviour, extracted as private function)
// ---------------------------------------------------------------------------

async function rebuildFromEntries(
  entries: IndexEntry[],
): Promise<{ indexed: number; failed: number }> {
  const records: LanceRecord[] = [];
  let failCount = 0;

  // Phase 1: Build text tuples from all entry types (no embedding yet)
  const tuples: EntryTextTuple[] = [];
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

      tuples.push({ text, createdBy, contributors, type: entry.type, data: entry.data });
    } catch (err) {
      console.error("rebuild_index entry failed:", err);
      failCount++;
    }
  }

  // Phase 2: Embed all in parallel (batched for embedder safety)
  const vectors = await embedBatch(tuples.map(t => t.text), 4);

  // Phase 3: Build records from tuples + vectors
  for (let i = 0; i < tuples.length; i++) {
    const { text, createdBy, contributors, type, data } = tuples[i];
    const vector = vectors[i];
    const title = type === "instruction" ? (data as InstructionIndexData).id : (data as PhaseIndexData | DecisionIndexData | DiscussionIndexData | NoteIndexData).title;
    const record: LanceRecord = {
      id: (data as { id: string }).id,
      type,
      title,
      text,
      vector,
      status: type === "instruction" ? ((data as InstructionIndexData).state ?? "") : "",
    };
    if (type === "instruction") {
      // Injected verbatim into sessions — keep it free of the search metadata in `text`.
      record.body = (data as InstructionIndexData).prompt;
    }
    if (type === "phase") {
      const pData = data as PhaseIndexData;
      record.tagsJson = JSON.stringify(pData.tags ?? []);
    } else if (type === "note") {
      const nData = data as NoteIndexData;
      record.tagsJson = JSON.stringify(nData.tags ?? []);
    } else if (type === "decision") {
      const dData = data as DecisionIndexData;
      record.touchesJson = JSON.stringify(dData.touches ?? []);
      record.status = dData.status;
    } else if (type === "discussion") {
      const discData = data as DiscussionIndexData;
      record.tagsJson = JSON.stringify(discData.tags ?? []);
      record.outcomeType = deriveOutcomeType(discData.outcome);
    }
    if (createdBy) {
      record.createdByName = createdBy.name;
      record.createdByEmail = createdBy.email;
      record.contributorsJson = JSON.stringify(contributors ?? []);
    }
    records.push(record);
  }

  // Phase 4: Build per-commit text tuples
  const commitTuples: CommitTextTuple[] = [];
  for (const entry of entries) {
    try {
      const maybeDiffs: CommitDiff[] | undefined = (entry.data as { commitDiffs?: CommitDiff[] }).commitDiffs;
      if (!maybeDiffs || maybeDiffs.length === 0) continue;
      for (const diff of maybeDiffs) {
        const commitText = buildCommitText(diff);
        commitTuples.push({
          text: commitText,
          id: `${entry.data.id}__commit__${diff.hash}`,
          title: diff.message,
        });
      }
    } catch (err) {
      console.error("rebuild_index commit entry failed:", err);
      failCount++;
    }
  }

  // Phase 5: Embed commit texts in parallel (batched for embedder safety)
  const commitVectors = await embedBatch(commitTuples.map(t => t.text), 4);

  // Phase 6: Build commit records
  for (let i = 0; i < commitTuples.length; i++) {
    records.push({
      id: commitTuples[i].id,
      type: "commit",
      title: commitTuples[i].title,
      text: commitTuples[i].text,
      vector: commitVectors[i],
      status: "",
    });
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
  if (!fs.existsSync(projectMemoryDir)) {
    return { indexed: 0, failed: 0, skipped: 0 };
  }

  const records: LanceRecord[] = [];
  let failCount = 0;
  let skipCount = 0;

  const dirConfig: Array<{
    subdir: string;
    parse: (filePath: string) => DecisionIndexData | DiscussionIndexData | InstructionIndexData | NoteIndexData;
    type: "decision" | "discussion" | "instruction" | "note";
  }> = [
    { subdir: "decisions", parse: parseDecisionFile, type: "decision" },
    { subdir: "discussions", parse: parseDiscussionFile, type: "discussion" },
    { subdir: "instructions", parse: parseInstructionFile, type: "instruction" },
    { subdir: "notes", parse: parseNoteFile, type: "note" },
  ];

  // Phase 1: Read + parse all files into tuples (no embedding yet)
  const tuples: FsTextTuple[] = [];

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
            tuples.push({ text, createdBy, contributors, type, id: d.id, title: d.title, touches: d.touches ?? [], decisionStatus: d.status });
            break;
          }
          case "discussion": {
            const d = parsed as DiscussionIndexData;
            text = buildDiscussionText(d);
            createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
            contributors = d.contributors ?? [];
            tuples.push({ text, createdBy, contributors, type, id: d.id, title: d.title, tags: d.tags ?? [], outcome: d.outcome });
            break;
          }
          case "instruction": {
            const d = parsed as InstructionIndexData;
            text = buildInstructionText(d);
            createdBy = d.createdBy ?? UNKNOWN_IDENTITY;
            contributors = [];
            tuples.push({ text, createdBy, contributors, type, id: d.id, title: d.id, instructionState: d.state, instructionPrompt: d.prompt });
            break;
          }
          case "note": {
            const d = parsed as NoteIndexData;
            text = buildNoteText(d);
            createdBy = d.createdBy;
            contributors = [];
            tuples.push({ text, createdBy, contributors, type, id: d.id, title: d.title || d.id, tags: d.tags ?? [] });
            break;
          }
        }
      } catch (err) {
        if (err instanceof ParseError) {
          if (err.kind === "io") {
            console.warn(`[rebuild_index] I/O error on ${filePath}: ${err.message}`);
            failCount++;
          } else {
            console.warn(`[rebuild_index] Skipped unparseable file ${filePath}: ${err.message}`);
            skipCount++;
          }
        } else {
          console.error(`[rebuild_index] Unexpected error on ${filePath}:`, err);
          failCount++;
        }
      }
    }
  }

  // Phase 2: Embed all in parallel (batched for embedder safety)
  const vectors = await embedBatch(tuples.map(t => t.text), 4);

  // Phase 3: Build LanceRecord objects from tuples + vectors
  for (let i = 0; i < tuples.length; i++) {
    const t = tuples[i];
    const vector = vectors[i];

    if (t.createdBy) {
      t.text += `\nAuthor: ${t.createdBy.name} <${t.createdBy.email}>`;
    }

    const record: LanceRecord = {
      id: t.id,
      type: t.type as LanceRecord["type"],
      title: t.title,
      text: t.text,
      vector,
      status: "",
    };

    if (t.type === "decision") {
      record.touchesJson = JSON.stringify(t.touches ?? []);
      record.status = t.decisionStatus ?? "";
    } else if (t.type === "discussion") {
      record.tagsJson = JSON.stringify(t.tags ?? []);
      record.outcomeType = deriveOutcomeType(t.outcome ?? "");
    } else if (t.type === "note") {
      record.tagsJson = JSON.stringify(t.tags ?? []);
    } else if (t.type === "instruction") {
      // Without these a full rebuild wipes every instruction's active/dropped state,
      // which is what the search filter and the binding-prefix gate both key on.
      record.status = t.instructionState ?? "";
      record.body = t.instructionPrompt;
    }

    if (t.createdBy) {
      record.createdByName = t.createdBy.name;
      record.createdByEmail = t.createdBy.email;
      record.contributorsJson = JSON.stringify(t.contributors ?? []);
    }

    records.push(record);
  }

  try {
    const result = await atomicRebuild(records);
    return { indexed: result.indexed, failed: result.failed + failCount, skipped: skipCount };
  } catch (err) {
    console.error("rebuild_index atomicRebuild failed:", err);
    return { indexed: 0, failed: records.length + failCount, skipped: skipCount };
  }
}
