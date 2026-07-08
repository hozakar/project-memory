import * as fs from "fs";
import * as path from "path";
import type {
  PendingFix,
  ApplyResult,
  AppliedFix,
  PartialFix,
  FailedFix,
} from "../types";
import { parseFrontmatter, setFrontmatterField } from "./run_audit";
import { validateMemoryId } from "../validation.js";

// ---------------------------------------------------------------------------
// apply_audit_fixes — deterministic execution of run_audit pending_fixes.
//
// HARD INVARIANTS (enforced by code review, not tests):
//   1. This file does NOT import db.ts or embedder.ts. Vector index is never
//      consulted; the source of truth is `.project-memory/` files + payload.
//   2. No prose is synthesized. Templates use payload-supplied fields or
//      explicit TODO placeholders for prose cells (LLM completes those).
//   3. Each fix re-reads its target file before writing — prevents clobbering
//      a sibling fix that already modified the same file in this batch.
// ---------------------------------------------------------------------------

const CLAIM_PLACEHOLDER = "<!-- TODO: claim -->";
const SUMMARY_PLACEHOLDER = "<!-- TODO: summary -->";

function readFile(p: string): string {
  try { return fs.readFileSync(p, "utf-8"); } catch { return ""; }
}

function fileExists(p: string): boolean {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}

