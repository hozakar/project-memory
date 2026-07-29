import * as fs from "fs";
import { load as yamlParse, FAILSAFE_SCHEMA } from "js-yaml";
import type {
  DecisionIndexData,
  DiscussionIndexData,
  InstructionIndexData,
  NoteIndexData,
  Identity,
} from "./types";

// ---------------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------------

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly kind: "io" | "parse",
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "ParseError";
  }
}

// Known markdown section headings — these are NOT document titles
const SECTION_HEADINGS = new Set([
  "context", "alternatives considered", "decision", "chosen solution",
  "reasoning", "consequences", "discussion points", "conclusions",
  "follow-up actions", "task description", "target", "note", "prompt",
]);

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
      "io",
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
  const match = content.match(/^---\n([\s\S]*?)\n?---\n?/);
  if (!match) return null;
  return {
    fmBody: match[1],
    body: content.slice(match.index! + match[0].length),
  };
}

/**
 * Parse frontmatter YAML string into a Record.
 * Falls back to a colon-tolerant strategy when standard YAML parsing fails
 * (e.g., unquoted values containing ": " which YAML interprets as map separators).
 */
function parseYamlFrontmatter(fmYaml: string): Record<string, unknown> {
  const trimmed = fmYaml.trim();
  if (!trimmed) return {};
  try {
    return doParseYaml(trimmed);
  } catch (firstErr) {
    // Try fixing colons in unquoted scalar values and retry
    try {
      const fixed = fixYamlColons(trimmed);
      return doParseYaml(fixed);
    } catch {
      throw new ParseError(
        "Failed to parse frontmatter YAML",
        "parse",
        firstErr instanceof Error ? firstErr : undefined,
      );
    }
  }
}

/**
 * Inner YAML parse — returns parsed Record or empty.
 */
function doParseYaml(yaml: string): Record<string, unknown> {
  const parsed = yamlParse(yaml, { schema: FAILSAFE_SCHEMA });
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>;
  }
  return {};
}

/**
 * Quote unquoted single-line scalar values that contain ": " patterns.
 * This prevents YAML from interpreting prose colons as map separators.
 * Preserves nested mappings (indented sub-keys) and flow sequences.
 *
 * Example: summary: Resolved issue: title fix → summary: "Resolved issue: title fix"
 */
function fixYamlColons(fmYaml: string): string {
  const lines = fmYaml.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    // Only touch top-level lines: "key: value" where value is a single-line scalar
    const m = line.match(/^(\w[\w-]*):\s+(.+)$/);
    if (m) {
      const key = m[1];
      const value = m[2].trim();
      // If value contains ": " and is NOT already quoted or a flow sequence
      if (/:\s/.test(value) && !/^["'[]/.test(value)) {
        result.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
        continue;
      }
    }
    result.push(line);
  }

  return result.join("\n");
}

/**
 * Safely extract a string value from a parsed frontmatter field.
 */
function getString(
  fm: Record<string, unknown>,
  key: string,
): string | undefined {
  const val = fm[key];
  if (typeof val === "string") {
    // FAILSAFE_SCHEMA preserves YAML null as the literal string "null".
    // Treat it as undefined so that `?? null` fallbacks at call sites work.
    if (val === "null" || val === "~") return undefined;
    return val;
  }
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
    throw new ParseError(`Missing required frontmatter field: ${label}`, "parse");
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
  let title = getString(fm, "title");
  const status = getString(fm, "status");

  if (!id) throw new ParseError("Missing required frontmatter field: id", "parse");

  // Get body after frontmatter
  const split = splitFrontmatter(content);
  const body = split ? split.body : content;

  // Fallback: if title is missing from frontmatter, extract from first
  // # heading that is NOT a known section heading
  if (!title) {
    const headingRegex = /^#\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(body)) !== null) {
      const candidate = match[1].trim().replace(/^["']|["']$/g, "");
      if (!SECTION_HEADINGS.has(candidate.toLowerCase())) {
        title = candidate;
        break;
      }
    }
  }
  // Last-resort fallback: use ID as title
  if (!title) title = id;

  if (!status)
    throw new ParseError("Missing required frontmatter field: status", "parse");

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
    provenance: getString(fm, "provenance"),
    primaryScope:
      getString(fm, "primary_scope") || getString(fm, "primaryScope"),
    context,
    decisionBody: decisionBody || "",
    touches: getStringArray(fm, "touches") || [],
    createdBy: getIdentity(fm, "created_by") || getIdentity(fm, "createdBy"),
    contributors: getIdentityArray(fm, "contributors"),
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
  let title = getString(fm, "title");
  const status = getString(fm, "status");
  const outcomeRaw = fm["outcome"];

  if (!id) throw new ParseError("Missing required frontmatter field: id", "parse");

  // Get body after frontmatter
  const split = splitFrontmatter(content);
  const body = split ? split.body : content;

  // Fallback: if title is missing from frontmatter, extract from first
  // # heading that is NOT a known section heading
  if (!title) {
    const headingRegex = /^#\s+(.+)$/gm;
    let match: RegExpExecArray | null;
    while ((match = headingRegex.exec(body)) !== null) {
      const candidate = match[1].trim().replace(/^["']|["']$/g, "");
      if (!SECTION_HEADINGS.has(candidate.toLowerCase())) {
        title = candidate;
        break;
      }
    }
  }
  // Last-resort fallback: use ID as title
  if (!title) title = id;

  if (!status)
    throw new ParseError("Missing required frontmatter field: status", "parse");
  if (!outcomeRaw)
    throw new ParseError("Missing required frontmatter field: outcome", "parse");

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
    provenance: getString(fm, "provenance"),
    outcome,
    tags: getStringArray(fm, "tags") || [],
    summary,
    bodyText,
    createdBy: getIdentity(fm, "created_by") || getIdentity(fm, "createdBy"),
    contributors: getIdentityArray(fm, "contributors"),
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

  if (!id) throw new ParseError("Missing required frontmatter field: id", "parse");
  if (!state)
    throw new ParseError("Missing required frontmatter field: state", "parse");

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
      fm["origin_updated"] === "true" || fm["originUpdated"] === "true" ||
      fm["origin_updated"] === true || fm["originUpdated"] === true
        ? true
        : undefined,
  };
}

// removed: 'parseAssignmentFile' — assignment feature dropped 2026-07-29
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
    throw new ParseError("Missing required frontmatter field: created_at", "parse");
  if (!updatedAt)
    throw new ParseError("Missing required frontmatter field: updated_at", "parse");

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
