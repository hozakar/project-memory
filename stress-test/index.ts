/**
 * Stress-test indexer for project-memory.
 *
 * Run from the mcp-server directory:
 *   cd mcp-server && npx tsx ../stress-test/index.ts ../stress-test/generated
 *
 * The script sets PROJECT_MEMORY_DIR *before* importing any db-touching modules
 * so that LanceDB opens the correct vector-index path.
 */

// ── 1. Set env BEFORE any other imports ────────────────────────────────────
import * as path from "path";
import * as fs from "fs";

const generatedDir = process.argv[2];
if (!generatedDir) {
  console.error("Usage: npx tsx ../stress-test/index.ts <path-to-generated-dir>");
  process.exit(1);
}

const resolvedDir = path.resolve(generatedDir);
if (!fs.existsSync(resolvedDir)) {
  console.error(`Error: directory not found: ${resolvedDir}`);
  process.exit(1);
}

// Must be set before importing db.ts or any module that calls getDb()
process.env.PROJECT_MEMORY_DIR = resolvedDir;

// ── 2. Now safe to import db-touching modules ───────────────────────────────
import { rebuildIndex } from "./src/tools/rebuild_index";
import type {
  IndexEntry,
  PhaseIndexData,
  DecisionIndexData,
  DiscussionIndexData,
} from "./src/types";
import { parseFrontmatter } from "./src/tools/run_audit";

// ── 3. Helpers ──────────────────────────────────────────────────────────────

function readFile(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

function extractSection(content: string, heading: string): string {
  const re = new RegExp(`# ${heading}\\n([\\s\\S]*?)(?=\\n# |$)`);
  const m = content.match(re);
  return m ? m[1].trim().slice(0, 2000) : "";
}

/** Parse a simple YAML list value like: tags: [auth, security, sessions] */
function parseYamlInlineList(value: string): string[] {
  const inner = value.replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return [];
  return inner.split(",").map((s) => s.trim()).filter(Boolean);
}

/** Parse phases/index.yml — returns array of { id, title, status, started_at } */
function parsePhasesIndex(indexPath: string): Array<{ id: string; title: string; status: string; started_at: string }> {
  const content = readFile(indexPath);
  if (!content) return [];

  const phases: Array<{ id: string; title: string; status: string; started_at: string }> = [];

  // Each phase block starts with "  - id: ..."
  const blocks = content.split(/\n  - /);
  for (const block of blocks.slice(1)) {
    const idMatch = block.match(/^id: (.+)/m);
    const titleMatch = block.match(/^title: "?([^"\n]+)"?/m);
    const statusMatch = block.match(/^status: (.+)/m);
    const startedMatch = block.match(/^started_at: (.+)/m);
    if (idMatch) {
      phases.push({
        id: idMatch[1].trim(),
        title: titleMatch ? titleMatch[1].trim() : "",
        status: statusMatch ? statusMatch[1].trim() : "completed",
        started_at: startedMatch ? startedMatch[1].trim() : "",
      });
    }
  }
  return phases;
}

/** Parse phase.yml for tags and summary */
function parsePhaseYml(phaseYmlPath: string): { tags: string[]; summary: string } {
  const content = readFile(phaseYmlPath);
  if (!content) return { tags: [], summary: "" };

  const tagsMatch = content.match(/^tags:\s*(.+)$/m);
  const tags = tagsMatch ? parseYamlInlineList(tagsMatch[1]) : [];

  // summary may be a YAML block scalar (>) — grab everything after "summary: >" until next key
  let summary = "";
  const summaryInlineMatch = content.match(/^summary:\s+([^\n>][^\n]*)$/m);
  if (summaryInlineMatch) {
    summary = summaryInlineMatch[1].trim();
  } else {
    const summaryBlockMatch = content.match(/^summary:\s*>\n([\s\S]*?)(?=\n\S|$)/m);
    if (summaryBlockMatch) {
      summary = summaryBlockMatch[1].replace(/^  /gm, "").trim();
    }
  }
  return { tags, summary };
}

/** Parse a DECISION-*.md file into DecisionIndexData */
function parseDecisionFile(filePath: string): DecisionIndexData | null {
  const content = readFile(filePath);
  if (!content) return null;

  const fm = parseFrontmatter(content);
  if (!fm.id) return null;

  const touchesRaw = content.match(/^touches:\s*\[([^\]]*)\]/m);
  const touches = touchesRaw
    ? touchesRaw[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  const context = extractSection(content, "Context").slice(0, 1000);

  // decisionBody = Decision section + Rationale section
  const decisionSection = extractSection(content, "Decision");
  const rationaleSection = extractSection(content, "Rationale");
  const decisionBody = (decisionSection + "\n\n" + rationaleSection).trim().slice(0, 2000);

  return {
    id: fm.id,
    title: fm.title ?? "",
    status: fm.status ?? "active",
    provenance: fm.provenance,
    context,
    decisionBody,
    touches,
  };
}

