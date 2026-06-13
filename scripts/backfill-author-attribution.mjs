/**
 * Backfill Author Attribution
 * ---------------------------
 * One-shot script that inserts `created_by` + `contributors` frontmatter
 * into every historical project-memory record that lacks it.
 *
 * Idempotent: re-running on already-backfilled files is a no-op.
 * After running this script, run `rebuild_index` (MCP) to refresh the
 * vector database with the new fields.
 *
 * Uses only Node.js built-ins (fs, path, url). No external dependencies.
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';

// ── Resolve project root ────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ── Attribution block to insert ─────────────────────────────────────────
const ATTRIBUTION_BLOCK = [
  'created_by:',
  '  name: "unknown"',
  '  email: "unknown"',
  'contributors:',
  '  - name: "unknown"',
  '    email: "unknown"',
].join('\n');

// Regex to detect an existing created_by key at the top level of YAML
const CREATED_BY_RE = /^created_by\s*:/m;

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Collect files matching `pattern` in `dir` (non-recursive).
 * `pattern` is a function: (name) => boolean.
 * Returns absolute paths.
 */
function collectFiles(dir, pattern) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && pattern(e.name))
    .map((e) => join(dir, e.name));
}

/**
 * Collect phase.yml files from phase subdirectories.
 */
function collectPhaseFiles(phasesDir) {
  if (!existsSync(phasesDir)) return [];
  const entries = readdirSync(phasesDir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const ymlPath = join(phasesDir, e.name, 'phase.yml');
    if (existsSync(ymlPath)) files.push(ymlPath);
  }
  return files;
}

/**
 * Process a .md file: locate YAML frontmatter delimited by ---,
 * insert attribution block before the closing --- if created_by is absent.
 * Returns true if the file was modified.
 */
function processMdFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');

  // Must start with --- on the first line
  if (!raw.startsWith('---')) return false;

  // Find the closing --- (the next line that is exactly ---)
  const lines = raw.split(/\r?\n/);
  if (lines[0] !== '---') return false;

  let closingIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      closingIdx = i;
      break;
    }
  }
  if (closingIdx === -1) return false; // no closing delimiter

  // Extract frontmatter region for created_by check
  const frontmatterLines = lines.slice(1, closingIdx);
  const frontmatterText = frontmatterLines.join('\n');

  if (CREATED_BY_RE.test(frontmatterText)) return false; // already has it

  // Determine line ending from original content
  const lineEnding = raw.includes('\r\n') ? '\r\n' : '\n';

  // Insert attribution block before the closing ---
  // Preserve the exact line ending style
  const blockLines = ATTRIBUTION_BLOCK.split('\n');
  const indentedBlock = blockLines.map((l) => l).join(lineEnding);

  // Build new content
  const before = lines.slice(0, closingIdx).join(lineEnding);
  const after = lines.slice(closingIdx).join(lineEnding);

  const newContent = before + lineEnding + indentedBlock + lineEnding + after;

  writeFileSync(filePath, newContent, 'utf8');
  return true;
}

/**
 * Process a phase.yml file: the entire file is YAML (no frontmatter fence).
 * Append attribution block at the end if created_by is absent.
 * Returns true if the file was modified.
 */
function processPhaseYml(filePath) {
  const raw = readFileSync(filePath, 'utf8');

  if (CREATED_BY_RE.test(raw)) return false; // already has it

  const lineEnding = raw.includes('\r\n') ? '\r\n' : '\n';

  // Ensure exactly one trailing newline before appending
  const trimmed = raw.replace(/[\r\n]+$/, '');
  const blockLines = ATTRIBUTION_BLOCK.split('\n');
  const indentedBlock = blockLines.join(lineEnding);

  const newContent = trimmed + lineEnding + lineEnding + indentedBlock + lineEnding;

  writeFileSync(filePath, newContent, 'utf8');
  return true;
}

// ── Main ─────────────────────────────────────────────────────────────────

const projectMemoryDir = join(ROOT, '.project-memory');

// Collect all target files
const targetFiles = [
  // phases
  ...collectPhaseFiles(join(projectMemoryDir, 'phases')),
  // decisions
  ...collectFiles(join(projectMemoryDir, 'decisions'), (name) =>
    /^DECISION-.+\.md$/.test(name)
  ),
  // discussions (top-level only, exclude archive/)
  ...collectFiles(join(projectMemoryDir, 'discussions'), (name) =>
    /^DISCUSSION-.+\.md$/.test(name)
  ),
  // issues/open
  ...collectFiles(join(projectMemoryDir, 'issues', 'open'), (name) =>
    /^ISSUE-.+\.md$/.test(name)
  ),
  // issues/closed
  ...collectFiles(join(projectMemoryDir, 'issues', 'closed'), (name) =>
    /^ISSUE-.+\.md$/.test(name)
  ),
];

let touched = 0;
let skipped = 0;

for (const filePath of targetFiles) {
  const relPath = filePath.replace(ROOT, '.').replace(/\\/g, '/');
  try {
    const isYml = filePath.endsWith('.yml');
    const modified = isYml ? processPhaseYml(filePath) : processMdFile(filePath);

    if (modified) {
      console.log(`+ ${relPath}`);
      touched++;
    } else {
      console.log(`= ${relPath}`);
      skipped++;
    }
  } catch (err) {
    console.error(`ERROR processing ${relPath}: ${err.message}`);
    process.exit(1);
  }
}

console.log(`\ntouched: ${touched}\nskipped: ${skipped}`);