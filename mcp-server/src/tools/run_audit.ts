import * as fs from "fs";
import * as path from "path";
import { execSync, spawnSync } from "child_process";
// execSync used by git() helper; spawnSync used by cat7 for stdin piping
import type { AuditReport, AuditFinding, PendingFix } from "../types";

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

function parseFrontmatter(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return result;
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.+)$/);
    if (kv) result[kv[1]] = kv[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return result;
}

function readAuditIgnore(projectMemoryDir: string): Set<string> {
  const configPath = path.join(projectMemoryDir, "config.yml");
  const content = readFile(configPath);
  const ignored = new Set<string>();
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

    entries.push({ phaseId, commits, mergeCommit, status, block });
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

function isInteractive(severity: "high" | "medium" | "low", ageDays: number): boolean {
  if (severity === "high") return true;
  if (severity === "medium") return ageDays <= 3;
  return false;
}

const TRIVIAL_RE = /^(docs|chore\(lint|chore\(format|chore\(deps|chore\(memory|chore\(audit|fix\(lint|phase:)/;

// ---------------------------------------------------------------------------
// Audit categories
// ---------------------------------------------------------------------------

function cat1CommitOrphans(
  projectRoot: string,
  phases: PhaseEntry[],
  ignored: Set<string>
): AuditFinding[] {
  const logOutput = git("git log --oneline -30", projectRoot);
  if (!logOutput) return [];

  const allTracked = new Set<string>();
  for (const p of phases) for (const h of p.commits) allTracked.add(h);
  // Also index abbreviated form (git log --oneline returns 7-char hashes)
  for (const p of phases) for (const h of p.commits) allTracked.add(h.slice(0, 7));

  const orphans: string[] = [];
  for (const line of logOutput.split("\n")) {
    const lm = line.match(/^([0-9a-f]{7,40})\s+(.+)$/);
    if (!lm) continue;
    const [, hash, subject] = lm;
    if (allTracked.has(hash)) continue;
    if (TRIVIAL_RE.test(subject)) continue;
    if (ignored.has(`commit:${hash}`)) continue;
    orphans.push(hash);
  }

  if (orphans.length === 0) return [];
  return [{
    category: 1, severity: "high", interactive: true,
    description: `${orphans.length} commit(s) not tracked in any phase`,
    data: { hashes: orphans },
  }];
}

function cat2SummaryStaleness(
  projectRoot: string,
  projectMemoryDir: string,
  ignored: Set<string>
): AuditFinding[] {
  const latestDate = git("git log -1 --format=%cs", projectRoot);
  if (!latestDate) return [];
  const ageDays = daysDiff(latestDate);
  const summariesDir = path.join(projectMemoryDir, "summaries");
  if (!fs.existsSync(summariesDir)) return [];

  const findings: AuditFinding[] = [];
  for (const filename of fs.readdirSync(summariesDir)) {
    if (!filename.endsWith(".md")) continue;
    if (ignored.has(`summary:${filename}`)) continue;
    const content = readFile(path.join(summariesDir, filename));
    const luMatch = content.match(/Last Updated:\s*(\d{4}-\d{2}-\d{2})/);
    if (!luMatch) {
      findings.push({
        category: 2, severity: "medium", interactive: true,
        description: `${filename} has no 'Last Updated:' field`,
        data: { filename, issue: "missing_last_updated" },
      });
      continue;
    }
    if (luMatch[1] < latestDate) {
      findings.push({
        category: 2, severity: "medium", interactive: isInteractive("medium", ageDays),
        description: `${filename} stale (Last Updated ${luMatch[1]}, latest commit ${latestDate})`,
        data: { filename, last_updated: luMatch[1], project_commit_date: latestDate, age_days: ageDays },
      });
    }
  }
  return findings;
}

function cat3StubPlaceholders(projectMemoryDir: string, ignored: Set<string>): AuditFinding[] {
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

function cat4OpenPhaseGap(
  projectRoot: string,
  phases: PhaseEntry[],
  ignored: Set<string>
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const phase of phases) {
    if (!phase.status || phase.status === "completed" || phase.status === "abandoned") continue;
    if (ignored.has(`phase-gap:${phase.phaseId}`)) continue;

    let branch = "";
    const branchMatch = phase.block.match(/branch:\s+(\S+)/);
    if (branchMatch && branchMatch[1] !== "null") {
      branch = branchMatch[1].replace(/^['"]|['"]$/g, "");
    } else {
      for (const fb of ["main", "master", "staging"]) {
        if (git(`git rev-parse --verify ${fb}`, projectRoot)) { branch = fb; break; }
      }
    }
    if (!branch) continue;

    const logOutput = git(`git log --oneline --max-count=200 ${branch}`, projectRoot);
    if (!logOutput) continue;

    const missing: string[] = [];
    for (const line of logOutput.split("\n")) {
      const lm = line.match(/^([0-9a-f]{7,40})\s+(.+)$/);
      if (!lm) continue;
      if (!phase.commits.has(lm[1]) && !TRIVIAL_RE.test(lm[2])) missing.push(lm[1]);
    }

    if (missing.length > 0) {
      findings.push({
        category: 4, severity: "high", interactive: true,
        description: `Open phase ${phase.phaseId} missing ${missing.length} commit(s) on ${branch}`,
        data: { phase_id: phase.phaseId, branch, missing_hashes: missing },
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

function cat6DecisionDrift(projectMemoryDir: string, ignored: Set<string>): AuditFinding[] {
  const decisionsDir = path.join(projectMemoryDir, "decisions");
  if (!fs.existsSync(decisionsDir)) return [];

  const indexContent = readFile(path.join(decisionsDir, "index.md"));
  const indexRows = new Map<string, string>(); // id -> status
  for (const line of indexContent.split("\n")) {
    const m = line.match(/^\|\s*[\d-]+\s*\|\s*(DECISION-[\w-]+)\s*\|\s*\S+\s*\|\s*(\w+)\s*\|/);
    if (m) indexRows.set(m[1], m[2]);
  }

  const findings: AuditFinding[] = [];
  const fileIds = new Set<string>();

  for (const filename of fs.readdirSync(decisionsDir)) {
    if (!filename.startsWith("DECISION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    fileIds.add(id);
    const fm = parseFrontmatter(readFile(path.join(decisionsDir, filename)));
    const fileStatus = fm["status"] || "unknown";
    const dateStr = id.match(/DECISION-(\d{4}-\d{2}-\d{2})/)?.[1] ?? today();
    const ageDays = daysDiff(dateStr);

    if (!indexRows.has(id)) {
      if (!ignored.has(`decision-drift:${id}:missing-row`)) {
        findings.push({
          category: 6, severity: "high", interactive: true,
          description: `${id} has no row in decisions/index.md`,
          data: { decision_id: id, issue: "missing_row", age_days: ageDays },
        });
      }
    } else if (indexRows.get(id) !== fileStatus) {
      if (!ignored.has(`decision-drift:${id}:status-mismatch`)) {
        findings.push({
          category: 6, severity: "high", interactive: true,
          description: `${id} status mismatch: file="${fileStatus}", index="${indexRows.get(id)}"`,
          data: { decision_id: id, issue: "status_mismatch", file_status: fileStatus, index_status: indexRows.get(id), age_days: ageDays },
        });
      }
    }
  }

  for (const [id] of indexRows) {
    if (!fileIds.has(id) && !ignored.has(`decision-drift:${id}:orphan-row`)) {
      findings.push({
        category: 6, severity: "high", interactive: true,
        description: `${id} in index.md but file does not exist`,
        data: { decision_id: id, issue: "orphan_row" },
      });
    }
  }
  return findings;
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

function cat8AdrDrift(projectMemoryDir: string, ignored: Set<string>): AuditFinding[] {
  const configContent = readFile(path.join(projectMemoryDir, "config.yml"));
  if (!configContent) return [];
  const adrDirMatch = configContent.match(/adr_dir:\s*(\S+)/);
  if (!adrDirMatch) return [];

  const projectRoot = path.dirname(projectMemoryDir);
  const adrDir = path.join(projectRoot, adrDirMatch[1]);
  const decisionsDir = path.join(projectMemoryDir, "decisions");
  if (!fs.existsSync(decisionsDir)) return [];

  const findings: AuditFinding[] = [];
  for (const filename of fs.readdirSync(decisionsDir)) {
    if (!filename.startsWith("DECISION-") || !filename.endsWith(".md")) continue;
    const id = filename.slice(0, -3);
    const fm = parseFrontmatter(readFile(path.join(decisionsDir, filename)));
    const dateStr = id.match(/DECISION-(\d{4}-\d{2}-\d{2})/)?.[1] ?? today();
    const ageDays = daysDiff(dateStr);

    const adrId = fm["adr_id"];
    if (!adrId || adrId === "null") {
      if (!ignored.has(`adr-drift:${id}:missing-adr_id`)) {
        findings.push({
          category: 8, severity: "medium", interactive: isInteractive("medium", ageDays),
          description: `${id} has no adr_id field`,
          data: { decision_id: id, issue: "missing_adr_id", age_days: ageDays },
        });
      }
      continue;
    }

    const paddedId = adrId.padStart(4, "0");
    if (!fs.existsSync(adrDir)) {
      if (!ignored.has(`adr-drift:${id}:missing-file`)) {
        findings.push({
          category: 8, severity: "medium", interactive: isInteractive("medium", ageDays),
          description: `adr/ directory missing for ${id}`,
          data: { decision_id: id, issue: "missing_file", adr_id: paddedId, age_days: ageDays },
        });
      }
      continue;
    }

    const adrFiles = fs.readdirSync(adrDir).filter(f => f.startsWith(paddedId + "-") && f.endsWith(".md"));
    if (adrFiles.length === 0) {
      if (!ignored.has(`adr-drift:${id}:missing-file`)) {
        findings.push({
          category: 8, severity: "medium", interactive: isInteractive("medium", ageDays),
          description: `adr/${paddedId}-*.md missing for ${id}`,
          data: { decision_id: id, issue: "missing_file", adr_id: paddedId, age_days: ageDays },
        });
      }
      continue;
    }

    if ((fm["status"] || "active") === "active") {
      const adrContent = readFile(path.join(adrDir, adrFiles[0]));
      const statusMatch = adrContent.match(/^Status:\s*(.+)$/m);
      if (statusMatch && !statusMatch[1].startsWith("Accepted")) {
        if (!ignored.has(`adr-drift:${id}:status-mismatch`)) {
          findings.push({
            category: 8, severity: "medium", interactive: isInteractive("medium", ageDays),
            description: `${id} is active but adr/${adrFiles[0]} Status="${statusMatch[1]}"`,
            data: { decision_id: id, issue: "status_mismatch", decision_status: "active", adr_status: statusMatch[1], age_days: ageDays },
          });
        }
      }
    }
  }
  return findings;
}

function cat9DiscussionDrift(projectMemoryDir: string, ignored: Set<string>): AuditFinding[] {
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

function cat10PhaseCompleteness(projectMemoryDir: string, phases: PhaseEntry[], ignored: Set<string>): AuditFinding[] {
  const required = ["phase.yml", "plan.md", "implementation.md", "review-and-fixes.md", "followup.md"];
  const findings: AuditFinding[] = [];

  for (const phase of phases) {
    const p = phase;
    if (p.status !== "completed") continue;
    const closedAtMatch = p.block.match(/closed_at:\s+(\d{4}-\d{2}-\d{2})/);
    const ageDays = closedAtMatch ? daysDiff(closedAtMatch[1]) : 999;
    const phaseDir = path.join(projectMemoryDir, "phases", p.phaseId);

    for (const file of required) {
      if (!fs.existsSync(path.join(phaseDir, file))) {
        if (!ignored.has(`phase-completeness:${p.phaseId}:${file}`)) {
          findings.push({
            category: 10, severity: "medium", interactive: isInteractive("medium", ageDays),
            description: `${p.phaseId} missing ${file}`,
            data: { phase_id: p.phaseId, missing_file: file, age_days: ageDays },
          });
        }
      }
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

function cat12TagInconsistency(phases: PhaseEntry[], ignored: Set<string>): AuditFinding[] {
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

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runAudit(projectMemoryDir: string): Promise<AuditReport> {
  const projectRoot = path.dirname(projectMemoryDir);
  const ignored = readAuditIgnore(projectMemoryDir);
  const phases = parsePhasesFromIndex(readFile(path.join(projectMemoryDir, "phases", "index.yml")));

  const autoFixed: string[] = [];
  const pendingFixes: PendingFix[] = [];
  const escalations: AuditFinding[] = [];

  // Auto-fix categories (silent)
  autoFixed.push(...cat5MisplacedIssues(projectMemoryDir));
  autoFixed.push(...cat11DiscussionExpiry(projectMemoryDir));

  // Pending fixes (YAML mutations — LLM applies these)
  pendingFixes.push(...cat7OrphanCommitRefs(projectRoot, phases));

  // Escalation categories
  escalations.push(...cat1CommitOrphans(projectRoot, phases, ignored));
  escalations.push(...cat2SummaryStaleness(projectRoot, projectMemoryDir, ignored));
  escalations.push(...cat3StubPlaceholders(projectMemoryDir, ignored));
  escalations.push(...cat4OpenPhaseGap(projectRoot, phases, ignored));
  escalations.push(...cat6DecisionDrift(projectMemoryDir, ignored));
  escalations.push(...cat8AdrDrift(projectMemoryDir, ignored));
  escalations.push(...cat9DiscussionDrift(projectMemoryDir, ignored));
  escalations.push(...cat10PhaseCompleteness(projectMemoryDir, phases, ignored));
  escalations.push(...cat12TagInconsistency(phases, ignored));
  // Cat 13: handled separately by check_consistency

  return { auto_fixed: autoFixed, pending_fixes: pendingFixes, escalations };
}