/** Parse a DISCUSSION-*.md file into DiscussionIndexData */
function parseDiscussionFile(filePath: string): DiscussionIndexData | null {
  const content = readFile(filePath);
  if (!content) return null;

  const fm = parseFrontmatter(content);
  if (!fm.id) return null;

  // tags inline list from frontmatter
  const tagsRaw = content.match(/^tags:\s*\[([^\]]*)\]/m);
  const tags = tagsRaw
    ? tagsRaw[1].split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  // outcome.summary — nested YAML; grab the summary: line inside outcome block
  const outcomeSummaryMatch = content.match(/^  summary:\s+(.+)$/m);
  const outcome = outcomeSummaryMatch ? outcomeSummaryMatch[1].trim() : fm.summary ?? "";

  // bodyText: concatenate all named sections
  const context = extractSection(content, "Context");
  const points = extractSection(content, "Discussion Points");
  const conclusions = extractSection(content, "Conclusions");
  const bodyText = [context, points, conclusions].filter(Boolean).join("\n\n").slice(0, 2000);

  return {
    id: fm.id,
    title: fm.title ?? "",
    status: fm.status ?? "concluded",
    provenance: fm.provenance,
    outcome,
    tags,
    summary: fm.summary ?? "",
    bodyText,
  };
}

// ── 4. Build IndexEntry array ───────────────────────────────────────────────

async function main() {
  const pmDir = path.join(resolvedDir, ".project-memory");

  const entries: IndexEntry[] = [];
  const t0 = Date.now();

  // ── Phases ────────────────────────────────────────────────────────────────
  const phasesIndexPath = path.join(pmDir, "phases", "index.yml");
  const phasesMeta = parsePhasesIndex(phasesIndexPath);
  console.log(`Parsed ${phasesMeta.length} phase entries from index.yml`);

  let phaseCount = 0;
  for (const meta of phasesMeta) {
    const phaseYmlPath = path.join(pmDir, "phases", meta.id, "phase.yml");
    const { tags, summary } = parsePhaseYml(phaseYmlPath);

    const data: PhaseIndexData = {
      id: meta.id,
      title: meta.title,
      tags,
      planText: "",
      implementationText: summary,
      commitDiffs: [],
      status: meta.status,
    };

    entries.push({ type: "phase", data });
    phaseCount++;

    if (phaseCount % 100 === 0) {
      process.stdout.write(`  Built ${phaseCount} / ${phasesMeta.length} phase entries...\n`);
    }
  }
  console.log(`  Phase entries built: ${phaseCount}`);

  // ── Decisions ─────────────────────────────────────────────────────────────
  const decisionsDir = path.join(pmDir, "decisions");
  let decisionFiles: string[] = [];
  try {
    decisionFiles = fs.readdirSync(decisionsDir)
      .filter((f) => f.startsWith("DECISION-") && f.endsWith(".md"))
      .map((f) => path.join(decisionsDir, f));
  } catch {
    console.warn("  No decisions directory found, skipping.");
  }

  let decisionCount = 0;
  for (const filePath of decisionFiles) {
    const data = parseDecisionFile(filePath);
    if (data) {
      entries.push({ type: "decision", data });
      decisionCount++;
    }
    if (decisionCount % 100 === 0 && decisionCount > 0) {
      process.stdout.write(`  Built ${decisionCount} / ${decisionFiles.length} decision entries...\n`);
    }
  }
  console.log(`  Decision entries built: ${decisionCount}`);

  // ── Discussions ───────────────────────────────────────────────────────────
  const discussionsDir = path.join(pmDir, "discussions");
  let discussionFiles: string[] = [];
  try {
    discussionFiles = fs.readdirSync(discussionsDir)
      .filter((f) => f.startsWith("DISCUSSION-") && f.endsWith(".md"))
      .map((f) => path.join(discussionsDir, f));
  } catch {
    console.warn("  No discussions directory found, skipping.");
  }

  let discussionCount = 0;
  for (const filePath of discussionFiles) {
    const data = parseDiscussionFile(filePath);
    if (data) {
      entries.push({ type: "discussion", data });
      discussionCount++;
    }
    if (discussionCount % 100 === 0 && discussionCount > 0) {
      process.stdout.write(`  Built ${discussionCount} / ${discussionFiles.length} discussion entries...\n`);
    }
  }
  console.log(`  Discussion entries built: ${discussionCount}`);

  // ── Call rebuildIndex ─────────────────────────────────────────────────────
  const buildMs = Date.now() - t0;
  console.log(`\nEntry build phase complete in ${buildMs}ms`);
  console.log(`Calling rebuildIndex with ${entries.length} entries...`);

  const t1 = Date.now();
  try {
    const result = await rebuildIndex(entries);
    const indexMs = Date.now() - t1;
    const totalMs = Date.now() - t0;

    console.log("\n── Results ──────────────────────────────────────────────");
    console.log(`  Total entries submitted : ${entries.length}`);
    console.log(`  Indexed successfully    : ${result.indexed}`);
    console.log(`  Failed                  : ${result.failed}`);
    console.log(`  Build phase             : ${buildMs}ms`);
    console.log(`  rebuildIndex call       : ${indexMs}ms`);
    console.log(`  Total elapsed           : ${totalMs}ms`);
    console.log("─────────────────────────────────────────────────────────\n");

    if (result.failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error("rebuildIndex threw:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
