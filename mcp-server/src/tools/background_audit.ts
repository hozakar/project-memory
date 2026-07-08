import { runAudit, type Profile } from "./run_audit";
import { applyAuditFixes } from "./apply_audit_fixes";
import type { AuditReport } from "../types";

export interface BackgroundAuditState {
  status: "running" | "done";
  result?: AuditReport;
  startedAt: number;
}

const inflight = new Map<string, BackgroundAuditState>();

/**
 * Start a silent background audit pipeline for the given .project-memory/
 * directory. The pipeline runs `runAudit` then loops (max 5 iterations) applying
 * any pending_fixes via `applyAuditFixes` and re-running until clean or until
 * fixes fail/partially succeed.
 *
 * Returns synchronously with `{ status: "running" }`. The caller must NOT await
 * the returned promise — the pipeline is fire-and-forget.
 *
 * Dedup: if a run is already in-flight for the same dir, a second call is a
 * no-op (also returns `{ status: "running" }`). Once a run completes, a new
 * call starts a fresh run.
 */
export async function startBackgroundAudit(
  projectMemoryDir: string,
  profile: Profile = "standard",
): Promise<{ status: "running" }> {
  const existing = inflight.get(projectMemoryDir);
  if (existing && existing.status === "running") {
    return { status: "running" };
  }

  const startedAt = Date.now();
  inflight.set(projectMemoryDir, { status: "running", startedAt });

  // Fire-and-forget pipeline — not awaited.
  (async () => {
    try {
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

      inflight.set(projectMemoryDir, {
        status: "done",
        result: report,
        startedAt,
      });
    } catch (err) {
      console.error("[background_audit] failed:", err);
      inflight.set(projectMemoryDir, {
        status: "done",
        startedAt,
      });
    }
  })();

  return { status: "running" };
}

/**
 * Return the current audit state for a directory. Used by integration tests.
 */
export function getBackgroundAuditState(
  projectMemoryDir: string,
): BackgroundAuditState | undefined {
  return inflight.get(projectMemoryDir);
}

/**
 * Clear all in-flight state. Used by integration tests (beforeEach/afterEach).
 */
export function clearBackgroundAuditState(): void {
  inflight.clear();
}