function readConfigField(projectMemoryDir: string, key: string): string | null {
  const cfg = readFile(path.join(projectMemoryDir, "config.yml"));
  const re = new RegExp(`^${key}:\\s*(\\S+)`, "m");
  const m = cfg.match(re);
  return m ? m[1].replace(/^['"]|['"]$/g, "") : null;
}

// ---------------------------------------------------------------------------
// assign_commit — append commit hash to phases/<phase_id>/phase.yml `commits:`
// list AND mirror to phases/index.yml entry. Idempotent.
// ---------------------------------------------------------------------------

function applyAssignCommit(
  fix: PendingFix,
  projectMemoryDir: string,
): AppliedFix | FailedFix {
  const phaseId = fix.phaseId;
  const hash = fix.commitHash;
  if (!phaseId || !hash) {
    return { fix_type: "assign_commit", reason: "schema_mismatch", details: "missing phaseId/commitHash" };
  }
  validateMemoryId(phaseId, "phaseId");
  const phasePath = path.join(projectMemoryDir, "phases", phaseId, "phase.yml");
  const indexPath = path.join(projectMemoryDir, "phases", "index.yml");
  if (!fileExists(phasePath)) {
    return { fix_type: "assign_commit", reason: "file_not_found", details: phasePath };
  }

  // 1. phase.yml — append to commits: list
  const phaseContent = readFile(phasePath);
  // Idempotency: a substring scan over the whole file matches prefixes of longer
  // hashes and unrelated fields (notes, merge_commit). Scope the check to a
  // line-anchored `- <hash>` list entry under the commits: block.
  const phaseAlreadyHasHash = new RegExp(`^\\s+-\\s+${hash}(?![0-9a-f])`, "m").test(phaseContent);
  if (phaseAlreadyHasHash) {
    return {
      fix_type: "assign_commit",
      target_file: path.relative(path.dirname(projectMemoryDir), phasePath),
      summary: `Commit ${hash} already in ${phaseId} (no-op)`,
    };
  }

  // Find `commits:` line; handle `commits: []` and `commits:\n  - <hash>` forms.
  let updated: string;
  if (/^commits:\s*\[\]\s*$/m.test(phaseContent)) {
    updated = phaseContent.replace(/^commits:\s*\[\]\s*$/m, `commits:\n  - ${hash}`);
  } else if (/^commits:\s*$/m.test(phaseContent) || /^commits:\s*\n(\s+-)/m.test(phaseContent)) {
    // Multi-line list: append after last entry. Find last `^  - <hash>` directly after `commits:`
    const lines = phaseContent.split("\n");
    let inCommits = false;
    let lastIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (/^commits:\s*$/.test(lines[i])) { inCommits = true; continue; }
      if (inCommits) {
        if (/^\s+- /.test(lines[i])) { lastIdx = i; continue; }
        if (lines[i].trim() === "" || !/^\s/.test(lines[i])) { inCommits = false; }
      }
    }
    if (lastIdx >= 0) {
      lines.splice(lastIdx + 1, 0, `  - ${hash}`);
      updated = lines.join("\n");
    } else {
      // commits: with no entries yet → append first
      updated = phaseContent.replace(/^commits:\s*$/m, `commits:\n  - ${hash}`);
    }
  } else {
    return { fix_type: "assign_commit", reason: "schema_mismatch", details: "could not locate commits: field" };
  }

  fs.writeFileSync(phasePath, updated, "utf-8");

  // 2. phases/index.yml — append to the matching phase entry's commits: list
  if (fileExists(indexPath)) {
    const idxContent = readFile(indexPath);
    // Per-phase-block idempotency: scope the hash check to the target phase's
    // own block, not the whole file (the same abbreviated hash can legitimately
    // appear in other phase blocks, and we should still write to the right one).
    const blockRe = new RegExp(`^  - id:\\s+['"]?${phaseId}['"]?[\\s\\S]*?(?=^  - id:|\\Z)`, "m");
    const blockMatch = idxContent.match(blockRe);
    const alreadyInBlock = blockMatch
      ? new RegExp(`^\\s+-\\s+${hash}(?![0-9a-f])`, "m").test(blockMatch[0])
      : false;
    if (!alreadyInBlock) {
      const lines = idxContent.split("\n");
      let inTarget = false;
      let inCommits = false;
      let lastIdx = -1;
      let commitsLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        const m = lines[i].match(/^\s{2}-\s+id:\s+(\S+)/);
        if (m) {
          inTarget = m[1].replace(/^['"]|['"]$/g, "") === phaseId;
          inCommits = false;
          continue;
        }
        if (!inTarget) continue;
        const cm = lines[i].match(/^(\s+)commits:\s*(\[\])?\s*$/);
        if (cm) { inCommits = true; commitsLineIdx = i; continue; }
        if (inCommits) {
          // A sibling key at the same indent as `commits:` (4 spaces) ends the
          // commits block. Without this, lists under sibling keys (e.g. `tags:`)
          // would be miscounted as commit entries and the new hash would land
          // in the wrong list.
          if (/^\s{4}\w/.test(lines[i])) { inCommits = false; continue; }
          if (/^\s{6,}- /.test(lines[i])) { lastIdx = i; continue; }
          if (!/^\s{4,}/.test(lines[i]) || lines[i].trim() === "") { inCommits = false; }
        }
      }
      if (commitsLineIdx >= 0) {
        if (lines[commitsLineIdx].includes("[]")) {
          lines[commitsLineIdx] = lines[commitsLineIdx].replace(/\[\]/, "");
          lines.splice(commitsLineIdx + 1, 0, `      - ${hash}`);
        } else if (lastIdx >= 0) {
          lines.splice(lastIdx + 1, 0, `      - ${hash}`);
        } else {
          lines.splice(commitsLineIdx + 1, 0, `      - ${hash}`);
        }
        fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");
      }
    }
  }

  return {
    fix_type: "assign_commit",
    target_file: path.relative(path.dirname(projectMemoryDir), phasePath),
    summary: `Assigned commit ${hash} to ${phaseId}`,
  };
}

// ---------------------------------------------------------------------------
// add_decision_index_row — prepend a row to decisions/index.md Active table.
// Claim cell is left as TODO placeholder for LLM to fill.
// Returns PartialFix.
// ---------------------------------------------------------------------------

function applyAddDecisionIndexRow(
  fix: PendingFix,
  projectMemoryDir: string,
): PartialFix | FailedFix {
  const decisionId = fix.decisionId;
  const status = fix.status || "active";
  const touches = (fix.touches || []).join(", ");
  const date = fix.date || new Date().toISOString().slice(0, 10);
  if (!decisionId) {
    return { fix_type: "add_decision_index_row", reason: "schema_mismatch", details: "missing decisionId" };
  }
  validateMemoryId(decisionId, "decisionId");
  const indexPath = path.join(projectMemoryDir, "decisions", "index.md");
  if (!fileExists(indexPath)) {
    return { fix_type: "add_decision_index_row", reason: "file_not_found", details: indexPath };
  }

  const indexContent = readFile(indexPath);
  if (indexContent.includes(`| ${decisionId} |`)) {
    return {
      fix_type: "add_decision_index_row",
      target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
      llm_must_do: `Row for ${decisionId} already present. Verify Claim cell is filled.`,
      context: { decisionId, already_present: true },
    };
  }

  // Read scope + applies_globally from the DECISION file
  const decisionPath = path.join(projectMemoryDir, "decisions", `${decisionId}.md`);
  const fm = parseFrontmatter(readFile(decisionPath));
  const scope = fm["primary_scope"] || "unknown";
  const agRaw = fm["applies_globally"];
  const appliesToAll =
    agRaw === "true" ||
    agRaw === "True" ||
    agRaw === "yes" ||
    agRaw === "Yes" ||
    agRaw === "YES";
  const global = appliesToAll ? "Yes" : "-";

  const newRow = `| ${date} | ${decisionId} | ${scope} | ${status} | ${global} | ${touches} | ${CLAIM_PLACEHOLDER} |`;

  // Find the Active section header table. Locate first row separator `|---|...` after `| Date | ID |`,
  // then insert newRow immediately after.
  const lines = indexContent.split("\n");
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*Date\s*\|\s*ID\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\|[-\s|]+\|$/.test(lines[i + 1])) {
      headerIdx = i + 1; // points to separator row
      break;
    }
  }
  if (headerIdx < 0) {
    return { fix_type: "add_decision_index_row", reason: "schema_mismatch", details: "could not locate Active table header" };
  }
  lines.splice(headerIdx + 1, 0, newRow);
  fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");

  return {
    fix_type: "add_decision_index_row",
    target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
    llm_must_do: `Row inserted with Claim placeholder. Replace "${CLAIM_PLACEHOLDER}" in the row for ${decisionId} with a one-sentence testable Claim derived from the DECISION's # Decision body.`,
    context: { decisionId, placeholder: CLAIM_PLACEHOLDER },
  };
}

