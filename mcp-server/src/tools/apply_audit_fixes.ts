import * as fs from "fs";
import * as path from "path";
import type {
  PendingFix,
  ApplyResult,
  AppliedFix,
  PartialFix,
  FailedFix,
} from "../types";
import { parseFrontmatter } from "./run_audit";

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

function validateMemoryId(id: string, label: string): void {
  const normalized = path.normalize(id);
  if (
    normalized.includes("..") ||
    path.isAbsolute(normalized) ||
    normalized.includes("/") ||
    normalized.includes("\\")
  ) {
    throw new Error(
      `Invalid ${label}: "${id}" — must be a plain slug with no path separators or traversal sequences.`
    );
  }
}

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
// annotate_orphan — replace bare hash with "<hash> [orphaned YYYY-MM-DD]"
// in phases/index.yml AND phases/<phase_id>/phase.yml. Idempotent.
// ---------------------------------------------------------------------------

function applyAnnotateOrphan(
  fix: PendingFix,
  projectMemoryDir: string,
): AppliedFix | FailedFix {
  const phaseId = fix.phase_id;
  const hash = fix.hash;
  const date = fix.date;
  if (!phaseId || !hash || !date) {
    return { fix_type: "annotate_orphan", reason: "schema_mismatch", details: "missing phase_id/hash/date" };
  }

  validateMemoryId(phaseId, "phaseId");
  const indexPath = path.join(projectMemoryDir, "phases", "index.yml");
  const phasePath = path.join(projectMemoryDir, "phases", phaseId, "phase.yml");
  if (!fileExists(indexPath) || !fileExists(phasePath)) {
    return { fix_type: "annotate_orphan", reason: "file_not_found", details: `${indexPath} or ${phasePath}` };
  }

  const annotated = `${hash} [orphaned ${date}]`;
  // Hex boundary lookahead: the next char must NOT be a hex digit (so a 7-char
  // abbrev does not match the prefix of a stored 40-char hash and corrupt it).
  // The annotated form ends with `]` so `(?![0-9a-f])` also blocks re-matching
  // an already-annotated hash on a second run.
  const re = new RegExp(`(- )${hash}(?![0-9a-f])(?! \\[)`, "g");
  let mutations = 0;

  for (const target of [indexPath, phasePath]) {
    const before = readFile(target);
    const after = before.replace(re, `$1${annotated}`);
    if (after !== before) {
      fs.writeFileSync(target, after, "utf-8");
      mutations++;
    }
    // Also handle merge_commit: scalar form
    if (fix.location === "merge_commit") {
      const before2 = readFile(target);
      const mcRe = new RegExp(`(merge_commit:\\s+)${hash}(?![0-9a-f])(?! \\[)`, "g");
      const after2 = before2.replace(mcRe, `$1${annotated}`);
      if (after2 !== before2) {
        fs.writeFileSync(target, after2, "utf-8");
        mutations++;
      }
    }
  }

  return {
    fix_type: "annotate_orphan",
    target_file: path.relative(path.dirname(projectMemoryDir), phasePath),
    summary: mutations > 0
      ? `Annotated orphan hash ${hash} in ${phaseId}`
      : `Hash ${hash} already annotated in ${phaseId} (no-op)`,
  };
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
  const agRaw: unknown = fm["applies_globally"];
  const appliesToAll =
    agRaw === true ||
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
  const status = statusRaw === "active" ? "Accepted" : statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);

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

// ---------------------------------------------------------------------------
// create_phase_stub — create the missing required file for a completed phase
// with section headers only. LLM fills the prose.
// ---------------------------------------------------------------------------

const PHASE_STUBS: Record<string, string> = {
  "plan.md":
    `# Goal\n\n<!-- TODO -->\n\n# Context\n\n<!-- TODO -->\n\n# Planned Changes\n\n<!-- TODO -->\n\n# Success Criteria\n\n<!-- TODO -->\n`,
  "implementation.md":
    `# Summary\n\n<!-- TODO -->\n\n# Related Commits\n\n<!-- TODO -->\n\n# Architectural Impact\n\n<!-- TODO -->\n\n# Deviations From Plan\n\n<!-- TODO -->\n\n# Notes\n\n<!-- TODO -->\n\n# Lessons Learned\n\n<!-- TODO -->\n`,
  "review-and-fixes.md":
    `# Review & Fix Log\n\n## Round 1\n### Findings\n\n<!-- TODO -->\n\n### Actions Taken\n\n<!-- TODO -->\n`,
  "followup.md":
    `# Remaining Open Issues\n\n<!-- TODO -->\n\n# Technical Debt Introduced\n\n<!-- TODO -->\n\n# Recommended Next Phases\n\n<!-- TODO -->\n`,
};

function applyCreatePhaseStub(
  fix: PendingFix,
  projectMemoryDir: string,
): PartialFix | FailedFix {
  const phaseId = fix.phaseId;
  const missingFile = fix.missingFile;
  if (!phaseId || !missingFile) {
    return { fix_type: "create_phase_stub", reason: "schema_mismatch", details: "missing phaseId/missingFile" };
  }
  if (!(missingFile in PHASE_STUBS)) {
    return { fix_type: "create_phase_stub", reason: "schema_mismatch", details: `no stub template for ${missingFile}` };
  }
  validateMemoryId(phaseId, "phaseId");
  const phaseDir = path.join(projectMemoryDir, "phases", phaseId);
  if (!fs.existsSync(phaseDir)) {
    return { fix_type: "create_phase_stub", reason: "file_not_found", details: phaseDir };
  }
  const targetPath = path.join(phaseDir, missingFile);
  if (fileExists(targetPath)) {
    return {
      fix_type: "create_phase_stub",
      target_file: path.relative(path.dirname(projectMemoryDir), targetPath),
      llm_must_do: `${missingFile} already exists in ${phaseId}. Verify content.`,
      context: { phaseId, missingFile, already_present: true },
    };
  }
  fs.writeFileSync(targetPath, PHASE_STUBS[missingFile], "utf-8");
  return {
    fix_type: "create_phase_stub",
    target_file: path.relative(path.dirname(projectMemoryDir), targetPath),
    llm_must_do: `Stub created at phases/${phaseId}/${missingFile}. Replace each <!-- TODO --> with content from session memory or git history.`,
    context: { phaseId, missingFile },
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
      case "annotate_orphan":
        result = applyAnnotateOrphan(fix, projectMemoryDir);
        break;
      case "assign_commit":
        result = applyAssignCommit(fix, projectMemoryDir);
        break;
      case "add_decision_index_row":
        result = applyAddDecisionIndexRow(fix, projectMemoryDir);
        break;
      case "fix_decision_index_status":
        result = applyFixDecisionIndexStatus(fix, projectMemoryDir);
        break;
      case "assign_adr_id":
        result = applyAssignAdrId(fix, projectMemoryDir);
        break;
      case "create_adr_file":
        result = applyCreateAdrFile(fix, projectMemoryDir);
        break;
      case "create_phase_stub":
        result = applyCreatePhaseStub(fix, projectMemoryDir);
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
  const rerunTypes: PendingFix["type"][] = ["assign_commit", "add_decision_index_row", "fix_decision_index_status", "assign_adr_id"];
  const rerun_audit_recommended = applied.some(a => rerunTypes.includes(a.fix_type))
    || partial.some(p => rerunTypes.includes(p.fix_type));

  return { applied, partial, failed, rerun_audit_recommended };
}
