import * as path from "path";
import * as fs from "fs";
import { rebuildIndex } from "./rebuild_index";

export interface BackgroundRebuildState {
  status: "running" | "done";
  result?: { indexed: number; failed: number; skipped?: number };
  startedAt: number;
  /** Set when the pipeline finishes (success or catch). Used for recently-done skip. */
  completedAt?: number;
}

const inflight = new Map<string, BackgroundRebuildState>();
const locks = new Map<string, Promise<unknown>>();

// Test-only: count of pipeline starts; reset via clearBackgroundRebuildState.
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
async function withRebuildLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
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
 * Start a fire-and-forget background rebuild for the given .project-memory/
 * directory. The pipeline runs `rebuildIndex` in `mode: "fs"` mode.
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
 * `startBackgroundRebuild` returns `{ status: "done" }` without starting
 * a fresh run (avoids redundant churn).
 *
 * **Gap 3 – background vs. manual serialization:** The pipeline body runs
 * inside a per-dir async mutex (`withRebuildLock`). Manual rebuild calls
 * that chain on the same mutex are serialized.
 */
export async function startBackgroundRebuild(
  projectMemoryDir: string,
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

  const pipelineFn = async (): Promise<{ indexed: number; failed: number; skipped?: number }> => {
    __pipelineStartCount++;
    return rebuildIndex({ mode: "fs", projectMemoryDir });
  };

  // Acquire the per-dir lock via the shared helper so any concurrent manual
  // rebuild call chains *after* this pipeline.
  const run = withRebuildLock(projectMemoryDir, pipelineFn);

  // Fire-and-forget: update inflight state on completion.
  void run
    .then((result) => {
      inflight.set(key, {
        status: "done",
        result,
        startedAt,
        completedAt: Date.now(),
      });
    })
    .catch((err) => {
      console.error("[background_rebuild] pipeline failed:", err);
      inflight.set(key, {
        status: "done",
        startedAt,
        completedAt: Date.now(),
      });
    });

  return { status: "running" };
}

/**
 * Return the current rebuild state for a directory. Dir is normalized before
 * lookup. Used by integration tests.
 */
export function getBackgroundRebuildState(
  projectMemoryDir: string,
): BackgroundRebuildState | undefined {
  return inflight.get(normalizeDir(projectMemoryDir));
}

/**
 * Clear all in-flight state, locks, and the pipeline-start counter.
 * Used by integration tests (beforeEach/afterEach).
 */
export function clearBackgroundRebuildState(): void {
  inflight.clear();
  locks.clear();
  __pipelineStartCount = 0;
}

/** Run a rebuild behind the per-dir lock. */
export async function rebuildIndexLocked(
  projectMemoryDir: string,
): Promise<{ indexed: number; failed: number; skipped?: number }> {
  return withRebuildLock(projectMemoryDir, () => rebuildIndex({ mode: "fs", projectMemoryDir }));
}
