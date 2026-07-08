import * as path from "path";
import * as fs from "fs";
import { runAudit, type Profile } from "./run_audit";
import { applyAuditFixes } from "./apply_audit_fixes";
import type { AuditReport, ApplyResult, PendingFix } from "../types";

export interface BackgroundAuditState {
  status: "running" | "done";
  result?: AuditReport;
  startedAt: number;
  /** Set when the pipeline finishes (success or catch). Used for recently-done skip. */
  completedAt?: number;
}

const inflight = new Map<string, BackgroundAuditState>();
const locks = new Map<string, Promise<unknown>>();

// Test-only: count of pipeline starts; reset via clearBackgroundAuditState.
let __pipelineStartCount = 0;
export function __getPipelineStartCount(): number {
  return __pipelineStartCount;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a directory path for use as a Map key. Resolves relative paths
 * to absolute and follows symlinks when possible, so different strings
 * pointing to the same physical directory collapse to one key.
 */
function normalizeDir(dir: string): string {
  let k = path.resolve(dir);
  try {
    k = fs.realpathSync(k);
  } catch {
    // Directory may not exist yet — use resolved path as-is.
  }
  return k;
}

/**
 * Per-directory async mutex. Chains `fn` after any existing lock promise for
 * the normalized directory. The promise stored in the map never rejects, so
 * subsequent chained callers always proceed. The returned promise propagates
 * `fn`'s rejection so the caller can handle errors.
 */
async function withAuditLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const key = normalizeDir(dir);
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.then(() => fn());
  // Store a non-rejecting continuation so the chain never breaks.
  locks.set(
    key,
    run.then(
      () => {},
      () => {},
    ),
  );
  return run;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a silent background audit pipeline for the given .project-memory/
 * directory. The pipeline runs `runAudit` then loops (max 5 iterations)
 * applying any pending_fixes via `applyAuditFixes` and re-running until
 * clean or until fixes fail/partially succeed.
 *
 * ## Return values
 *
 * - `{ status: "running" }` — a new pipeline was started (or one was already
 *   in-flight). The caller should NOT await the pipeline; it is fire-and-forget.
 * - `{ status: "done" }` — a pipeline completed recently (<60 s ago) and no
 *   new run was started.
 *
 * ## Race-condition guards
 *
 * **Gap 1 – dir-key mismatch:** All Map lookups use `normalizeDir()` so
 * trailing slashes, symlinks, and different representations of the same
 * directory collapse to one key → the in-flight guard dedupes them.
 *
 * **Gap 2 – recently-done skip:** If a pipeline finished less than 60 s ago,
 * `startBackgroundAudit` returns `{ status: "done" }` without starting
 * a fresh run (avoids redundant churn).
 *
 * **Gap 3 – background vs. manual serialization:** The pipeline body runs
 * inside a per-dir async mutex (`withAuditLock`). Manual audit calls
 * (`runAuditLocked` / `applyAuditFixesLocked`) chain on the same mutex so
 * no two audit operations on the same directory overlap.
 */
export async function startBackgroundAudit(
  projectMemoryDir: string,
  profile: Profile = "standard",
): Promise<{ status: "running" | "done" }> {
  const key = normalizeDir(projectMemoryDir);
  const existing = inflight.get(key);

  if (existing) {
    if (existing.status === "running") {
      return { status: "running" };
    }
    // Recently-done skip (< 60 seconds)
    if (existing.completedAt !== undefined && Date.now() - existing.completedAt < 60_000) {
      return { status: "done" };
    }
  }

  // --- Start a new pipeline ---
  const startedAt = Date.now();
  inflight.set(key, { status: "running", startedAt });

  const pipelineFn = async (): Promise<AuditReport> => {
    __pipelineStartCount++;
    let report = await runAudit(projectMemoryDir, profile);
    const MAX_ITERATIONS = 5;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      if (report.pending_fixes.length === 0) break;

      const fixResult = await applyAuditFixes(projectMemoryDir, report.pending_fixes);

      // Re-detect after applying fixes
      report = await runAudit(projectMemoryDir, profile);

      // Break early if there are failures or partials that indicate unfixable state
      if (fixResult.failed.length > 0 || fixResult.partial.length > 0) break;
    }
    return report;
  };

  // Acquire the per-dir lock via the shared helper so any concurrent manual
  // audit call chains *after* this pipeline. (DRY: same mutex as runAuditLocked.)
  const run = withAuditLock(projectMemoryDir, pipelineFn);

  // Fire-and-forget: update inflight state on completion.
  void run
    .then((report) => {
      inflight.set(key, {
        status: "done",
        result: report,
        startedAt,
        completedAt: Date.now(),
      });
    })
    .catch((err) => {
      console.error("[background_audit] pipeline failed:", err);
      inflight.set(key, {
        status: "done",
        startedAt,
        completedAt: Date.now(),
      });
    });

  return { status: "running" };
}

/**
 * Return the current audit state for a directory. Dir is normalized before
 * lookup. Used by integration tests.
 */
export function getBackgroundAuditState(
  projectMemoryDir: string,
): BackgroundAuditState | undefined {
  return inflight.get(normalizeDir(projectMemoryDir));
}

/**
 * Clear all in-flight state, locks, and the pipeline-start counter.
 * Used by integration tests (beforeEach/afterEach).
 */
export function clearBackgroundAuditState(): void {
  inflight.clear();
  locks.clear();
  __pipelineStartCount = 0;
}

/** Run an audit behind the per-dir lock. */
export async function runAuditLocked(
  projectMemoryDir: string,
  profile: Profile = "standard",
): Promise<AuditReport> {
  return withAuditLock(projectMemoryDir, () => runAudit(projectMemoryDir, profile));
}

/** Apply audit fixes behind the per-dir lock. */
export async function applyAuditFixesLocked(
  projectMemoryDir: string,
  pendingFixes: PendingFix[],
): Promise<ApplyResult> {
  return withAuditLock(projectMemoryDir, () => applyAuditFixes(projectMemoryDir, pendingFixes));
}