// ---------------------------------------------------------------------------
// fix_decision_index_status — change the Status cell of an existing row.
// ---------------------------------------------------------------------------

function applyFixDecisionIndexStatus(
  fix: PendingFix,
  projectMemoryDir: string,
): AppliedFix | FailedFix {
  const decisionId = fix.decisionId;
  const correctStatus = fix.correctStatus;
  if (!decisionId || !correctStatus) {
    return { fix_type: "fix_decision_index_status", reason: "schema_mismatch", details: "missing decisionId/correctStatus" };
  }
  validateMemoryId(decisionId, "decisionId");
  const indexPath = path.join(projectMemoryDir, "decisions", "index.md");
  if (!fileExists(indexPath)) {
    return { fix_type: "fix_decision_index_status", reason: "file_not_found", details: indexPath };
  }
  const content = readFile(indexPath);
  // Row pattern: | Date | ID | Scope | Status | ...
  const rowRe = new RegExp(`^(\\|\\s*\\d{4}-\\d{2}-\\d{2}\\s*\\|\\s*${decisionId}\\s*\\|\\s*[^|]+\\|\\s*)([\\w-]+)(\\s*\\|)`, "m");
  const m = content.match(rowRe);
  if (!m) {
    return { fix_type: "fix_decision_index_status", reason: "ambiguous_target", details: `row for ${decisionId} not found` };
  }
  if (m[2] === correctStatus) {
    return {
      fix_type: "fix_decision_index_status",
      target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
      summary: `Status for ${decisionId} already ${correctStatus} (no-op)`,
    };
  }
  const updated = content.replace(rowRe, `$1${correctStatus}$3`);
  fs.writeFileSync(indexPath, updated, "utf-8");
  return {
    fix_type: "fix_decision_index_status",
    target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
    summary: `Fixed ${decisionId} status: ${m[2]} → ${correctStatus}`,
  };
}

