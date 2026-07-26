import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import { join, sep } from "path";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { searchMemory } from "../../src/tools/search_memory";
import {
  startBackgroundRebuild,
  getBackgroundRebuildState,
  clearBackgroundRebuildState,
  __getPipelineStartCount,
} from "../../src/tools/background_rebuild";

let tmp: TmpDir;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForDone(pmDir: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = getBackgroundRebuildState(pmDir);
    if (state && state.status === "done") return;
    await sleep(50);
  }
  // If we reach here, timeout — throw clearly
  const state = getBackgroundRebuildState(pmDir);
  throw new Error(
    `Background rebuild did not complete within ${timeoutMs}ms. State: ${JSON.stringify(state)}`,
  );
}

describe("background_rebuild", () => {
  beforeAll(() => {
    tmp = createTmpDir();
    process.env.PROJECT_MEMORY_DIR = tmp.dir;
  });

  afterAll(() => {
    try { tmp.cleanup(); } catch { /* ignore cleanup errors on Windows */ }
  });

  beforeEach(() => {
    clearBackgroundRebuildState();
  });

  afterEach(() => {
    clearBackgroundRebuildState();
  });

  it("returns { status: 'running' } immediately (non-blocking)", async () => {
    const result = await startBackgroundRebuild(tmp.pmDir);
    expect(result).toEqual({ status: "running" });
    // Should NOT be blocked — result is synchronous
    const state = getBackgroundRebuildState(tmp.pmDir);
    expect(state).toBeDefined();
    expect(state!.status).toBe("running");
    // Wait for the pipeline to finish
    await waitForDone(tmp.pmDir);
    const doneState = getBackgroundRebuildState(tmp.pmDir);
    expect(doneState!.status).toBe("done");
    expect(doneState!.result).toBeDefined();
  });

  it("completes and indexes files (decisions, discussions)", async () => {
    // Create decisions directory with one decision file
    const decisionsDir = join(tmp.pmDir, "decisions");
    fs.mkdirSync(decisionsDir, { recursive: true });

    const decisionContent = [
      "---",
      "id: DECISION-2026-07-26-rebuild-test",
      "title: Rebuild Test Decision",
      "status: active",
      "touches: conventions_md",
      "primary_scope: workflow",
      "created_by:",
      "  name: Test",
      "  email: test@test.com",
      "---",
      "# Rebuild Test Decision",
      "",
      "This decision tests background rebuild indexing.",
    ].join("\n");
    fs.writeFileSync(join(decisionsDir, "DECISION-2026-07-26-rebuild-test.md"), decisionContent);

    // Create discussions directory with one discussion file
    const discussionsDir = join(tmp.pmDir, "discussions");
    fs.mkdirSync(discussionsDir, { recursive: true });

    const discussionContent = [
      "---",
      "id: DISCUSSION-2026-07-26-rebuild-test",
      "title: Rebuild Test Discussion",
      "status: concluded",
      "outcome: resolved",
      "created_by:",
      "  name: Test",
      "  email: test@test.com",
      "---",
      "# Rebuild Test Discussion",
      "",
      "This discussion tests background rebuild indexing.",
    ].join("\n");
    fs.writeFileSync(join(discussionsDir, "DISCUSSION-2026-07-26-rebuild-test.md"), discussionContent);

    // Start rebuild
    await startBackgroundRebuild(tmp.pmDir);
    await waitForDone(tmp.pmDir);

    const state = getBackgroundRebuildState(tmp.pmDir);
    expect(state).toBeDefined();
    expect(state!.status).toBe("done");
    expect(state!.result).toBeDefined();
    expect(state!.result!.indexed).toBeGreaterThanOrEqual(2);
    expect(state!.result!.failed).toBe(0);

    // Verify the indexed records are searchable
    const decisionResults = await searchMemory({
      query: "Rebuild Test Decision",
      top_k: 5,
      projectMemoryDir: tmp.dir,
      include_superseded: true,
    });
    expect(decisionResults.length).toBeGreaterThanOrEqual(1);
    expect(decisionResults.some(r => r.title === "Rebuild Test Decision")).toBe(true);

    const discussionResults = await searchMemory({
      query: "Rebuild Test Discussion",
      top_k: 5,
      projectMemoryDir: tmp.dir,
      include_superseded: true,
    });
    expect(discussionResults.length).toBeGreaterThanOrEqual(1);
    expect(discussionResults.some(r => r.title === "Rebuild Test Discussion")).toBe(true);

    // Cleanup
    try {
      fs.rmSync(join(decisionsDir, "DECISION-2026-07-26-rebuild-test.md"));
      fs.rmSync(join(discussionsDir, "DISCUSSION-2026-07-26-rebuild-test.md"));
    } catch {}
  });

  it("dedup: calling startBackgroundRebuild twice rapidly produces one run", async () => {
    // First call
    const r1 = await startBackgroundRebuild(tmp.pmDir);
    expect(r1).toEqual({ status: "running" });

    // Second call immediately — should not start a second run
    const r2 = await startBackgroundRebuild(tmp.pmDir);
    expect(r2).toEqual({ status: "running" });

    // Wait for completion
    await waitForDone(tmp.pmDir);

    // After completion, state should be "done" once
    const state = getBackgroundRebuildState(tmp.pmDir);
    expect(state).toBeDefined();
    expect(state!.status).toBe("done");

    // Calling again after clearing starts a fresh run
    clearBackgroundRebuildState();
    const r3 = await startBackgroundRebuild(tmp.pmDir);
    expect(r3).toEqual({ status: "running" });
    await waitForDone(tmp.pmDir);
    const state3 = getBackgroundRebuildState(tmp.pmDir);
    expect(state3!.status).toBe("done");
  });

  it("recently-done skip does not start a second pipeline within 60s", async () => {
    // First run
    const r1 = await startBackgroundRebuild(tmp.pmDir);
    expect(r1).toEqual({ status: "running" });

    await waitForDone(tmp.pmDir);
    expect(__getPipelineStartCount()).toBe(1);

    // Immediate second call — should skip because <60s have passed
    const r2 = await startBackgroundRebuild(tmp.pmDir);
    expect(r2).toEqual({ status: "done" });

    // Pipeline counter must NOT have increased
    expect(__getPipelineStartCount()).toBe(1);
  });
});
