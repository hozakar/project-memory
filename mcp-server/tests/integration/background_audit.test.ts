import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { join } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { runAudit } from "../../src/tools/run_audit";
import {
  startBackgroundAudit,
  getBackgroundAuditState,
  clearBackgroundAuditState,
} from "../../src/tools/background_audit";

let tmp: TmpDir;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDone(pmDir: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = getBackgroundAuditState(pmDir);
    if (state && state.status === "done") return;
    await sleep(50);
  }
  // If we reach here, timeout — throw clearly
  const state = getBackgroundAuditState(pmDir);
  throw new Error(
    `Background audit did not complete within ${timeoutMs}ms. State: ${JSON.stringify(state)}`,
  );
}

describe("background_audit", () => {
  beforeAll(() => {
    tmp = createTmpDir();
    // Create minimal .project-memory/ structure for the base tests
    fs.writeFileSync(join(tmp.pmDir, "config.yml"), "adr_enabled: false\naudit_ignore: []\n");
    const phasesDir = join(tmp.pmDir, "phases");
    fs.mkdirSync(phasesDir, { recursive: true });
    fs.writeFileSync(join(phasesDir, "index.yml"), "phases: []\n");
  });

  afterAll(() => {
    try { tmp.cleanup(); } catch { /* ignore cleanup errors on Windows */ }
  });

  beforeEach(() => {
    clearBackgroundAuditState();
  });

  afterEach(() => {
    clearBackgroundAuditState();
  });

  it("returns { status: 'running' } immediately (non-blocking)", async () => {
    const result = await startBackgroundAudit(tmp.pmDir, "standard");
    expect(result).toEqual({ status: "running" });
    // Should NOT be blocked — result is synchronous
    const state = getBackgroundAuditState(tmp.pmDir);
    expect(state).toBeDefined();
    expect(state!.status).toBe("running");
    // Wait for the pipeline to finish
    await waitForDone(tmp.pmDir);
    const doneState = getBackgroundAuditState(tmp.pmDir);
    expect(doneState!.status).toBe("done");
    expect(doneState!.result).toBeDefined();
  });

  it("chained pipeline applies pending_fixes (missing decision index row)", async () => {
    // Create decisions dir with a DECISION file but no index.md row
    const decisionsDir = join(tmp.pmDir, "decisions");
    fs.mkdirSync(decisionsDir, { recursive: true });

    fs.writeFileSync(join(decisionsDir, "DECISION-2026-07-08-background-test.md"), [
      "---",
      "id: DECISION-2026-07-08-background-test",
      "title: Background Audit Test Decision",
      "status: active",
      "touches: conventions_md",
      "primary_scope: workflow",
      "---",
      "# Background Audit Test",
      "",
      "Test decision for background audit.",
    ].join("\n"));

    // Create index.md WITHOUT the row for our decision
    fs.writeFileSync(join(decisionsDir, "index.md"), [
      "| Date | ID | Scope | Status | Global | Touches | Claim |",
      "|---|---|---|---|---|---|---|",
    ].join("\n"));

    // Start background audit
    await startBackgroundAudit(tmp.pmDir, "standard");
    await waitForDone(tmp.pmDir);

    const state = getBackgroundAuditState(tmp.pmDir);
    expect(state).toBeDefined();
    expect(state!.status).toBe("done");

    // The index.md should now contain the row
    const indexContent = fs.readFileSync(join(decisionsDir, "index.md"), "utf-8");
    expect(indexContent).toContain("DECISION-2026-07-08-background-test");

    // pending_fixes should be empty (the row was added, so the re-detect found nothing)
    expect(state!.result).toBeDefined();
    expect(state!.result!.pending_fixes).toHaveLength(0);

    // Cleanup
    try {
      fs.rmSync(join(decisionsDir, "DECISION-2026-07-08-background-test.md"));
      fs.rmSync(join(decisionsDir, "index.md"));
    } catch {}
  });

  it("dedup: calling startBackgroundAudit twice rapidly produces one run", async () => {
    // First call
    const r1 = await startBackgroundAudit(tmp.pmDir, "standard");
    expect(r1).toEqual({ status: "running" });

    // Second call immediately — should not start a second run
    const r2 = await startBackgroundAudit(tmp.pmDir, "standard");
    expect(r2).toEqual({ status: "running" });

    // Wait for completion
    await waitForDone(tmp.pmDir);

    // After completion, state should be "done" once
    const state = getBackgroundAuditState(tmp.pmDir);
    expect(state).toBeDefined();
    expect(state!.status).toBe("done");

    // Calling again after completion starts a fresh run
    clearBackgroundAuditState();
    const r3 = await startBackgroundAudit(tmp.pmDir, "standard");
    expect(r3).toEqual({ status: "running" });
    await waitForDone(tmp.pmDir);
    const state3 = getBackgroundAuditState(tmp.pmDir);
    expect(state3!.status).toBe("done");
  });

  it("manual mode (background:false/omitted) still returns synchronous full result unchanged", async () => {
    // Ensure clean state
    const decisionsDir = join(tmp.pmDir, "decisions");
    fs.mkdirSync(decisionsDir, { recursive: true });
    // index.md with table header + no data rows
    fs.writeFileSync(join(decisionsDir, "index.md"), [
      "| Date | ID | Scope | Status | Global | Touches | Claim |",
      "|---|---|---|---|---|---|---|",
    ].join("\n"));

    const result = await runAudit(tmp.pmDir, "standard");
    // Synchronous result must be a full AuditReport (not {status: 'running'})
    expect(result).toHaveProperty("auto_fixed");
    expect(result).toHaveProperty("pending_fixes");
    expect(Array.isArray(result.auto_fixed)).toBe(true);
    expect(Array.isArray(result.pending_fixes)).toBe(true);
    // Must not have 'status' property
    expect(result).not.toHaveProperty("status");

    try { fs.rmSync(join(decisionsDir, "index.md")); } catch {}
  });

  it("minimal profile completes with empty result", async () => {
    const result = await startBackgroundAudit(tmp.pmDir, "minimal");
    expect(result).toEqual({ status: "running" });

    await waitForDone(tmp.pmDir);

    const state = getBackgroundAuditState(tmp.pmDir);
    expect(state).toBeDefined();
    expect(state!.status).toBe("done");
    expect(state!.result).toBeDefined();
    // Minimal profile returns empty report
    expect(state!.result!.auto_fixed).toHaveLength(0);
    expect(state!.result!.pending_fixes).toHaveLength(0);
  });
});