// ---------------------------------------------------------------------------
// assign_adr_id — add `adr_id: <N>` to DECISION frontmatter.
// ---------------------------------------------------------------------------

function applyAssignAdrId(
  fix: PendingFix,
  projectMemoryDir: string,
): AppliedFix | FailedFix {
  const decisionId = fix.decisionId;
  const adrId = fix.adrId;
  if (!decisionId || !adrId) {
    return { fix_type: "assign_adr_id", reason: "schema_mismatch", details: "missing decisionId/adrId" };
  }
  validateMemoryId(decisionId, "decisionId");
  const decisionPath = path.join(projectMemoryDir, "decisions", `${decisionId}.md`);
  if (!fileExists(decisionPath)) {
    return { fix_type: "assign_adr_id", reason: "file_not_found", details: decisionPath };
  }
  const content = readFile(decisionPath);

  // Already set?
  const existing = content.match(/^adr_id:\s*(\S+)/m);
  if (existing && existing[1] !== "null" && existing[1] !== "") {
    return {
      fix_type: "assign_adr_id",
      target_file: path.relative(path.dirname(projectMemoryDir), decisionPath),
      summary: `adr_id already set on ${decisionId} (no-op)`,
    };
  }

  let updated: string;
  if (existing) {
    updated = content.replace(/^adr_id:\s*\S+/m, `adr_id: ${adrId}`);
  } else {
    // Insert before closing frontmatter `---`. Handle CRLF line endings —
    // Windows-checked-out files have \r\n and a \n-only regex silently fails.
    const fmRe = /^(---\r?\n)([\s\S]*?)(\r?\n---)/;
    if (!fmRe.test(content)) {
      return { fix_type: "assign_adr_id", reason: "schema_mismatch", details: "no frontmatter block found" };
    }
    updated = content.replace(fmRe, (_full, open, body, close) => `${open}${body}\nadr_id: ${adrId}${close}`);
  }
  fs.writeFileSync(decisionPath, updated, "utf-8");
  return {
    fix_type: "assign_adr_id",
    target_file: path.relative(path.dirname(projectMemoryDir), decisionPath),
    summary: `Assigned adr_id=${adrId} to ${decisionId}`,
  };
}

// ---------------------------------------------------------------------------
// add_discussion_index_row — prepend a row to discussions/index.md table.
// Summary cell is left as TODO placeholder for LLM to fill.
// Returns PartialFix.
// ---------------------------------------------------------------------------

