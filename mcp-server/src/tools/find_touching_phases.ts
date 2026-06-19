import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import type { TouchingPhasesResult, TouchingPhase, PhaseCommitMatch } from "../types";

/**
 * Run a git command in the given working directory.
 */
function git(cmd: string, cwd: string): string {
  try {
    return execSync(cmd, { cwd, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

/**
 * Get the project root from PROJECT_MEMORY_DIR or cwd.
 */
function getProjectRoot(): string {
  const envVal = process.env.PROJECT_MEMORY_DIR;
  const GARBAGE = new Set(["undefined", "null", ""]);
  const raw = envVal !== undefined && !GARBAGE.has(envVal) ? envVal : null;
  if (raw && !path.isAbsolute(raw)) {
    throw new Error(`PROJECT_MEMORY_DIR must be an absolute path; got: "${raw}"`);
  }
  return raw ?? process.cwd();
}

/**
 * Parse phase.yml content and extract commits list + basic metadata.
 * Handles YAML list format: commits:\n  - abc1234\n  - def5678
 * Also handles merge_commit: field.
 */
function parsePhaseYml(content: string): { commits: string[]; title: string; status: string; startedAt: string; closedAt?: string } {
  const result: { commits: string[]; title: string; status: string; startedAt: string; closedAt?: string } = {
    commits: [],
    title: "",
    status: "",
    startedAt: "",
  };

  // Extract simple scalar fields
  const titleM = content.match(/^title:\s*"?(.+?)"?\s*$/m);
  if (titleM) result.title = titleM[1].trim();

  const statusM = content.match(/^status:\s*(\S+)\s*$/m);
  if (statusM) result.status = statusM[1];

  const startedM = content.match(/^started_at:\s*(\S+)\s*$/m);
  if (startedM) {
    result.startedAt = startedM[1];
  } else {
    const createdM = content.match(/^created_at:\s*(\S+)\s*$/m);
    if (createdM) result.startedAt = createdM[1];
  }

  const closedM = content.match(/^closed_at:\s*(\S+)\s*$/m);
  if (closedM) result.closedAt = closedM[1];

  // Extract commits block
  const commitsMatch = content.match(/^commits:\s*\n([\s\S]*?)(?=^\w|\Z)/m);
  if (commitsMatch) {
    const hashRe = /^\s*-\s+([0-9a-f]{7,40})\s*$/gm;
    let hm: RegExpExecArray | null;
    while ((hm = hashRe.exec(commitsMatch[0])) !== null) {
      result.commits.push(hm[1].toLowerCase());
    }
  }

  // Also check merge_commit
  const mergeM = content.match(/^merge_commit:\s*([0-9a-f]{7,40})\s*$/m);
  if (mergeM) {
    result.commits.push(mergeM[1].toLowerCase());
  }

  return result;
}

export async function findTouchingPhases(
  filePath: string
): Promise<TouchingPhasesResult> {
  try {
    const root = getProjectRoot();
    const pmDir = path.join(root, ".project-memory");
    const phasesDir = path.join(pmDir, "phases");

    // 1. Get git log for the file
    const gitOutput = git(
      `git log --format="%H|%s|%aI" -- "${filePath.replace(/"/g, '\\"')}"`,
      root
    );

    const gitCommits: PhaseCommitMatch[] = [];
    if (gitOutput) {
      for (const line of gitOutput.split("\n")) {
        const parts = line.split("|");
        if (parts.length >= 3) {
          const fullHash = parts[0].trim();
          gitCommits.push({
            hash: fullHash,
            shortHash: fullHash.slice(0, 7),
            message: parts[1].trim(),
            date: parts[2].trim(),
          });
        }
      }
    }

    if (gitCommits.length === 0) {
      return { file: filePath, phases: [], unmatchedCommits: [] };
    }

    // 2. Read all phase.yml files
    const phases: TouchingPhase[] = [];
    const matchedHashes = new Set<string>();

    if (fs.existsSync(phasesDir)) {
      const entries = fs.readdirSync(phasesDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const ymlPath = path.join(phasesDir, entry.name, "phase.yml");
        if (!fs.existsSync(ymlPath)) continue;

        try {
          const content = fs.readFileSync(ymlPath, "utf-8");
          const parsed = parsePhaseYml(content);

          // Match git commits against phase commits (prefix match — first 7 chars)
          const matchingCommits: PhaseCommitMatch[] = [];
          for (const gc of gitCommits) {
            const matched = parsed.commits.some(pc =>
              pc.length >= 7 && gc.hash.toLowerCase().startsWith(pc.toLowerCase()) ||
              gc.shortHash.toLowerCase() === pc.toLowerCase()
            );
            if (matched) {
              matchingCommits.push(gc);
              matchedHashes.add(gc.hash);
            }
          }

          if (matchingCommits.length > 0) {
            phases.push({
              phaseId: entry.name,
              title: parsed.title,
              status: parsed.status,
              startedAt: parsed.startedAt,
              closedAt: parsed.closedAt,
              matchingCommits,
            });
          }
        } catch {
          // skip unreadable phase
        }
      }
    }

    // 3. Sort phases by most recent matching commit date
    phases.sort((a, b) => {
      const aDate = a.matchingCommits[0]?.date ?? "";
      const bDate = b.matchingCommits[0]?.date ?? "";
      return bDate.localeCompare(aDate);
    });

    // 4. Unmatched commits
    const unmatchedCommits = gitCommits.filter(gc => !matchedHashes.has(gc.hash));

    return { file: filePath, phases, unmatchedCommits };
  } catch (err) {
    return { file: filePath, phases: [], unmatchedCommits: [] };
  }
}
