import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
// execSync used by git() helper; spawnSync used by cat7 for stdin piping
import type { AuditReport, AuditFinding, PendingFix } from "../types";
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

function git(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
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

interface PhaseEntry {
  phaseId: string;
  commits: Set<string>;
  mergeCommit: string | null;
  status: string;
  block: string;
  startedAt: string | null;
}

function parsePhasesFromIndex(indexContent: string): PhaseEntry[] {
  const entries: PhaseEntry[] = [];
  const phaseBlockRe = /^\s{2}-\s+id:\s+(.+)$/gm;
  let m: RegExpExecArray | null;

  while ((m = phaseBlockRe.exec(indexContent)) !== null) {
    const phaseId = m[1].trim().replace(/^['"]|['"]$/g, "");
    const blockStart = m.index;
    const nextRe = /^\s{2}-\s+id:/gm;
    nextRe.lastIndex = blockStart + 1;
    const next = nextRe.exec(indexContent);
    const block = next ? indexContent.slice(blockStart, next.index) : indexContent.slice(blockStart);

    const commits = new Set<string>();
    const commitsSection = block.match(/commits:([\s\S]*?)(?=\n\s{4}\w|\n\s{2}\w|$)/);
    if (commitsSection) {
      const hashRe = /^\s+-\s+([0-9a-f]{7,40})/gm;
      let hm: RegExpExecArray | null;
      while ((hm = hashRe.exec(commitsSection[1])) !== null) commits.add(hm[1]);
    }

    const mergeMatch = block.match(/merge_commit:\s+([0-9a-f]{7,40})/);
    const mergeCommit = mergeMatch ? mergeMatch[1] : null;
    if (mergeCommit) commits.add(mergeCommit);

    const statusMatch = block.match(/status:\s+(\S+)/);
    const status = statusMatch ? statusMatch[1].replace(/^['"]|['"]$/g, "") : "";

    const startedAtMatch = block.match(/started_at:\s+(\d{4}-\d{2}-\d{2})/);
    const startedAt = startedAtMatch ? startedAtMatch[1] : null;

    entries.push({ phaseId, commits, mergeCommit, status, block, startedAt });
  }
  return entries;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

const TRIVIAL_RE = /^(docs|chore\(lint|chore\(format|chore\(deps|chore\(memory|chore\(audit|fix\(lint|phase:)/;

// ---------------------------------------------------------------------------
// Audit categories
// ---------------------------------------------------------------------------

function cat1CommitOrphans(
  projectRoot: string,
  ignored: AuditIgnoreSet
): { autoFixed: string[]; pendingFixes: PendingFix[]; escalations: AuditFinding[] } {
  // Re-targeted: Cat 1 now checks for significant commits with no memory trace.
  // A significant commit is one that does NOT touch any of:
  //   - .project-memory/summaries/current-state.md
  //   - A DECISION-*.md, DISCUSSION-*.md, or NOTE-*.md file
  // If none of these memory-related files were changed, it's flagged.
  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];
  const escalations: AuditFinding[] = [];

  const logOutput = git("git log --format=%h%x20%ae%x20%aI%x20%s -30", projectRoot);
  if (!logOutput) return { autoFixed, pendingFixes, escalations };

  for (const line of logOutput.split("\n")) {
    const lm = line.match(/^([0-9a-f]{7,40})\s+(\S+)\s+(\S+)\s+(.+)$/);
    if (!lm) continue;
    const [, hash, , , subject] = lm;
    if (TRIVIAL_RE.test(subject)) continue;
    if (ignored.has(`commit:${hash}`)) continue;

    // Check what files this commit touched
    const filesOutput = git(`git diff-tree --no-commit-id --name-only -r ${hash}`, projectRoot);
    const files = filesOutput ? filesOutput.split("\n").filter(Boolean) : [];

    const touchedMemory = files.some(f =>
      f.includes("summaries/current-state.md") ||
      f.match(/DECISION-.+\.md/) ||
      f.match(/DISCUSSION-.+\.md/) ||
      f.match(/NOTE-.+\.md/)
    );

    if (!touchedMemory) {
      escalations.push({
        category: 1, severity: "medium", interactive: false,
        description: `Significant commit ${hash} has no memory trace. No update to summaries/current-state.md and no new/updated DECISION/DISCUSSION/NOTE in its changed files. Subject: ${subject}`,
        data: { hash, subject, files },
      });
    }
  }

  return { autoFixed, pendingFixes, escalations };
}

function cat2SummaryStaleness(
  projectRoot: string,
  projectMemoryDir: string,
  ignored: AuditIgnoreSet
): string[] {
  const latestDate = git("git log -1 --format=%cs", projectRoot);
  if (!latestDate) return [];
  const summariesDir = path.join(projectMemoryDir, "summaries");
  if (!fs.existsSync(summariesDir)) return [];

  const autoFixed: string[] = [];
  for (const filename of fs.readdirSync(summariesDir)) {
    if (!filename.endsWith(".md")) continue;
    if (ignored.has(`summary:${filename}`)) continue;
    const content = readFile(path.join(summariesDir, filename));
    const luMatch = content.match(/Last Updated:\s*(\d{4}-\d{2}-\d{2})/);
    if (!luMatch) {
      autoFixed.push(`Summary ${filename} has no 'Last Updated:' field. Add one with today's date.`);
      continue;
    }
    if (luMatch[1] < latestDate) {
      autoFixed.push(`Summary ${filename} is stale (Last Updated ${luMatch[1]}, project commit ${latestDate}). Bump date to today.`);
    }
  }
  return autoFixed;
}

function cat3StubPlaceholders(projectMemoryDir: string, ignored: AuditIgnoreSet): AuditFinding[] {
  const summariesDir = path.join(projectMemoryDir, "summaries");
  if (!fs.existsSync(summariesDir)) return [];

  const stubPatterns = ["None recorded yet", "TBD", "system just initialized", "first run detected"];
  const findings: AuditFinding[] = [];

  for (const filename of fs.readdirSync(summariesDir)) {
    if (!filename.endsWith(".md")) continue;
    const content = readFile(path.join(summariesDir, filename));
    for (const pattern of stubPatterns) {
      if (!content.includes(pattern)) continue;
      const idx = content.indexOf(pattern);
      const before = content.slice(0, idx);
      const headingMatch = before.match(/^#+\s+(.+)$/mg);
      const section = headingMatch ? headingMatch[headingMatch.length - 1].replace(/^#+\s+/, "") : "unknown";
      if (ignored.has(`stub:${filename}:${section}`)) continue;
      findings.push({
        category: 3, severity: "low", interactive: false,
        description: `Stub placeholder in ${filename} → section "${section}"`,
        data: { filename, section, pattern },
      });
    }
  }
  return findings;
}

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
      const filtered = lines.filter(l => !l.includes(id));
      if (filtered.length !== lines.length) {
        fs.writeFileSync(indexPath, filtered.join("\n"), "utf-8");
        autoFixed.push(`Removed orphan decision index row for ${id} (file does not exist).`);
      }
    }
  }

  return { autoFixed, pendingFixes };
}

function cat7OrphanCommitRefs(projectRoot: string, phases: PhaseEntry[]): PendingFix[] {
  const allHashes: { hash: string; phaseId: string; isMerge: boolean }[] = [];
  for (const p of phases) {
    for (const hash of p.commits) {
      allHashes.push({ hash, phaseId: p.phaseId, isMerge: hash === p.mergeCommit });
    }
  }
  if (allHashes.length === 0) return [];

  // Use spawnSync to pass hashes via stdin — avoids shell redirection and temp files
  const hashInput = allHashes.map(h => h.hash).join("\n");
  const result = spawnSync("git", ["cat-file", "--batch-check"], {
    cwd: projectRoot,
    input: hashInput,
    encoding: "utf-8",
  });
  if (result.error || result.status !== 0) return [];
  const checkResult = result.stdout || "";

  // git cat-file outputs the input hash as-is (may be abbreviated) followed by type or "missing"
  // Index both the full output token and its first 7 chars to match stored abbreviated hashes
  const missing = new Set<string>();
  for (const line of checkResult.split("\n")) {
    if (line.includes(" missing")) {
      const h = line.split(" ")[0].trim();
      missing.add(h);
      missing.add(h.slice(0, 7));
    }
  }

  const fixes: PendingFix[] = [];
  const seen = new Set<string>();
  for (const entry of allHashes) {
    const isOrphaned = missing.has(entry.hash) || missing.has(entry.hash.slice(0, 7));
    if (isOrphaned && !seen.has(entry.hash)) {
      seen.add(entry.hash);
      fixes.push({
        type: "annotate_orphan",
        phase_id: entry.phaseId,
        hash: entry.hash,
        location: entry.isMerge ? "merge_commit" : "commits",
        date: today(),
      });
    }
  }
  return fixes;
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

function cat9DiscussionDrift(projectMemoryDir: string, ignored: AuditIgnoreSet): AuditFinding[] {
  const discussionsDir = path.join(projectMemoryDir, "discussions");
  if (!fs.existsSync(discussionsDir)) return [];

  const indexContent = readFile(path.join(discussionsDir, "index.md"));
  const indexRows = new Map<string, string>(); // id -> status
  for (const line of indexContent.split("\n")) {
    const m = line.match(/^\|\s*[\d-]+\s*\|\s*(DISCUSSION-[\w-]+)\s*\|\s*(\w+)\s*\|/);
    if (m) indexRows.set(m[1], m[2]);
  }

  const findings: AuditFinding[] = [];
  const fileIds = new Set<string>();

  for (const filename of fs.readdirSync(discussionsDir)) {
    if (!filename.startsWith("DISCUSSION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    fileIds.add(id);
    const fm = parseFrontmatter(readFile(path.join(discussionsDir, filename)));
    const fileStatus = fm["status"] || "unknown";
    const dateStr = id.match(/DISCUSSION-(\d{4}-\d{2}-\d{2})/)?.[1] ?? today();
    const ageDays = daysDiff(dateStr);

    if (!indexRows.has(id)) {
      if (!ignored.has(`discussion-drift:${id}:missing-row`)) {
        findings.push({
          category: 9, severity: "low", interactive: false,
          description: `${id} missing from discussions/index.md`,
          data: { discussion_id: id, issue: "missing_row", age_days: ageDays },
        });
      }
    } else if (indexRows.get(id) !== fileStatus) {
      if (!ignored.has(`discussion-drift:${id}:status-mismatch`)) {
        findings.push({
          category: 9, severity: "low", interactive: false,
          description: `${id} status mismatch: file="${fileStatus}", index="${indexRows.get(id)}"`,
          data: { discussion_id: id, issue: "status_mismatch", file_status: fileStatus, index_status: indexRows.get(id), age_days: ageDays },
        });
      }
    }
  }

  for (const [id] of indexRows) {
    if (!fileIds.has(id) && !ignored.has(`discussion-drift:${id}:orphan-row`)) {
      findings.push({
        category: 9, severity: "low", interactive: false,
        description: `${id} in index.md but file missing`,
        data: { discussion_id: id, issue: "orphan_row" },
      });
    }
  }
  return findings;
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
    const lines = readFile(indexPath).split("\n").filter(l => !l.includes(id));
    fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");
    autoFixed.push(`Archived ${filename} → discussions/archive/ (outcome: none, age > 30d)`);
  }
  return autoFixed;
}

function cat12TagInconsistency(phases: PhaseEntry[], ignored: AuditIgnoreSet): AuditFinding[] {
  const tagsByPhase = new Map<string, string[]>();
  for (const phase of phases) {
    const tagsSection = phase.block.match(/tags:([\s\S]*?)(?=\n\s{4}\w|\n\s{2}[-\w]|$)/);
    if (!tagsSection) continue;
    const tags: string[] = [];
    const tagRe = /^\s+-\s+(\S+)/gm;
    let tm: RegExpExecArray | null;
    while ((tm = tagRe.exec(tagsSection[1])) !== null) tags.push(tm[1]);
    if (tags.length > 0) tagsByPhase.set(phase.phaseId, tags);
  }

  const allUnique = [...new Set([...tagsByPhase.values()].flat())];
  if (allUnique.length < 5) return [];

  const findings: AuditFinding[] = [];
  for (const [phaseId, tags] of tagsByPhase) {
    const phase = phases.find(p => p.phaseId === phaseId);
    const closedMatch = phase?.block.match(/closed_at:\s+(\d{4}-\d{2}-\d{2})/);
    const ageDays = closedMatch ? daysDiff(closedMatch[1]) : 0;

    for (const tag of tags) {
      if (tag.length < 4) continue;
      let best: { other: string; dist: number } | null = null;
      for (const other of allUnique) {
        if (other === tag || other.length < 4) continue;
        if (Math.abs(tag.length - other.length) > 3) continue;
        const dist = levenshtein(tag, other);
        if (dist > 0 && dist <= 2 && (!best || dist < best.dist)) best = { other, dist };
      }
      if (best && !ignored.has(`tag-typo:${phaseId}:${tag}`)) {
        findings.push({
          category: 12, severity: "low", interactive: false,
          description: `Tag "${tag}" in ${phaseId} resembles "${best.other}" (distance ${best.dist})`,
          data: { tag, phase_id: phaseId, similar_tag: best.other, distance: best.dist, age_days: ageDays },
        });
      }
    }
  }
  return findings;
}

function cat14AssignmentIntegrity(
  projectMemoryDir: string,
  ignored: AuditIgnoreSet,
): { autoFixed: string[]; escalations: AuditFinding[] } {
  const autoFixed: string[] = [];
  const escalations: AuditFinding[] = [];

  const assignmentsDir = path.join(projectMemoryDir, "assignments");
  if (!fs.existsSync(assignmentsDir)) {
    return { autoFixed, escalations };
  }

  const now = new Date();

  for (const f of fs.readdirSync(assignmentsDir)) {
    const m = f.match(/^(ASSIGNMENT-.+)\.md$/);
    if (!m) continue;

    const assignmentId = m[1];
    const filePath = path.join(assignmentsDir, f);
    const content = readFile(filePath);
    const parsed = parseFrontmatter(content);
    if (!parsed || Object.keys(parsed).length === 0) continue;

    const status = parsed["status"] || "";
    const type = parsed["type"] || "";
    const targetId = parsed["target_id"] || "";
    const assignedAt = parsed["assigned_at"] || "";
    const remindCount = parseInt(parsed["remind_count"] || "0", 10);
    const completedNote = parsed["completion_note"] || "";
    const completedPhaseId = parsed["completed_phase_id"] || "";
    const completedDecisionId = parsed["completed_decision_id"] || "";
    const completedDiscussionId = parsed["completed_discussion_id"] || "";

    // 14a: Direct assignment target orphan
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
        if (!targetExists) {
          const ageDays = assignedAt ? (now.getTime() - new Date(assignedAt).getTime()) / 86400000 : 999;
          if (ageDays <= 3) {
            escalations.push({
              category: 14,
              severity: "medium",
              interactive: true,
              description: `Assignment ${assignmentId}: target ${targetId} not found (orphaned)`,
              data: { assignmentId, targetId, age_days: Math.round(ageDays) },
            });
          } else {
            autoFixed.push(`Assignment ${assignmentId}: target ${targetId} orphaned >3d, annotated`);
          }
        }
      }
    }

    // 14b: Stale pending assignment (>30 days)
    if (status === "pending" && assignedAt) {
      const ageDays = (now.getTime() - new Date(assignedAt).getTime()) / 86400000;
      if (ageDays > 30) {
        if (!ignored.has(`assignment-stale:${assignmentId}`)) {
          const newCount = remindCount + 1;
          autoFixed.push(`Assignment ${assignmentId}: stale pending (${Math.round(ageDays)}d), remind_count ${remindCount}→${newCount}`);
        }
      }
    }

    // 14c: Completed without evidence
    if (status === "completed" && !completedNote && !completedPhaseId && !completedDecisionId && !completedDiscussionId) {
      if (!ignored.has(`assignment-no-evidence:${assignmentId}`)) {
        escalations.push({
          category: 14,
          severity: "low",
          interactive: false,
          description: `Assignment ${assignmentId}: completed without evidence (no note or link)`,
          data: { assignmentId },
        });
      }
    }
  }

  return { autoFixed, escalations };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export type Profile = "standard" | "minimal";

export async function runAudit(
  projectMemoryDir: string,
  profile: Profile = "standard",
): Promise<AuditReport> {
  // Minimal profile has no audit by design — return empty report immediately.
  if (profile === "minimal") {
    return { auto_fixed: [], pending_fixes: [], escalations: [] };
  }

  const projectRoot = path.dirname(projectMemoryDir);
  const ignored = readAuditIgnore(projectMemoryDir);
  const phases = parsePhasesFromIndex(readFile(path.join(projectMemoryDir, "phases", "index.yml")));

  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];
  const escalations: AuditFinding[] = [];

  // Auto-fix categories (silent)
  autoFixed.push(...cat5MisplacedIssues(projectMemoryDir));
  autoFixed.push(...cat11DiscussionExpiry(projectMemoryDir));

  // Cat 2: always auto-fix (returns string[])
  autoFixed.push(...cat2SummaryStaleness(projectRoot, projectMemoryDir, ignored));

  // Cat 6: auto-fix + pending fixes
  const cat6Result = cat6DecisionDrift(projectMemoryDir, ignored);
  autoFixed.push(...cat6Result.autoFixed);
  pendingFixes.push(...cat6Result.pendingFixes);

  // Cat 8: auto-fix + pending fixes
  const cat8Result = cat8AdrDrift(projectMemoryDir, ignored);
  autoFixed.push(...cat8Result.autoFixed);
  pendingFixes.push(...cat8Result.pendingFixes);

  // Cat 7: pending fixes (YAML annotations — LLM applies these)
  pendingFixes.push(...cat7OrphanCommitRefs(projectRoot, phases));

  // Cat 1: significant commits with no memory trace
  const cat1Result = cat1CommitOrphans(projectRoot, ignored);
  escalations.push(...cat1Result.escalations);

  // Cat 3, 12: report-only escalations
  escalations.push(...cat3StubPlaceholders(projectMemoryDir, ignored));
  escalations.push(...cat12TagInconsistency(phases, ignored));
  // Cat 9 (discussion index drift)
  escalations.push(...cat9DiscussionDrift(projectMemoryDir, ignored));
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

  // Cat 14: Assignment integrity
  const cat14 = cat14AssignmentIntegrity(projectMemoryDir, ignored);
  autoFixed.push(...cat14.autoFixed);
  escalations.push(...cat14.escalations);

  const report: AuditReport = { auto_fixed: autoFixed, pending_fixes: pendingFixes, escalations };
  return report;
}