function applyAddDiscussionIndexRow(
  fix: PendingFix,
  projectMemoryDir: string,
): PartialFix | FailedFix {
  const discussionId = fix.discussionId;
  const status = fix.status || "open";
  const date = fix.date || new Date().toISOString().slice(0, 10);
  if (!discussionId) {
    return { fix_type: "add_discussion_index_row", reason: "schema_mismatch", details: "missing discussionId" };
  }
  validateMemoryId(discussionId, "discussionId");
  const indexPath = path.join(projectMemoryDir, "discussions", "index.md");
  if (!fileExists(indexPath)) {
    return { fix_type: "add_discussion_index_row", reason: "file_not_found", details: indexPath };
  }

  const indexContent = readFile(indexPath);
  if (indexContent.includes(`| ${discussionId} |`)) {
    return {
      fix_type: "add_discussion_index_row",
      target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
      llm_must_do: `Row for ${discussionId} already present. Verify Summary cell is filled.`,
      context: { discussionId, already_present: true },
    };
  }

  // Read outcome + tags from the DISCUSSION file
  const discussionPath = path.join(projectMemoryDir, "discussions", `${discussionId}.md`);
  const fm = parseFrontmatter(readFile(discussionPath));
  // Derive outcome from frontmatter — avoids body-text regex pollution
  const outcomeRaw = fm["outcome"];
  const outcome = (!outcomeRaw || outcomeRaw === "none" || outcomeRaw === "") ? "none" : outcomeRaw;
  const tagsRaw = fm["tags"] || "";
  const tags = tagsRaw ? tagsRaw.replace(/[\[\]"]/g, "").split(/[,;\s]+/).filter(Boolean).join(", ") : "-";

  const newRow = `| ${date} | ${discussionId} | ${status} | ${outcome} | ${tags} | ${SUMMARY_PLACEHOLDER} |`;

  // Find the discussions table by header | Date | ID | Status | + separator row
  const lines = indexContent.split("\n");
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\|\s*Date\s*\|\s*ID\s*\|\s*Status\s*\|/.test(lines[i]) && i + 1 < lines.length && /^\|[\-\s|]+\|$/.test(lines[i + 1])) {
      headerIdx = i + 1; // points to separator row
      break;
    }
  }
  if (headerIdx < 0) {
    return { fix_type: "add_discussion_index_row", reason: "schema_mismatch", details: "could not locate discussions table header" };
  }
  lines.splice(headerIdx + 1, 0, newRow);
  fs.writeFileSync(indexPath, lines.join("\n"), "utf-8");

  return {
    fix_type: "add_discussion_index_row",
    target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
    llm_must_do: `Row inserted with Summary placeholder. Replace "${SUMMARY_PLACEHOLDER}" in the row for ${discussionId} with a one-sentence summary derived from the DISCUSSION body.`,
    context: { discussionId, placeholder: SUMMARY_PLACEHOLDER },
  };
}

// ---------------------------------------------------------------------------
// fix_discussion_index_status — change the Status cell of an existing row.
// Discussions table: | Date | ID | Status | Outcome | Tags | Summary |
// Status is the 3rd column.
// ---------------------------------------------------------------------------

function applyFixDiscussionIndexStatus(
  fix: PendingFix,
  projectMemoryDir: string,
): AppliedFix | FailedFix {
  const discussionId = fix.discussionId;
  const correctStatus = fix.correctStatus;
  if (!discussionId || !correctStatus) {
    return { fix_type: "fix_discussion_index_status", reason: "schema_mismatch", details: "missing discussionId/correctStatus" };
  }
  validateMemoryId(discussionId, "discussionId");
  const indexPath = path.join(projectMemoryDir, "discussions", "index.md");
  if (!fileExists(indexPath)) {
    return { fix_type: "fix_discussion_index_status", reason: "file_not_found", details: indexPath };
  }
  const content = readFile(indexPath);
  // Row pattern: | Date | ID | Status | Outcome | Tags | Summary |
  // Status is the 3rd column (after Date and ID)
  const rowRe = new RegExp(`^(\\|\\s*\\d{4}-\\d{2}-\\d{2}\\s*\\|\\s*${discussionId}\\s*\\|\\s*)([\\w-]+)(\\s*\\|)`, "m");
  const m = content.match(rowRe);
  if (!m) {
    return { fix_type: "fix_discussion_index_status", reason: "ambiguous_target", details: `row for ${discussionId} not found` };
  }
  if (m[2] === correctStatus) {
    return {
      fix_type: "fix_discussion_index_status",
      target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
      summary: `Status for ${discussionId} already ${correctStatus} (no-op)`,
    };
  }
  const updated = content.replace(rowRe, `$1${correctStatus}$3`);
  fs.writeFileSync(indexPath, updated, "utf-8");
  return {
    fix_type: "fix_discussion_index_status",
    target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
    summary: `Fixed ${discussionId} status: ${m[2]} → ${correctStatus}`,
  };
}

// ---------------------------------------------------------------------------
// ADR_STATUS_MAP — canonical mapping from decision/phase status → ADR status string.
// Unknown statuses fall back to title-case (first char upper, rest lower).
// ---------------------------------------------------------------------------

const ADR_STATUS_MAP: Record<string, string> = {
  active: "Accepted",
  accepted: "Accepted",
  superseded: "Superseded",
  deprecated: "Deprecated",
  rejected: "Rejected",
  proposed: "Proposed",
  draft: "Draft",
};

