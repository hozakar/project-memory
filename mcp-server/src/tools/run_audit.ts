import * as fs from "fs";
import * as path from "path";
import type { AuditReport, PendingFix } from "../types";
import { checkConsistency } from "./check_consistency";
import { indexNote } from "./index_note";
import { deleteNote } from "./delete_note";
import { deleteRecord } from "../db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysDiff(dateStr: string): number {
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function readFile(filePath: string): string {
  try { return fs.readFileSync(filePath, "utf-8"); } catch { return ""; }
}

export function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Normalize CRLF → LF and strip BOM before parsing
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return result;
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) result[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

/**
 * Parse the `supersedes` field from frontmatter, handling both formats:
 * - `supersedes: null` → returns []
 * - `supersedes: DECISION-X` → returns ["DECISION-X"]
 * - `supersedes: [DECISION-X, DECISION-Y]` → returns ["DECISION-X", "DECISION-Y"]
 * - `supersedes:\n  - DECISION-X\n  - DECISION-Y` → returns ["DECISION-X", "DECISION-Y"]
 */
export function parseSupersedesList(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return [];

  const fmBody = match[1];
  // Try single-line format: "supersedes: null" or "supersedes: DECISION-X"
  // IMPORTANT: Use [ \t] not \s to avoid matching across newlines (captures next line as value)
  const singleLine = fmBody.match(/^supersedes:[ \t]*(.+)$/m);
  if (singleLine) {
    const val = singleLine[1].trim().replace(/^['"]|['"]$/g, "");
    if (val === "null" || val === "[]" || val === "") return [];
    // Could be a single ID or a bracket list [A, B]
    if (val.startsWith("[")) {
      // bracket list: [DECISION-X, DECISION-Y]
      return val.replace(/[\[\]]/g, "").split(",").map(s => s.trim().replace(/^['"]|['"]$/g, "")).filter(s => s.length > 0);
    }
    return [val];
  }
  // Try YAML block list format: "supersedes:\n  - DECISION-X\n  - DECISION-Y"
  const blockMatch = fmBody.match(/^supersedes:[ \t]*\n((?:\s+-\s+.+\n?)+)/m);
  if (blockMatch) {
    return blockMatch[1].split("\n")
      .map(line => line.match(/^\s+-\s+(.+)$/)?.[1]?.trim()?.replace(/^['"]|['"]$/g, ""))
      .filter((s): s is string => s !== undefined && s.length > 0);
  }
  return [];
}

/**
 * Parse the `superseded_by` field from frontmatter.
 * Always single-line: `superseded_by: null` or `superseded_by: DECISION-X`
 */
export function parseSupersededBy(content: string): string | null {
  const fm = parseFrontmatter(content);
  const val = (fm["superseded_by"] || "null").trim();
  return val === "null" ? null : val;
}

/**
 * Parse a markdown table header row to build a column-name → index map.
 * Scans content for the first `| Date | ID | ... |` header row followed by
 * a separator row. Returns a Map of lowercase-trimmed column names to their
 * index in the split-by-| array (1-based: index 0 is the empty string before
 * the first |). Returns null if no valid header found.
 *
 * Used by cat6DecisionDrift and applyFixDecisionIndexStatus to resolve
 * column positions by name instead of hard-coded positions, making the
 * parser resilient to schema variations (missing Scope, reordered columns).
 */
export function parseIndexHeader(content: string): Map<string, number> | null {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*Date\s*\|\s*ID\s*\|/.test(lines[i])) {
      if (i + 1 < lines.length && /^\|[-\s|]+\|$/.test(lines[i + 1])) {
        const cells = lines[i].split("|").map(c => c.trim());
        const headerMap = new Map<string, number>();
        for (let j = 0; j < cells.length; j++) {
          if (cells[j]) {
            headerMap.set(cells[j].toLowerCase(), j);
          }
        }
        return headerMap;
      }
    }
  }
  return null;
}

/**
 * Extract the canonical status token from an index Status cell.
 * Annotated cells like "active — implemented (branch X; 337/337 tests)"
 * start with a canonical word (active|superseded) followed by a word
 * boundary. If the cell starts with one of these, return it; otherwise
 * return the trimmed cell (preserving custom single-token statuses like
 * on-hold, in-progress). Never returns "unknown".
 */
export function canonicalStatusFromCell(cell: string): string {
  const trimmed = cell.trim();
  const m = trimmed.match(/^(active|superseded)\b/);
  return m ? m[1] : trimmed;
}

/**
 * Extract the date portion from a DECISION-YYYY-MM-DD-* ID.
 * Returns "9999-99-99" as a sentinel (sorts last) for malformed IDs.
 */
export function extractDateFromDecisionId(id: string): string {
  const m = id.match(/^DECISION-(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "9999-99-99";
}

/**
 * Detect cycles in a supersedes graph.
 * The graph is a Map from node ID → array of supersedes targets.
 * Returns an array of cycles, each cycle represented as [n0, n1, ..., nk, n0]
 * where each adjacent pair is a supersedes edge.
 */
export function findSupersessionCycles(graph: Map<string, string[]>): string[][] {
  const UNVISITED = 0;
  const IN_STACK = 1;
  const DONE = 2;
  const color = new Map<string, number>();
  const cycles: string[][] = [];
  const path: string[] = [];

  for (const node of graph.keys()) color.set(node, UNVISITED);

  function dfs(node: string): void {
    color.set(node, IN_STACK);
    path.push(node);

    for (const neighbor of graph.get(node) || []) {
      if (!graph.has(neighbor)) continue; // skip dangling pointers
      if (color.get(neighbor) === IN_STACK) {
        // Back edge: found a cycle
        const startIdx = path.indexOf(neighbor);
        const cycle = path.slice(startIdx);
        cycle.push(neighbor);
        cycles.push(cycle);
      } else if (color.get(neighbor) === UNVISITED) {
        dfs(neighbor);
      }
    }

    path.pop();
    color.set(node, DONE);
  }

  for (const node of graph.keys()) {
    if (color.get(node) === UNVISITED) dfs(node);
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Frontmatter field setter helper
// ---------------------------------------------------------------------------

export function setFrontmatterField(content: string, field: string, value: string): string {
  // Handle CRLF line endings — normalise to LF, work, then restore CRLF if original had it
  const crlf = content.includes("\r\n");
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const hasBom = normalized.startsWith("\uFEFF");
  const body = hasBom ? normalized.slice(1) : normalized;

  const fmRe = /^(---\n)([\s\S]*?)(\n---)(\n?)/;
  const fmMatch = body.match(fmRe);
  if (!fmMatch) return content; // no frontmatter, return unchanged

  const [, open, fmBody, close, trailingNewline] = fmMatch;
  // Preserve everything after the frontmatter block (the body/tail)
  const tail = body.slice((fmMatch.index ?? 0) + fmMatch[0].length);
  const fieldRe = new RegExp(`^${field}:\\s*\\S+`, "m");

  let updatedFm: string;
  if (fieldRe.test(fmBody)) {
    // Field exists — replace it
    updatedFm = fmBody.replace(fieldRe, `${field}: ${value}`);
  } else {
    // Field does not exist — insert before closing \n---
    updatedFm = fmBody + `\n${field}: ${value}`;
  }

  let result = open + updatedFm + close + (trailingNewline || "") + tail;
  if (hasBom) result = "\uFEFF" + result;
  if (crlf) result = result.replace(/\n/g, "\r\n");
  return result;
}

// Glob-style wildcard matching: * matches any chars except : (within a single segment).
// Spec: audit.md → Permanent Skip → Pattern match rules.
export function matchesIgnorePattern(pattern: string, key: string): boolean {
  const regexStr = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^:]*");
  return new RegExp(`^${regexStr}$`).test(key);
}

export class AuditIgnoreSet {
  private exact = new Set<string>();
  private patterns: string[] = [];

  add(key: string): void {
    if (key.includes("*")) {
      this.patterns.push(key);
    } else {
      this.exact.add(key);
    }
  }

  has(key: string): boolean {
    if (this.exact.has(key)) return true;
    return this.patterns.some(p => matchesIgnorePattern(p, key));
  }
}

function readAuditIgnore(projectMemoryDir: string): AuditIgnoreSet {
  const configPath = path.join(projectMemoryDir, "config.yml");
  const content = readFile(configPath);
  const ignored = new AuditIgnoreSet();
  const keyRegex = /^\s+key:\s+"?([^"\n]+)"?/gm;
  let m: RegExpExecArray | null;
  while ((m = keyRegex.exec(content)) !== null) {
    ignored.add(m[1].trim());
  }
  return ignored;
}



// ---------------------------------------------------------------------------
// Audit categories
// ---------------------------------------------------------------------------

function cat5MisplacedIssues(projectMemoryDir: string): string[] {
  const openDir = path.join(projectMemoryDir, "issues", "open");
  const closedDir = path.join(projectMemoryDir, "issues", "closed");
  const autoFixed: string[] = [];
  if (!fs.existsSync(openDir)) return autoFixed;

  for (const filename of fs.readdirSync(openDir)) {
    if (!filename.endsWith(".md")) continue;
    const fm = parseFrontmatter(readFile(path.join(openDir, filename)));
    if (fm["status"] === "closed") {
      if (!fs.existsSync(closedDir)) fs.mkdirSync(closedDir, { recursive: true });
      fs.renameSync(path.join(openDir, filename), path.join(closedDir, filename));
      autoFixed.push(`Moved ${filename} → issues/closed/`);
    }
  }
  return autoFixed;
}

function cat6DecisionDrift(projectMemoryDir: string, ignored: AuditIgnoreSet): { autoFixed: string[]; pendingFixes: PendingFix[] } {
  const decisionsDir = path.join(projectMemoryDir, "decisions");
  if (!fs.existsSync(decisionsDir)) return { autoFixed: [], pendingFixes: [] };

  const indexPath = path.join(decisionsDir, "index.md");
  const indexContent = readFile(indexPath);
  const indexRows = new Map<string, string>(); // id -> status
  const headerMap = parseIndexHeader(indexContent);
  const idColIdx = headerMap?.get("id");
  const statusColIdx = headerMap?.get("status");
  if (headerMap && idColIdx !== undefined && statusColIdx !== undefined) {
    for (const line of indexContent.split("\n")) {
      if (!line.startsWith("|")) continue;
      if (/^\|[-\s|]+\|$/.test(line)) continue; // separator
      if (/^\|\s*Date\s*\|/.test(line)) continue; // header row
      const cells = line.split("|");
      if (cells.length <= Math.max(idColIdx, statusColIdx)) continue;
      const id = cells[idColIdx]?.trim();
      const status = cells[statusColIdx]?.trim();
      if (id && id.startsWith("DECISION-") && status) {
        indexRows.set(id, status);
      }
    }
  }

  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];
  const fileIds = new Set<string>();

  for (const filename of fs.readdirSync(decisionsDir)) {
    if (!filename.startsWith("DECISION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    fileIds.add(id);
    const fm = parseFrontmatter(readFile(path.join(decisionsDir, filename)));
    const fileStatus = fm["status"] || "unknown";
    // Skip files with unparseable status — never emit "unknown" into the index.
    if (fileStatus === "unknown") continue;
    const touchesRaw = fm["touches"] || "";
    const touches = touchesRaw ? touchesRaw.split(/[,;\s]+/).filter(Boolean) : [];

    if (!indexRows.has(id)) {
      if (!ignored.has(`decision-drift:${id}:missing-row`)) {
        pendingFixes.push({
          type: "add_decision_index_row",
          decisionId: id,
          status: fileStatus,
          touches,
          date: today(),
        });
      }
    } else if (canonicalStatusFromCell(indexRows.get(id) ?? "") !== fileStatus) {
      if (!ignored.has(`decision-drift:${id}:status-mismatch`)) {
        pendingFixes.push({
          type: "fix_decision_index_status",
          decisionId: id,
          correctStatus: fileStatus,
        });
      }
    }
  }

  // Orphan rows: in index but file missing → auto-remove
  for (const [id] of indexRows) {
    if (!fileIds.has(id) && !ignored.has(`decision-drift:${id}:orphan-row`)) {
      // Auto-remove the row from index.md
      const lines = indexContent.split("\n");
      const filtered = lines.filter(l => !l.includes(`| ${id} |`));
      if (filtered.length !== lines.length) {
        fs.writeFileSync(indexPath, filtered.join("\n"), "utf-8");
        autoFixed.push(`Removed orphan decision index row for ${id} (file does not exist).`);
      }
    }
  }

  return { autoFixed, pendingFixes };
}

function cat8AdrDrift(projectMemoryDir: string, ignored: AuditIgnoreSet): { autoFixed: string[]; pendingFixes: PendingFix[] } {
  const configContent = readFile(path.join(projectMemoryDir, "config.yml"));
  if (!configContent) return { autoFixed: [], pendingFixes: [] };
  // adr_enabled: false → skip Cat 8. Absent = true (backward compat).
  const adrEnabledMatch = configContent.match(/adr_enabled:\s*(\S+)/);
  if (adrEnabledMatch && adrEnabledMatch[1].replace(/^['"]|['"]$/g, "") === "false") {
    return { autoFixed: [], pendingFixes: [] };
  }
  const adrDirMatch = configContent.match(/adr_dir:\s*(\S+)/);
  if (!adrDirMatch) return { autoFixed: [], pendingFixes: [] };

  const projectRoot = path.dirname(projectMemoryDir);
  const adrDir = path.join(projectRoot, adrDirMatch[1]);
  const decisionsDir = path.join(projectMemoryDir, "decisions");
  if (!fs.existsSync(decisionsDir)) return { autoFixed: [], pendingFixes: [] };

  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];

  // Count existing ADR files to determine next ADR number
  let maxAdrNum = 0;
  if (fs.existsSync(adrDir)) {
    for (const f of fs.readdirSync(adrDir)) {
      const m3 = f.match(/^(\d+)-/);
      if (m3) maxAdrNum = Math.max(maxAdrNum, parseInt(m3[1], 10));
    }
  }

  for (const filename of fs.readdirSync(decisionsDir)) {
    if (!filename.startsWith("DECISION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    const fullContent = readFile(path.join(decisionsDir, filename));
    const fm = parseFrontmatter(fullContent);

    const adrId = fm["adr_id"];
    if (!adrId || adrId === "null") {
      if (!ignored.has(`adr-drift:${id}:missing-adr_id`)) {
        const nextNum = maxAdrNum + 1;
        maxAdrNum = nextNum;
        pendingFixes.push({
          type: "assign_adr_id",
          decisionId: id,
          adrId: String(nextNum),
        });
      }
      continue;
    }

    const paddedId = adrId.padStart(4, "0");
    if (!fs.existsSync(adrDir)) {
      if (!ignored.has(`adr-drift:${id}:missing-file`)) {
        pendingFixes.push({
          type: "create_adr_file",
          decisionId: id,
          adrId: paddedId,
          decisionContent: fullContent,
        });
      }
      continue;
    }

    const adrFiles = fs.readdirSync(adrDir).filter(f => f.startsWith(paddedId + "-") && f.endsWith(".md"));
    if (adrFiles.length === 0) {
      if (!ignored.has(`adr-drift:${id}:missing-file`)) {
        pendingFixes.push({
          type: "create_adr_file",
          decisionId: id,
          adrId: paddedId,
          decisionContent: fullContent,
        });
      }
    }
  }
  return { autoFixed, pendingFixes };
}

function cat9DiscussionDrift(projectMemoryDir: string, ignored: AuditIgnoreSet): { autoFixed: string[]; pendingFixes: PendingFix[] } {
  const discussionsDir = path.join(projectMemoryDir, "discussions");
  if (!fs.existsSync(discussionsDir)) return { autoFixed: [], pendingFixes: [] };

  const indexPath = path.join(discussionsDir, "index.md");
  const indexContent = readFile(indexPath);
  const indexRows = new Map<string, string>(); // id -> status
  for (const line of indexContent.split("\n")) {
    const m = line.match(/^\|\s*[\d-]+\s*\|\s*(DISCUSSION-[\w-]+)\s*\|\s*(\w+)\s*\|/);
    if (m) indexRows.set(m[1], m[2]);
  }

  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];
  const fileIds = new Set<string>();

  for (const filename of fs.readdirSync(discussionsDir)) {
    if (!filename.startsWith("DISCUSSION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    fileIds.add(id);
    const fm = parseFrontmatter(readFile(path.join(discussionsDir, filename)));
    const fileStatus = fm["status"] || "unknown";

    if (!indexRows.has(id)) {
      if (!ignored.has(`discussion-drift:${id}:missing-row`)) {
        pendingFixes.push({
          type: "add_discussion_index_row",
          discussionId: id,
          status: fileStatus,
          date: today(),
        });
      }
    } else if (indexRows.get(id) !== fileStatus) {
      if (!ignored.has(`discussion-drift:${id}:status-mismatch`)) {
        pendingFixes.push({
          type: "fix_discussion_index_status",
          discussionId: id,
          correctStatus: fileStatus,
        });
      }
    }
  }

  // Orphan rows: in index but file missing → auto-remove
  for (const [id] of indexRows) {
    if (!fileIds.has(id) && !ignored.has(`discussion-drift:${id}:orphan-row`)) {
      const lines = indexContent.split("\n");
      const filtered = lines.filter(l => !l.includes(`| ${id} |`));
      if (filtered.length !== lines.length) {
        fs.writeFileSync(indexPath, filtered.join("\n"), "utf-8");
        autoFixed.push(`Removed orphan discussion index row for ${id} (file does not exist).`);
      }
    }
  }

  return { autoFixed, pendingFixes };
}

function cat11DiscussionExpiry(projectMemoryDir: string): string[] {
  const discussionsDir = path.join(projectMemoryDir, "discussions");
  if (!fs.existsSync(discussionsDir)) return [];
  const archiveDir = path.join(discussionsDir, "archive");
  const autoFixed: string[] = [];

  for (const filename of fs.readdirSync(discussionsDir)) {
    if (!filename.startsWith("DISCUSSION-") || !filename.endsWith(".md")) continue;
    const content = readFile(path.join(discussionsDir, filename));
    // Match nested format (outcome:\n  type: xxx) or flat format (outcome: xxx)
    let outcomeType = "";
    const nestedMatch = content.match(/outcome:\s*\n\s+type:\s*(\S+)/);
    if (nestedMatch) {
      outcomeType = nestedMatch[1].replace(/^['"]|['"]$/g, "");
    } else {
      const flatMatch = content.match(/^outcome:\s*(\S+)/m);
      if (flatMatch && flatMatch[1] !== "null") {
        // Flat format: could be a phase/decision ID or "none". Treat as type=none only if literal "none", otherwise treat as a valid outcome (not expired).
        const val = flatMatch[1].replace(/^['"]|['"]$/g, "");
        outcomeType = (val === "none" || val === "") ? "none" : "non-null";
      }
    }
    if (outcomeType !== "none") continue;
    const dateStr = filename.match(/DISCUSSION-(\d{4}-\d{2}-\d{2})/)?.[1] ?? today();
    if (daysDiff(dateStr) <= 30) continue;

    if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true });
    fs.renameSync(path.join(discussionsDir, filename), path.join(archiveDir, filename));

    const indexPath = path.join(discussionsDir, "index.md");
    const id = filename.slice(0, -3);
    const lines = readFile(indexPath).split("\n").filter(l => !l.includes(`| ${id} |`));
    fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");
    autoFixed.push(`Archived ${filename} → discussions/archive/ (outcome: none, age > 30d)`);
  }
  return autoFixed;
}

function cat15DecisionSupersession(
  projectMemoryDir: string,
  ignored: AuditIgnoreSet,
): { autoFixed: string[]; pendingFixes: PendingFix[] } {
  const decisionsDir = path.join(projectMemoryDir, "decisions");
  if (!fs.existsSync(decisionsDir)) return { autoFixed: [], pendingFixes: [] };

  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];
  const indexPath = path.join(decisionsDir, "index.md");

  // -----------------------------------------------------------------------
  // Phase 1: Collect all decision entries
  // -----------------------------------------------------------------------
  interface Entry {
    id: string;
    filePath: string;
    original: string;
    working: string;
    supersedesList: string[];
    supersededBy: string | null;
    status: string;
  }
  const entries = new Map<string, Entry>();

  for (const filename of fs.readdirSync(decisionsDir)) {
    if (!filename.startsWith("DECISION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    const filePath = path.join(decisionsDir, filename);
    const content = readFile(filePath);
    if (!content) continue;
    entries.set(id, {
      id,
      filePath,
      original: content,
      working: content,
      supersedesList: parseSupersedesList(content),
      supersededBy: parseSupersededBy(content),
      status: parseFrontmatter(content)["status"]?.trim() ?? "",
    });
  }

  // Helper: write all modified entry files to disk
  function flushEntries(): void {
    for (const [, entry] of entries) {
      if (entry.working !== entry.original) {
        fs.writeFileSync(entry.filePath, entry.working, "utf-8");
        entry.original = entry.working; // keep in sync for subsequent flushes
      }
    }
  }

  // -----------------------------------------------------------------------
  // Sub-check A: Dangling supersession pointer (auto-fix)
  // -----------------------------------------------------------------------
  const danglingSupersededByIds = new Set<string>();

  for (const [id, entry] of entries) {
    // Check superseded_by pointing to non-existent file
    if (entry.supersededBy !== null) {
      const targetPath = path.join(decisionsDir, `${entry.supersededBy}.md`);
      if (!fs.existsSync(targetPath)) {
        if (!ignored.has(`decision-supersession:${id}:dangling`)) {
          autoFixed.push(`Cat 15: cleared dangling superseded_by on ${id} (target ${entry.supersededBy} missing)`);
          entry.working = setFrontmatterField(entry.working, "superseded_by", "null");
          danglingSupersededByIds.add(id);
          entry.supersededBy = null;
        }
      }
    }

    // Check each supersedes target for dangling
    const remaining: string[] = [];
    for (const target of entry.supersedesList) {
      const targetPath = path.join(decisionsDir, `${target}.md`);
      if (!fs.existsSync(targetPath)) {
        if (!ignored.has(`decision-supersession:${id}:dangling`)) {
          autoFixed.push(`Cat 15: cleared dangling supersedes on ${id} (target ${target} missing)`);
          // skip — do not add to remaining
        } else {
          remaining.push(target);
        }
      } else {
        remaining.push(target);
      }
    }
    if (remaining.length !== entry.supersedesList.length) {
      if (remaining.length === 0) {
        entry.working = setFrontmatterField(entry.working, "supersedes", "null");
      } else {
        entry.working = setFrontmatterField(entry.working, "supersedes", `[${remaining.join(", ")}]`);
      }
      entry.supersedesList = remaining;
    }
  }

  flushEntries();

  // Clear Superseded By cells in index.md for dangling-superseded_by decisions
  if (danglingSupersededByIds.size > 0) {
    const indexContent = readFile(indexPath);
    if (indexContent && indexContent.includes("## Superseded")) {
      const lines = indexContent.split("\n");
      let inSuperseded = false;
      let modified = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("## Superseded")) { inSuperseded = true; continue; }
        if (inSuperseded && line.startsWith("##")) break;
        if (inSuperseded && line.startsWith("|")) {
          const id = lines[i].split("|")[2]?.trim() ?? "";
          if (danglingSupersededByIds.has(id)) {
            const parts = lines[i].split("|");
            if (parts.length >= 10) {
              const supersededByCellIdx = parts.length - 2;
              parts[supersededByCellIdx] = " - ";
              lines[i] = parts.join("|");
              modified = true;
            }
          }
        }
      }
      if (modified) fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");
    }
  }

  // -----------------------------------------------------------------------
  // Sub-check B: Zombie-active — superseded_by set but status still active
  // (pending fix)
  // -----------------------------------------------------------------------
  for (const [id, entry] of entries) {
    if (entry.supersededBy !== null) {
      const targetPath = path.join(decisionsDir, `${entry.supersededBy}.md`);
      if (fs.existsSync(targetPath) && entry.status !== "superseded") {
        if (!ignored.has(`decision-supersession:${id}:zombie`)) {
          pendingFixes.push({
            type: "fix_decision_supersession_status",
            decisionId: id,
            supersededBy: entry.supersededBy,
          });
        }
      }
    }
  }

  // -----------------------------------------------------------------------
  // Sub-check C: Asymmetric supersession — A supersedes B but B's
  // superseded_by is not A (auto-fix)
  // -----------------------------------------------------------------------
  for (const [, entryA] of entries) {
    for (const targetB of entryA.supersedesList) {
      const entryB = entries.get(targetB);
      if (!entryB) continue;
      if (entryB.supersededBy !== entryA.id) {
        if (!ignored.has(`decision-supersession:${targetB}:asymmetric`)) {
          entryB.working = setFrontmatterField(entryB.working, "superseded_by", entryA.id);
          entryB.supersededBy = entryA.id;
          autoFixed.push(`Cat 15: fixed asymmetric supersession — set ${targetB}.superseded_by = ${entryA.id}`);
        }
      }
    }
  }

  flushEntries();

  // -----------------------------------------------------------------------
  // Sub-check D: Circular supersession — detect cycles in the supersedes
  // graph and break them (auto-fix)
  // -----------------------------------------------------------------------
  const graph = new Map<string, string[]>();
  for (const [id, entry] of entries) {
    graph.set(id, [...entry.supersedesList]);
  }
  const cycles = findSupersessionCycles(graph);
  // Track already-removed edges to avoid duplicate log entries
  const removedEdges = new Set<string>();

  for (const cycle of cycles) {
    // Find the edge with the earliest-date source that points to a later-date node
    let bestSrc = "";
    let bestTgt = "";
    let bestDate = "9999-99-99";
    let found = false;

    for (let i = 0; i < cycle.length - 1; i++) {
      const src = cycle[i];
      const tgt = cycle[i + 1];
      const edgeKey = `${src}\x00${tgt}`;
      if (removedEdges.has(edgeKey)) continue;
      const srcDate = extractDateFromDecisionId(src);
      const tgtDate = extractDateFromDecisionId(tgt);
      if (srcDate < bestDate && tgtDate > srcDate) {
        bestSrc = src;
        bestTgt = tgt;
        bestDate = srcDate;
        found = true;
      }
    }

    if (!found) continue;

    const entry = entries.get(bestSrc);
    if (!entry) continue;

    const remaining = entry.supersedesList.filter(t => t !== bestTgt);
    if (remaining.length === 0) {
      entry.working = setFrontmatterField(entry.working, "supersedes", "null");
    } else {
      entry.working = setFrontmatterField(entry.working, "supersedes", `[${remaining.join(", ")}]`);
    }
    entry.supersedesList = remaining;
    removedEdges.add(`${bestSrc}\x00${bestTgt}`);
    autoFixed.push(`Cat 15: broke circular supersession — removed ${bestTgt} from ${bestSrc}.supersedes`);
  }

  flushEntries();

  // -----------------------------------------------------------------------
  // Sub-check E: Superseded-but-authority — status is superseded but no
  // superseded_by pointer (auto-fix)
  // -----------------------------------------------------------------------
  for (const [id, entry] of entries) {
    if (entry.status === "superseded" && entry.supersededBy === null) {
      if (!ignored.has(`decision-supersession:${id}:orphan-superseded`)) {
        entry.working = setFrontmatterField(entry.working, "status", "active");
        entry.status = "active";
        autoFixed.push(`Cat 15: restored ${id} status to active (superseded but no superseded_by pointer)`);
      }
    }
  }

  flushEntries();

  return { autoFixed, pendingFixes };
}

function cat14AssignmentIntegrity(
  projectMemoryDir: string,
  ignored: AuditIgnoreSet,
): string[] {
  const autoFixed: string[] = [];

  const assignmentsDir = path.join(projectMemoryDir, "assignments");
  if (!fs.existsSync(assignmentsDir)) {
    return autoFixed;
  }

  const now = new Date();

  for (const f of fs.readdirSync(assignmentsDir)) {
    const m = f.match(/^(ASSIGNMENT-.+)\.md$/);
    if (!m) continue;

    const assignmentId = m[1];
    const filePath = path.join(assignmentsDir, f);
    let content = readFile(filePath);
    const parsed = parseFrontmatter(content);
    if (!parsed || Object.keys(parsed).length === 0) continue;

    const status = parsed["status"] || "";
    const type = parsed["type"] || "";
    const targetId = parsed["target_id"] || "";
    const assignedAt = parsed["assigned_at"] || "";
    const reminded = parsed["reminded"] || "";
    const completedNote = parsed["completion_note"] || "";
    const completedDecisionId = parsed["completed_decision_id"] || "";
    const completedDiscussionId = parsed["completed_discussion_id"] || "";

    // 14a: Direct assignment target orphan — auto-fix for ALL ages
    if (type === "direct" && targetId && status !== "completed") {
      if (!ignored.has(`assignment-orphan:${assignmentId}`)) {
        let targetExists = false;
        const targetPaths = [
          path.join(projectMemoryDir, "issues", "open", `${targetId}.md`),
          path.join(projectMemoryDir, "issues", "closed", `${targetId}.md`),
          path.join(projectMemoryDir, "phases", targetId.replace(/^phase-/, ""), "phase.yml"),
          path.join(projectMemoryDir, "decisions", `${targetId}.md`),
          path.join(projectMemoryDir, "discussions", `${targetId}.md`),
        ];
        for (const tp of targetPaths) {
          if (fs.existsSync(tp)) { targetExists = true; break; }
        }
        if (!targetExists && !parsed["target_orphaned_at"]) {
          content = setFrontmatterField(content, "target_orphaned_at", today());
          fs.writeFileSync(filePath, content, "utf-8");
          autoFixed.push(`Assignment ${assignmentId}: target ${targetId} orphaned, annotated`);
        }
      }
    }

    // 14b: Stale pending assignment (>30 days) — one-shot reminded flag
    // Uses updated `content` (14a may have written to the same file above)
    if (status === "pending" && assignedAt) {
      const ageDays = (now.getTime() - new Date(assignedAt).getTime()) / 86400000;
      if (ageDays > 30) {
        if (!ignored.has(`assignment-stale:${assignmentId}`) && reminded !== "true") {
          content = setFrontmatterField(content, "reminded", "true");
          fs.writeFileSync(filePath, content, "utf-8");
          autoFixed.push(`Assignment ${assignmentId}: stale pending (${Math.round(ageDays)}d), marked reminded`);
        }
      }
    }

    // 14c: Completed without evidence — auto-annotate
    if (status === "completed" && !completedNote && !completedDecisionId && !completedDiscussionId) {
      if (!ignored.has(`assignment-no-evidence:${assignmentId}`) && !parsed["completed_without_evidence_at"]) {
        content = setFrontmatterField(content, "completed_without_evidence_at", today());
        fs.writeFileSync(filePath, content, "utf-8");
        autoFixed.push(`Assignment ${assignmentId}: completed without evidence, annotated`);
      }
    }
  }

  return autoFixed;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export type Profile = "standard" | "minimal" | "full" | "lite";

export async function runAudit(
  projectMemoryDir: string,
  profile: Profile = "standard",
): Promise<AuditReport> {
  // Normalize full/lite to standard (backward compatibility)
  const effectiveProfile = (profile === "full" || profile === "lite") ? "standard" : profile;

  // Minimal profile has no audit by design — return empty report immediately.
  if (effectiveProfile === "minimal") {
    return { auto_fixed: [], pending_fixes: [] };
  }

  const ignored = readAuditIgnore(projectMemoryDir);

  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];


  // Auto-fix categories (silent)
  autoFixed.push(...cat5MisplacedIssues(projectMemoryDir));
  autoFixed.push(...cat11DiscussionExpiry(projectMemoryDir));

  // Cat 6: auto-fix + pending fixes
  const cat6Result = cat6DecisionDrift(projectMemoryDir, ignored);
  autoFixed.push(...cat6Result.autoFixed);
  pendingFixes.push(...cat6Result.pendingFixes);

  // Cat 8: auto-fix + pending fixes
  const cat8Result = cat8AdrDrift(projectMemoryDir, ignored);
  autoFixed.push(...cat8Result.autoFixed);
  pendingFixes.push(...cat8Result.pendingFixes);
  // Cat 9 (discussion index drift) — auto-fix + pending fixes
  const cat9Result = cat9DiscussionDrift(projectMemoryDir, ignored);
  autoFixed.push(...cat9Result.autoFixed);
  pendingFixes.push(...cat9Result.pendingFixes);
  // Cat 13: FS is source of truth.
  // Missing (FS has file, DB doesn't) → re-index from FS.
  // Orphaned (DB has record, FS doesn't) → delete from DB. Never modify FS.
  const consistency = await checkConsistency(projectMemoryDir);
  for (const id of consistency.missing) {
    if (id.startsWith("NOTE-")) {
      const notePath = path.join(projectMemoryDir, "notes", `${id}.md`);
      if (fs.existsSync(notePath)) {
        const content = readFile(notePath);
        const parts = content.split("---\n");
        const body = parts.length >= 3 ? parts.slice(2).join("---\n").trim() : "";
        const fmLines = parts.length >= 2 ? parts[1].split("\n") : [];
        const fm: Record<string, string> = {};
        for (const line of fmLines) {
          const kv = line.match(/^\s*(\w+):\s*(.+)$/);
          if (kv) { fm[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, ""); }
        }
        await indexNote({
          id,
          title: fm.title || id,
          tags: fm.tags ? fm.tags.replace(/[\[\]]/g, "").split(",").map(t => t.trim()).filter(Boolean) : [],
          createdBy: { name: fm.name || "unknown", email: fm.email || "unknown" },
          body: body.slice(0, 3000),
          createdAt: fm.created_at || today(),
          updatedAt: fm.updated_at || today(),
        });
        autoFixed.push(`Cat 13: indexed missing note ${id}`);
      }
    }
    // Other missing types (phase, decision, discussion, era, instruction, assignment)
    // are handled by proactive sync at session start.
  }
  for (const id of consistency.orphaned) {
    // FS is source of truth — if file is gone, DB record must go.
    // Covers branch-delete scenarios: records indexed during feature branch
    // become orphaned when branch is deleted and main is restored.
    if (id.startsWith("NOTE-")) {
      await deleteNote(id);
    } else {
      await deleteRecord(id);
    }
    autoFixed.push(`Cat 13: deleted orphaned ${id} from DB`);
  }

  // Cat 14: Assignment integrity — auto-fix only (no escalations)
  autoFixed.push(...cat14AssignmentIntegrity(projectMemoryDir, ignored));

  // Cat 15: Decision supersession integrity — dangling pointers (auto-fix) + zombie-active (pending fix)
  const cat15Result = cat15DecisionSupersession(projectMemoryDir, ignored);
  autoFixed.push(...cat15Result.autoFixed);
  pendingFixes.push(...cat15Result.pendingFixes);

  const report: AuditReport = { auto_fixed: autoFixed, pending_fixes: pendingFixes };
  return report;
}
