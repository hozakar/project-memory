import * as fs from "fs";
import * as path from "path";
import type { Identity } from "../types";

/**
 * Parse YAML frontmatter from a record file and extract created_by and contributors.
 * Handles nested YAML for created_by and contributors fields.
 */
function parseIdentityFromFrontmatter(content: string): { createdBy?: Identity; contributors: Identity[] } {
  const result: { createdBy?: Identity; contributors: Identity[] } = { contributors: [] };
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return result;

  const fm = match[1];

  // Parse created_by: { name: X, email: Y }
  const cbMatch = fm.match(/^created_by:\s*\n(\s+)name:\s*(.+)\n\1email:\s*(.+)/m);
  if (cbMatch) {
    result.createdBy = {
      name: cbMatch[2].trim().replace(/^['"]|['"]$/g, ""),
      email: cbMatch[3].trim().replace(/^['"]|['"]$/g, ""),
    };
  }

  // Parse contributors: list  ( - name: X \n   email: Y )
  const contribSection = fm.match(/^contributors:\s*\n([\s\S]*?)(?:^\w|\Z)/m);
  if (contribSection) {
    const entries = contribSection[1].matchAll(/^\s+-\s+name:\s*(.+)\n\s+email:\s*(.+)/gm);
    for (const e of entries) {
      result.contributors.push({
        name: e[1].trim().replace(/^['"]|['"]$/g, ""),
        email: e[2].trim().replace(/^['"]|['"]$/g, ""),
      });
    }
  }

  return result;
}

/**
 * Get the .project-memory/ directory path from environment or cwd.
 */
function getProjectMemoryDir(): string {
  const envVal = process.env.PROJECT_MEMORY_DIR;
  const GARBAGE = new Set(["undefined", "null", ""]);
  const raw = envVal !== undefined && !GARBAGE.has(envVal) ? envVal : null;
  const root = raw ?? process.cwd();
  const projectMemoryDir = path.join(root, ".project-memory");

  if (!fs.existsSync(projectMemoryDir)) {
    throw new Error(
      `No .project-memory/ directory found at "${root}". ` +
      `Ensure PROJECT_MEMORY_DIR points to the project root where the skill was initialized.`
    );
  }
  return projectMemoryDir;
}

/**
 * Walk a directory, return all .md and .yml files (non-recursive for summaries/).
 */
function walkMdFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMdFiles(full));
    } else if (entry.isFile() && (entry.name.endsWith(".md") || entry.name.endsWith(".yml"))) {
      files.push(full);
    }
  }
  return files;
}

export interface ContributorListResult {
  contributors: Identity[];
  total: number;
}

export async function listContributors(): Promise<ContributorListResult> {
  try {
    const pmDir = getProjectMemoryDir();
    const allFiles = walkMdFiles(pmDir);

    const emailMap = new Map<string, Identity>();

    for (const filePath of allFiles) {
      // Skip files that shouldn't have attribution: index files, summaries, eras, config, ADR
      const relative = path.relative(pmDir, filePath).replace(/\\/g, "/");
      if (
        relative === "config.yml" ||
        relative.startsWith("summaries/") ||
        relative.startsWith("eras/") ||
        relative.startsWith("adr/") ||
        relative.startsWith("vector-index/") ||
        relative.endsWith("index.yml") ||
        relative.endsWith("index.md")
      ) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const { createdBy, contributors } = parseIdentityFromFrontmatter(content);

        if (createdBy && createdBy.email && createdBy.email !== "unknown") {
          emailMap.set(createdBy.email.toLowerCase(), createdBy);
        }
        for (const c of contributors) {
          if (c.email && c.email !== "unknown") {
            emailMap.set(c.email.toLowerCase(), c);
          }
        }
      } catch {
        // skip unreadable files
      }
    }

    const sorted = Array.from(emailMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return { contributors: sorted, total: sorted.length };
  } catch {
    return { contributors: [], total: 0 };
  }
}