// ---------------------------------------------------------------------------
// create_adr_file — write ADR stub with header + Status + section placeholders.
// Body sections are TODO for LLM (prose extraction from DECISION sections).
// Returns PartialFix.
// ---------------------------------------------------------------------------

function applyCreateAdrFile(
  fix: PendingFix,
  projectMemoryDir: string,
): PartialFix | FailedFix {
  const decisionId = fix.decisionId;
  const adrId = fix.adrId;
  if (!decisionId || !adrId) {
    return { fix_type: "create_adr_file", reason: "schema_mismatch", details: "missing decisionId/adrId" };
  }
  validateMemoryId(decisionId, "decisionId");
  const adrDir = readConfigField(projectMemoryDir, "adr_dir");
  if (!adrDir) {
    return { fix_type: "create_adr_file", reason: "schema_mismatch", details: "adr_dir not configured" };
  }
  const projectRoot = path.dirname(projectMemoryDir);
  const adrDirAbs = path.join(projectRoot, adrDir);
  if (!fs.existsSync(adrDirAbs)) fs.mkdirSync(adrDirAbs, { recursive: true });

  // Derive slug from decisionId (strip DECISION-YYYY-MM-DD- prefix)
  const slug = decisionId.replace(/^DECISION-\d{4}-\d{2}-\d{2}-/, "");
  const filename = `${adrId}-${slug}.md`;
  const adrPath = path.join(adrDirAbs, filename);

  // Pull title + date + status from DECISION file
  const decisionPath = path.join(projectMemoryDir, "decisions", `${decisionId}.md`);
  const decisionContent = readFile(decisionPath);
  const fm = parseFrontmatter(decisionContent);
  const titleMatch = decisionContent.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : decisionId;
  const dateMatch = decisionId.match(/^DECISION-(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
  const statusRaw = fm["status"] || "active";
  const status = ADR_STATUS_MAP[statusRaw.toLowerCase()] ?? (statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1).toLowerCase());

  if (fileExists(adrPath)) {
    return {
      fix_type: "create_adr_file",
      target_file: path.relative(projectRoot, adrPath),
      llm_must_do: `ADR file already exists at ${path.relative(projectRoot, adrPath)}. Verify body sections match the DECISION.`,
      context: { decisionId, adrId, already_present: true },
    };
  }

  const stub = `# ${title}

Date: ${date}
Status: ${status}

## Context and Problem Statement

<!-- TODO: fill from DECISION ${decisionId} # Context section -->

## Considered Options

<!-- TODO: enumerate from DECISION # Alternatives Considered section -->

## Decision Outcome

<!-- TODO: fill from DECISION # Decision + # Chosen Solution sections -->

### Positive Consequences

<!-- TODO: fill from DECISION # Consequences (positive) -->

### Negative Consequences

<!-- TODO: fill from DECISION # Consequences (negative) -->

## Pros and Cons of the Options

<!-- TODO: fill from DECISION # Alternatives Considered subsections -->
`;
  fs.writeFileSync(adrPath, stub, "utf-8");

  return {
    fix_type: "create_adr_file",
    target_file: path.relative(projectRoot, adrPath),
    llm_must_do: `Stub ADR created at ${path.relative(projectRoot, adrPath)}. Replace each <!-- TODO --> block by extracting the corresponding section body from .project-memory/decisions/${decisionId}.md.`,
    context: { decisionId, adrId, adr_path: path.relative(projectRoot, adrPath) },
  };
}

// removed: create_phase_stub in 2026-07-06 phase-removal — the entire applyCreatePhaseStub function and PHASE_STUBS constant are deleted

// ---------------------------------------------------------------------------
// fix_decision_supersession_status — flip status to superseded, set superseded_by,
// move row from Active table to Superseded table in decisions/index.md.
// idempotent.
// ---------------------------------------------------------------------------

function applyFixDecisionSupersessionStatus(
  fix: PendingFix,
  projectMemoryDir: string,
): AppliedFix | PartialFix | FailedFix {
  const decisionId = fix.decisionId;
  const supersededBy = fix.supersededBy;
  if (!decisionId || !supersededBy) {
    return { fix_type: "fix_decision_supersession_status", reason: "schema_mismatch", details: "missing decisionId/supersededBy" };
  }
  validateMemoryId(decisionId, "decisionId");

  // 1. Read the decision file and set status + superseded_by
  const decisionsDir = path.join(projectMemoryDir, "decisions");
  const decisionPath = path.join(decisionsDir, `${decisionId}.md`);
  if (!fileExists(decisionPath)) {
    return { fix_type: "fix_decision_supersession_status", reason: "file_not_found", details: decisionPath };
  }

  let content = readFile(decisionPath);
  content = setFrontmatterField(content, "status", "superseded");
  content = setFrontmatterField(content, "superseded_by", supersededBy);
  fs.writeFileSync(decisionPath, content, "utf-8");

  // 2. Move the row in decisions/index.md from Active table to Superseded table
  const indexPath = path.join(decisionsDir, "index.md");
  if (!fileExists(indexPath)) {
    return { fix_type: "fix_decision_supersession_status", target_file: path.relative(path.dirname(projectMemoryDir), decisionPath), summary: `Set ${decisionId} status=superseded; index.md not found, skipped index move` };
  }

  const indexContent = readFile(indexPath);
  const lines = indexContent.split("\n");

  // Find the ## Superseded section boundary
  let supersededSectionIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith("## Superseded")) {
      supersededSectionIdx = i;
      break;
    }
  }

  // Split into Active section (before ## Superseded) and Superseded section (from ## Superseded onward)
  // Also capture any sections after ## Superseded (e.g. ## Rejected) as tailLines
  let activeLines: string[];
  let supersededLines: string[];
  let tailLines: string[];
  if (supersededSectionIdx >= 0) {
    activeLines = lines.slice(0, supersededSectionIdx);
    // Find the next ## header after ## Superseded to bound the section
    let nextHeaderIdx = -1;
    for (let i = supersededSectionIdx + 1; i < lines.length; i++) {
      if (lines[i].trim().startsWith("## ")) {
        nextHeaderIdx = i;
        break;
      }
    }
    if (nextHeaderIdx >= 0) {
      supersededLines = lines.slice(supersededSectionIdx, nextHeaderIdx);
      tailLines = lines.slice(nextHeaderIdx);
    } else {
      supersededLines = lines.slice(supersededSectionIdx);
      tailLines = [];
    }
  } else {
    // No ## Superseded section — all lines are Active
    activeLines = lines;
    supersededLines = [];
    tailLines = [];
  }

  // Find the row in Active table
  let rowContent = "";
  let rowIdx = -1;
  for (let i = 0; i < activeLines.length; i++) {
    const cells = activeLines[i].split("|").map(c => c.trim());
    if (cells[2] === decisionId) {
      rowIdx = i;
      rowContent = activeLines[i];
      break;
    }
  }

  if (rowIdx < 0) {
    // Row not found in Active table — frontmatter fix already applied; return partial so loop doesn't spin
    return {
      fix_type: "fix_decision_supersession_status",
      target_file: path.relative(path.dirname(projectMemoryDir), decisionPath),
      llm_must_do: `Set ${decisionId} status=superseded; row not found in Active table (may already be in Superseded table); index will be reconciled by Cat 6 next run.`,
      context: { decisionId, reason: "row_not_in_active_table" },
    };
  }

  // Parse the row to construct a Superseded-table row
  // Active table: | Date | ID | Scope | Status | Global | Touches | Claim |
  // Superseded table: | Date | ID | Scope | Status | Global | Touches | Claim | Superseded By |
  const cells = rowContent.split("|").map(c => c.trim());
  // cells[0] is empty (before first |), cells[1]=Date, cells[2]=ID, cells[3]=Scope, cells[4]=Status, cells[5]=Global, cells[6]=Touches, cells[7]=Claim
  const date = cells[1] || "";
  const scope = cells[3] || "unknown";
  const global = cells[5] || "-";
  const touches = cells[6] || "";
  const claim = cells[7] || "";

  const newRow = `| ${date} | ${decisionId} | ${scope} | superseded | ${global} | ${touches} | ${claim} | ${supersededBy} |`;

  // Remove the row from Active table
  activeLines.splice(rowIdx, 1);

  // Append to Superseded table (after header + separator rows, before trailing blank lines)
  if (supersededLines.length === 0) {
    // Create the Superseded section
    supersededLines = [
      "## Superseded",
      "",
      "| Date | ID | Scope | Status | Global | Touches | Claim | Superseded By |",
      "|---|---|---|---|---|---|---|---|",
      newRow,
    ];
  } else {
    // Find insertion point: after the last row that starts with | (past header + separator + existing rows)
    let insertIdx = supersededLines.length;
    // Walk backwards to find last data row (line starting with |)
    for (let i = supersededLines.length - 1; i >= 0; i--) {
      if (supersededLines[i].trim().startsWith("|")) {
        insertIdx = i + 1;
        break;
      }
    }
    // Also skip past any empty lines after the last data row
    for (let i = insertIdx; i < supersededLines.length; i++) {
      if (supersededLines[i].trim() === "") {
        insertIdx = i + 1;
      } else {
        break;
      }
    }
    supersededLines.splice(insertIdx, 0, newRow);
  }

  const newIndexContent = [...activeLines, ...supersededLines, ...tailLines].join("\n");
  fs.writeFileSync(indexPath, newIndexContent, "utf-8");

  return {
    fix_type: "fix_decision_supersession_status",
    target_file: path.relative(path.dirname(projectMemoryDir), indexPath),
    summary: `Fixed ${decisionId}: status→superseded, moved to Superseded table (superseded_by: ${supersededBy})`,
  };
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function applyAuditFixes(
  projectMemoryDir: string,
  pendingFixes: PendingFix[],
): Promise<ApplyResult> {
  const applied: AppliedFix[] = [];
  const partial: PartialFix[] = [];
  const failed: FailedFix[] = [];

  for (const fix of pendingFixes) {
    let result: AppliedFix | PartialFix | FailedFix;
    switch (fix.type) {
      case "assign_commit":
        result = applyAssignCommit(fix, projectMemoryDir);
        break;
      case "add_decision_index_row":
        result = applyAddDecisionIndexRow(fix, projectMemoryDir);
        break;
      case "fix_decision_index_status":
        result = applyFixDecisionIndexStatus(fix, projectMemoryDir);
        break;
      case "add_discussion_index_row":
        result = applyAddDiscussionIndexRow(fix, projectMemoryDir);
        break;
      case "fix_discussion_index_status":
        result = applyFixDiscussionIndexStatus(fix, projectMemoryDir);
        break;
      case "assign_adr_id":
        result = applyAssignAdrId(fix, projectMemoryDir);
        break;
      case "create_adr_file":
        result = applyCreateAdrFile(fix, projectMemoryDir);
        break;
      case "fix_decision_supersession_status":
        result = applyFixDecisionSupersessionStatus(fix, projectMemoryDir);
        break;
      default: {
        const exhaust: never = fix.type;
        result = { fix_type: exhaust as PendingFix["type"], reason: "unknown_type", details: `no handler for ${String(exhaust)}` };
      }
    }

    if ("reason" in result) failed.push(result as FailedFix);
    else if ("llm_must_do" in result) partial.push(result as PartialFix);
    else applied.push(result as AppliedFix);
  }

  // Recommend re-audit if any write happened that changes cross-file state.
  const rerunTypes: PendingFix["type"][] = ["assign_commit", "add_decision_index_row", "fix_decision_index_status", "assign_adr_id", "add_discussion_index_row", "fix_decision_supersession_status"];
  const rerun_audit_recommended = applied.some(a => rerunTypes.includes(a.fix_type))
    || partial.some(p => rerunTypes.includes(p.fix_type));

  return { applied, partial, failed, rerun_audit_recommended };
}
