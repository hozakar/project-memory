import * as fs from "fs";
import * as path from "path";
import { load as yamlParse } from "js-yaml";
import type {
  DecisionIndexData,
  DiscussionIndexData,
  InstructionIndexData,
  AssignmentIndexData,
  NoteIndexData,
  Identity,
} from "./types";

// ---------------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "ParseError";
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BOM = "\uFEFF";

/**
 * Normalize CRLF → LF, strip BOM from content.
 */
function normalizeContent(content: string): string {
  return content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(BOM, "");
}

/**
 * Read a file and return its normalized content.
 */
function readFileContent(filePath: string): string {
  try {
    return normalizeContent(fs.readFileSync(filePath, "utf-8"));
  } catch (err) {
    throw new ParseError(
      `Failed to read file: ${filePath}`,
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Split content into frontmatter and body.
 * Returns [frontmatterBody, bodyAfter] or null if no frontmatter.
 */
function splitFrontmatter(
  content: string,
): { fmBody: string; body: string } | null {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return null;
  return {
    fmBody: match[1],
    body: content.slice(match.index! + match[0].length),
  };
}

/**
 * Parse frontmatter YAML string into a Record.
 */
function parseYamlFrontmatter(fmYaml: string): Record<string, unknown> {
  try {
    const parsed = yamlParse(fmYaml);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return {};
  } catch (err) {
    throw new ParseError(
      "Failed to parse frontmatter YAML",
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Safely extract a string value from a parsed frontmatter field.
 */
function getString(
  fm: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = fm[key];
  if (typeof val === "string") return val;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  return undefined;
}

/**
 * Safely extract an Identity object from a parsed frontmatter field.
 */
function getIdentity(
  fm: Record<string, unknown>,
  key: string,
): Identity | undefined {
  const val = fm[key];
  if (val && typeof val === "object" && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    const name = getString(obj, "name") || "";
    const email = getString(obj, "email") || "";
    if (name || email) return { name, email };
  }
  return undefined;
}

/**
 * Safely extract an identity that is required.
 */
function getRequiredIdentity(
  fm: Record<string, unknown>,
  key: string,
  label: string,
): Identity {
  const id = getIdentity(fm, key);
  if (!id) {
    throw new ParseError(`Missing required frontmatter field: ${label}`);
  }
  return id;
}

/**
 * Safely extract a string array from a parsed frontmatter field.
 * Accepts YAML array or comma-separated string.
 */
function getStringArray(
  fm: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const val = fm[key];
  if (Array.isArray(val)) {
    return val.map((v) => String(v));
  }
  if (typeof val === "string") {
    // Comma or whitespace-separated
    return val
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return undefined;
}

/**
 * Safely extract an array of Identity objects.
 */
function getIdentityArray(
  fm: Record<string, unknown>,
  key: string,
): Identity[] | undefined {
  const val = fm[key];
  if (Array.isArray(val)) {
    const result: Identity[] = [];
    for (const item of val) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const obj = item as Record<string, unknown>;
        const name = getString(obj, "name") || "";
        const email = getString(obj, "email") || "";
        if (name || email) result.push({ name, email });
      }
    }
    return result.length > 0 ? result : undefined;
  }
  return undefined;
}

/**
 * Extract a section of text from markdown body between a heading and the next
 * heading (or end of string). The heading is matched by `# {name}` (or `## {name}`).
 * Returns the section text trimmed, or empty string if not found.
 */
function extractSection(body: string, headingName: string): string {
  const re = new RegExp(
    `(?:^|\\n)#{1,2}\\s*${escapeRegex(headingName)}\\s*\\n([\\s\\S]*?)(?=\\n#|$)`,
    "i",
  );
  const match = body.match(re);
  if (!match) return "";
  return match[1].trim();
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from markdown content.
 * Normalizes CRLF→LF, strips BOM, extracts content between `---` delimiters,
 * and parses it with js-yaml for full nested object/array support.
 */
export function parseFrontmatter(content: string): Record<string, unknown> {
  const normalized = normalizeContent(content);
  const split = splitFrontmatter(normalized);
  if (!split) return {};
  return parseYamlFrontmatter(split.fmBody);
}

/**
 * Parse a DECISION file from a string of markdown content.
 * If a file path is given instead, reads it from disk.
 */
export function parseDecisionFile(fileOrContent: string): DecisionIndexData {
  let content: string;
  // If it looks like a file path (contains path separators or ends with .md), try reading it
  if (
    fileOrContent.includes("\\") ||
    fileOrContent.includes("/") ||
    fileOrContent.endsWith(".md")
  ) {
    // Check if it's an actual file path
    if (fs.existsSync(fileOrContent)) {
      content = readFileContent(fileOrContent);
    } else {
      content = normalizeContent(fileOrContent);
    }
  } else {
    content = normalizeContent(fileOrContent);
  }

  // This handles both raw content strings and file paths.
  // If the string doesn't contain frontmatter, try it as a file path.
  if (
    !content.includes("---\n") &&
    !content.includes("---\r\n") &&
    fileOrContent.includes(".") &&
    !fileOrContent.includes("\n")
  ) {
    // Might be a file path — try reading it
    content = readFileContent(fileOrContent);
  }

  const fm = parseFrontmatter(content);

  const id = getString(fm, "id");
  const title = getString(fm, "title");
  const status = getString(fm, "status");

  if (!id) throw new ParseError("Missing required frontmatter field: id");
  if (!title) throw new ParseError("Missing required frontmatter field: title");
  if (!status)
    throw new ParseError("Missing required frontmatter field: status");

  // Get body after frontmatter
  const split = splitFrontmatter(content);
  const body = split ? split.body : content;

  // Extract sections
  const context = extractSection(body, "Context").slice(0, 1000);
  const decisionSection = extractSection(body, "Decision");
  const chosenSection = extractSection(body, "Chosen Solution");
  const decisionBody = [decisionSection, chosenSection]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 1000);

  return {
    id,
    title,
    status,
    provenance: getString(fm, "provenance") || getString(fm, "provenance"),
    primaryScope:
      getString(fm, "primary_scope") || getString(fm, "primaryScope"),
    context,
    decisionBody: decisionBody || "",
    touches: getStringArray(fm, "touches") || [],
    createdBy: getIdentity(fm, "created_by") || getIdentity(fm, "createdBy"),
    contributors:
      getIdentityArray(fm, "contributors") ||
      getIdentityArray(fm, "contributors"),
  };
}

/**
 * Parse a DISCUSSION file from disk.
 */
export function parseDiscussionFile(
  fileOrContent: string,
): DiscussionIndexData {
  let content: string;
  if (
    fileOrContent.includes("\\") ||
    fileOrContent.includes("/") ||
    fileOrContent.endsWith(".md")
  ) {
    if (fs.existsSync(fileOrContent)) {
      content = readFileContent(fileOrContent);
    } else {
      content = normalizeContent(fileOrContent);
    }
  } else {
    content = normalizeContent(fileOrContent);
  }

  if (
    !content.includes("---\n") &&
    !content.includes("---\r\n") &&
    fileOrContent.includes(".") &&
    !fileOrContent.includes("\n")
  ) {
    content = readFileContent(fileOrContent);
  }

  const fm = parseFrontmatter(content);

  const id = getString(fm, "id");
  const title = getString(fm, "title");
  const status = getString(fm, "status");
  const outcomeRaw = fm["outcome"];

  if (!id) throw new ParseError("Missing required frontmatter field: id");
  if (!title)
    throw new ParseError("Missing required frontmatter field: title");
  if (!status)
    throw new ParseError("Missing required frontmatter field: status");
  if (!outcomeRaw)
    throw new ParseError("Missing required frontmatter field: outcome");

  // Derive outcome string from outcome object
  let outcome: string;
  if (typeof outcomeRaw === "object" && outcomeRaw !== null && !Array.isArray(outcomeRaw)) {
    const outcomeObj = outcomeRaw as Record<string, unknown>;
    const outcomeType = getString(outcomeObj, "type") || "none";
    if (outcomeType === "none") {
      outcome = "none";
    } else if (outcomeType === "roadmap") {
      outcome = "roadmap";
    } else if (outcomeType === "phase" || outcomeType === "decision") {
      outcome = getString(outcomeObj, "id") || outcomeType;
    } else {
      outcome = outcomeType;
    }
  } else if (typeof outcomeRaw === "string") {
    outcome = outcomeRaw;
  } else {
    outcome = "none";
  }

  // bodyText = everything after frontmatter (first 2000 chars)
  const split = splitFrontmatter(content);
  // Extract the summary from the frontmatter
  const summary = getString(fm, "summary") || title;
  // bodyText = everything after frontmatter
  let bodyText = "";
  if (split) {
    // Remove the first heading if present (e.g., "# Discussion")
    bodyText = split.body.replace(/^#.*\n/, "").trim();
  }
  bodyText = bodyText.slice(0, 2000);

  return {
    id,
    title,
    status,
    provenance: getString(fm, "provenance") || getString(fm, "provenance"),
    outcome,
    tags: getStringArray(fm, "tags") || [],
    summary,
    bodyText,
    createdBy: getIdentity(fm, "created_by") || getIdentity(fm, "createdBy"),
    contributors:
      getIdentityArray(fm, "contributors") ||
      getIdentityArray(fm, "contributors"),
  };
}

/**
 * Parse an INSTRUCTION file from disk.
 */
export function parseInstructionFile(
  fileOrContent: string,
): InstructionIndexData {
  let content: string;
  if (
    fileOrContent.includes("\\") ||
    fileOrContent.includes("/") ||
    fileOrContent.endsWith(".md")
  ) {
    if (fs.existsSync(fileOrContent)) {
      content = readFileContent(fileOrContent);
    } else {
      content = normalizeContent(fileOrContent);
    }
  } else {
    content = normalizeContent(fileOrContent);
  }

  if (
    !content.includes("---\n") &&
    !content.includes("---\r\n") &&
    fileOrContent.includes(".") &&
    !fileOrContent.includes("\n")
  ) {
    content = readFileContent(fileOrContent);
  }

  const fm = parseFrontmatter(content);

  const id = getString(fm, "id");
  const state = getString(fm, "state");

  if (!id) throw new ParseError("Missing required frontmatter field: id");
  if (!state)
    throw new ParseError("Missing required frontmatter field: state");

  // Extract prompt — first try # Prompt section, then fall back to frontmatter prompt
  const split = splitFrontmatter(content);
  const body = split ? split.body : content;
  const promptSection = extractSection(body, "Prompt");
  const prompt = promptSection || getString(fm, "prompt") || "";

  return {
    id,
    prompt,
    state,
    createdBy: getIdentity(fm, "created_by") || getIdentity(fm, "createdBy"),
    origin: getString(fm, "origin"),
    originUpdated:
      fm["origin_updated"] === true || fm["originUpdated"] === true
        ? true
        : undefined,
  };
}

/**
 * Parse an ASSIGNMENT file from disk.
 */
export function parseAssignmentFile(
  fileOrContent: string,
): AssignmentIndexData {
  let content: string;
  if (
    fileOrContent.includes("\\") ||
    fileOrContent.includes("/") ||
    fileOrContent.endsWith(".md")
  ) {
    if (fs.existsSync(fileOrContent)) {
      content = readFileContent(fileOrContent);
    } else {
      content = normalizeContent(fileOrContent);
    }
  } else {
    content = normalizeContent(fileOrContent);
  }

  if (
    !content.includes("---\n") &&
    !content.includes("---\r\n") &&
    fileOrContent.includes(".") &&
    !fileOrContent.includes("\n")
  ) {
    content = readFileContent(fileOrContent);
  }

  const fm = parseFrontmatter(content);

  const id = getString(fm, "id") || "";
  const status = getString(fm, "status") || "";
  const type = getString(fm, "type") || "direct";

  // Required: assigned_to, assigned_by, assigned_at
  const assignedTo = getRequiredIdentity(fm, "assigned_to", "assigned_to");
  const assignedBy = getRequiredIdentity(fm, "assigned_by", "assigned_by");
  const assignedAt = getString(fm, "assigned_at") || "";

  // remindCount: if reminded is true, count=1; else 0
  const reminded = fm["reminded"];
  const remindCount =
    reminded === true || reminded === "true" ? 1 : 0;

  return {
    id,
    status,
    type,
    assignedTo,
    assignedBy,
    assignedAt,
    targetType: getString(fm, "target_type") ?? getString(fm, "targetType") ?? null,
    targetId: getString(fm, "target_id") ?? getString(fm, "targetId") ?? null,
    description:
      getString(fm, "description") ?? null,
    rejectedAt:
      getString(fm, "rejected_at") ?? getString(fm, "rejectedAt") ?? null,
    rejectionReason:
      getString(fm, "rejection_reason") ??
      getString(fm, "rejectionReason") ??
      null,
    completedAt:
      getString(fm, "completed_at") ?? getString(fm, "completedAt") ?? null,
    completionNote:
      getString(fm, "completion_note") ??
      getString(fm, "completionNote") ??
      null,
    completedDecisionId:
      getString(fm, "completed_decision_id") ??
      getString(fm, "completedDecisionId") ??
      null,
    completedDiscussionId:
      getString(fm, "completed_discussion_id") ??
      getString(fm, "completedDiscussionId") ??
      null,
    lastRemindedAt:
      getString(fm, "last_reminded_at") ??
      getString(fm, "lastRemindedAt") ??
      null,
    remindCount,
    createdBy: getIdentity(fm, "created_by") || getIdentity(fm, "createdBy"),
    contributors:
      getIdentityArray(fm, "contributors") ||
      getIdentityArray(fm, "contributors"),
  };
}

/**
 * Parse a NOTE file from disk.
 */
export function parseNoteFile(fileOrContent: string): NoteIndexData {
  let content: string;
  if (
    fileOrContent.includes("\\") ||
    fileOrContent.includes("/") ||
    fileOrContent.endsWith(".md")
  ) {
    if (fs.existsSync(fileOrContent)) {
      content = readFileContent(fileOrContent);
    } else {
      content = normalizeContent(fileOrContent);
    }
  } else {
    content = normalizeContent(fileOrContent);
  }

  if (
    !content.includes("---\n") &&
    !content.includes("---\r\n") &&
    fileOrContent.includes(".") &&
    !fileOrContent.includes("\n")
  ) {
    content = readFileContent(fileOrContent);
  }

  const fm = parseFrontmatter(content);

  const id = getString(fm, "id") || "";
  const title = getString(fm, "title") || id;

  // created_by is required for notes
  const createdBy = getRequiredIdentity(fm, "created_by", "created_by");

  const createdAt = getString(fm, "created_at") || getString(fm, "createdAt");
  const updatedAt = getString(fm, "updated_at") || getString(fm, "updatedAt");

  if (!createdAt)
    throw new ParseError("Missing required frontmatter field: created_at");
  if (!updatedAt)
    throw new ParseError("Missing required frontmatter field: updated_at");

  // Extract body: content under # Note heading
  const split = splitFrontmatter(content);
  const body = split ? split.body : content;
  const noteSection = extractSection(body, "Note");
  const bodyText = noteSection || "";

  return {
    id,
    title,
    tags: getStringArray(fm, "tags") || undefined,
    createdBy,
    body: bodyText,
    createdAt,
    updatedAt,
  };
}
