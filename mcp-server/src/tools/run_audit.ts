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
  for (const line of indexContent.split("\n")) {
    const m2 = line.match(/^\|\s*[\d-]+\s*\|\s*(DECISION-[\w-]+)\s*\|\s*\S+\s*\|\s*(\w+)\s*\|/);
    if (m2) indexRows.set(m2[1], m2[2]);
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
    } else if (indexRows.get(id) !== fileStatus) {
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

  for (const filename of fs.readdirSync(decisionsDir)) {
    if (!filename.startsWith("DECISION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    const filePath = path.join(decisionsDir, filename);
    const content = readFile(filePath);
    if (!content) continue;
    const fm = parseFrontmatter(content);
    let working = content;

    const supersededBy = (fm["superseded_by"] || "null").trim();
    const supersedes = (fm["supersedes"] || "null").trim();
    const status = (fm["status"] || "").trim();

    // --- Sub-check A: Dangling supersession pointer (auto-fix) ---
    // Check superseded_by pointing to non-existent file
    if (supersededBy !== "null") {
      const targetPath = path.join(decisionsDir, `${supersededBy}.md`);
      if (!fs.existsSync(targetPath)) {
        if (!ignored.has(`decision-supersession:${id}:dangling`)) {
          working = setFrontmatterField(working, "superseded_by", "null");
          fs.writeFileSync(filePath, working, "utf-8");
          autoFixed.push(`Cat 15: cleared dangling superseded_by on ${id} (target ${supersededBy} missing)`);

          // Also clear the Superseded By cell in the Superseded index table row if present
          const indexContent = readFile(indexPath);
          if (indexContent && indexContent.includes(`## Superseded`)) {
            const lines = indexContent.split("\n");
            let inSuperseded = false;
            let modified = false;
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i].trim();
              if (line.startsWith("## Superseded")) {
                inSuperseded = true;
                continue;
              }
              if (inSuperseded && line.startsWith("##")) break; // next section
              if (inSuperseded && line.startsWith("|")) {
                const cells = lines[i].split("|").map(c => c.trim());
                if (cells[2] === id) {
                  // This is a row in the Superseded table — find last `|` cell and replace content with ` -`
                  const parts = lines[i].split("|");
                  if (parts.length >= 10) {
                    // Last cell (index -2 after stripping empty first/last from split) is Superseded By
                    // parts[0] is empty (before first |), parts[1]=Date, ..., parts[8]=Superseded By, parts[9] might be empty
                    const supersededByCellIdx = parts.length - 2; // second-to-last part is the last cell content
                    if (parts[supersededByCellIdx].trim() === supersededBy) {
                      parts[supersededByCellIdx] = " - ";
                      lines[i] = parts.join("|");
                      modified = true;
                    }
                  }
                  break;
                }
              }
            }
            if (modified) {
              fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");
            }
          }
        }
      }
    }

    // Check supersedes pointing to non-existent file
    if (supersedes !== "null") {
      const targetPath = path.join(decisionsDir, `${supersedes}.md`);
      if (!fs.existsSync(targetPath)) {
        if (!ignored.has(`decision-supersession:${id}:dangling`)) {
          working = setFrontmatterField(working, "supersedes", "null");
          fs.writeFileSync(filePath, working, "utf-8");
          autoFixed.push(`Cat 15: cleared dangling supersedes on ${id} (target ${supersedes} missing)`);
        }
      }
    }

    // --- Sub-check B: Zombie-active (pending fix) ---
    if (supersededBy !== "null") {
      const targetPath = path.join(decisionsDir, `${supersededBy}.md`);
      if (fs.existsSync(targetPath)) {
        // superseded_by target exists, check if THIS file's status is NOT superseded
        if (status !== "superseded") {
          if (!ignored.has(`decision-supersession:${id}:zombie`)) {
            pendingFixes.push({
              type: "fix_decision_supersession_status",
              decisionId: id,
              supersededBy: supersededBy,
            });
          }
        }
      }
    }
  }

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
