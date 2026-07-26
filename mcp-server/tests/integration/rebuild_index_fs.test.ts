import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { rebuildIndex } from "../../src/tools/rebuild_index";
import { searchMemory } from "../../src/tools/search_memory";
import * as fs from "fs";
import * as path from "path";

/**
 * Helper to clean and recreate subdirectories under .project-memory/ so each
 * test starts with a clean filesystem slate.
 */
function cleanSubdirs(pmDir: string): void {
  const subdirs = ["decisions", "discussions", "instructions", "assignments", "notes"];
  for (const subdir of subdirs) {
    const dirPath = path.join(pmDir, subdir);
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {
      // may not exist — that's fine
    }
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // LanceDB may hold file handles open on Windows; cleanup is best-effort
  }
});

// Clean filesystem subdirs before each test so file counts are deterministic
beforeEach(() => {
  cleanSubdirs(tmp.pmDir);
});

describe("rebuildIndex with mode:fs", () => {
  it(
    "indexes all decision files",
    { timeout: 60000 },
    async () => {
      const decisionsDir = path.join(tmp.pmDir, "decisions");
      fs.mkdirSync(decisionsDir, { recursive: true });

      // Write 2 valid decision files
      fs.writeFileSync(
        path.join(decisionsDir, "DECISION-test-fs-alpha.md"),
        [
          "---",
          "id: DECISION-test-fs-alpha",
          "title: FS Alpha Decision",
          "status: active",
          "primary_scope: constraint",
          "touches: [test, fs]",
          "created_by:",
          '  name: "Tester"',
          '  email: "tester@test.com"',
          "---",
          "",
          "# Context",
          "",
          "Alpha decision processed via filesystem rebuild mode.",
          "",
          "# Decision",
          "",
          "Always scan the decisions directory for markdown files.",
        ].join("\n"),
      );

      fs.writeFileSync(
        path.join(decisionsDir, "DECISION-test-fs-beta.md"),
        [
          "---",
          "id: DECISION-test-fs-beta",
          "title: FS Beta Decision",
          "status: active",
          "primary_scope: workflow",
          "touches: [test, workflow]",
          "created_by:",
          '  name: "Tester"',
          '  email: "tester@test.com"',
          "---",
          "",
          "# Context",
          "",
          "Beta decision relies on filesystem scanning for rebuild.",
          "",
          "# Decision",
          "",
          "Scan every subdirectory under dot project-memory directory.",
        ].join("\n"),
      );

      const result = await rebuildIndex({
        mode: "fs",
        projectMemoryDir: tmp.pmDir,
      });

      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(0);

      // Verify via searchMemory — MiniLM embeddings for short texts typically
      // achieve 0.2–0.4 similarity; use 0.2 as a safe lower bound.
      const results = await searchMemory("filesystem rebuild scanning decisions", 5);

      const alpha = results.find((r) => r.id === "DECISION-test-fs-alpha");
      expect(alpha).toBeDefined();
      expect(alpha!.similarity).toBeGreaterThan(0.2);

      const beta = results.find((r) => r.id === "DECISION-test-fs-beta");
      expect(beta).toBeDefined();
      expect(beta!.similarity).toBeGreaterThan(0.2);
    },
  );

  it(
    "indexes mixed file types",
    { timeout: 60000 },
    async () => {
      const decisionsDir = path.join(tmp.pmDir, "decisions");
      fs.mkdirSync(decisionsDir, { recursive: true });
      const discussionsDir = path.join(tmp.pmDir, "discussions");
      fs.mkdirSync(discussionsDir, { recursive: true });
      const instructionsDir = path.join(tmp.pmDir, "instructions");
      fs.mkdirSync(instructionsDir, { recursive: true });

      // 1 decision
      fs.writeFileSync(
        path.join(decisionsDir, "DECISION-test-fs-mixed-dec.md"),
        [
          "---",
          "id: DECISION-test-fs-mixed-dec",
          "title: Mixed Type Decision",
          "status: active",
          "primary_scope: constraint",
          "touches: [mixed]",
          "created_by:",
          '  name: "Tester"',
          '  email: "tester@test.com"',
          "---",
          "",
          "# Context",
          "",
          "A decision created in a mixed-type rebuild scenario.",
          "",
          "# Decision",
          "",
          "Support multiple record types in FS mode rebuild.",
        ].join("\n"),
      );

      // 1 discussion
      fs.writeFileSync(
        path.join(discussionsDir, "DISCUSSION-test-fs-mixed-disc.md"),
        [
          "---",
          "id: DISCUSSION-test-fs-mixed-disc",
          "title: Mixed Type Discussion",
          "status: concluded",
          "outcome:",
          "  type: none",
          "tags: [mixed, test]",
          "summary: A discussion about mixed-type rebuilds.",
          "created_by:",
          '  name: "Tester"',
          '  email: "tester@test.com"',
          "---",
          "",
          "# Context",
          "",
          "Discussion for the mixed-type FS rebuild test case.",
        ].join("\n"),
      );

      // 1 instruction
      fs.writeFileSync(
        path.join(instructionsDir, "INSTRUCTION-test-fs-mixed-inst.md"),
        [
          "---",
          "id: INSTRUCTION-test-fs-mixed-inst",
          "state: active",
          "created_by:",
          '  name: "Tester"',
          '  email: "tester@test.com"',
          "---",
          "",
          "# Prompt",
          "",
          "Always run rebuildIndex with mode colon fs after changing files.",
        ].join("\n"),
      );

      const result = await rebuildIndex({
        mode: "fs",
        projectMemoryDir: tmp.pmDir,
      });

      expect(result.indexed).toBe(3);
      expect(result.failed).toBe(0);

      // Verify all 3 types are searchable
      const results = await searchMemory("rebuildIndex mode fs mixed type", 10);

      expect(
        results.find((r) => r.id === "DECISION-test-fs-mixed-dec"),
      ).toBeDefined();
      expect(
        results.find((r) => r.id === "DISCUSSION-test-fs-mixed-disc"),
      ).toBeDefined();
      expect(
        results.find((r) => r.id === "INSTRUCTION-test-fs-mixed-inst"),
      ).toBeDefined();
    },
  );

  it(
    "skips unparseable files gracefully",
    { timeout: 60000 },
    async () => {
      const decisionsDir = path.join(tmp.pmDir, "decisions");
      fs.mkdirSync(decisionsDir, { recursive: true });

      // 2 valid decisions
      fs.writeFileSync(
        path.join(decisionsDir, "DECISION-test-fs-skip-ok1.md"),
        [
          "---",
          "id: DECISION-test-fs-skip-ok1",
          "title: Skip Test OK 1",
          "status: active",
          "primary_scope: constraint",
          "touches: [skip]",
          "created_by:",
          '  name: "Tester"',
          '  email: "tester@test.com"',
          "---",
          "",
          "# Context",
          "",
          "Valid decision one for the skip test scenario.",
          "",
          "# Decision",
          "",
          "This file has valid frontmatter and should be indexed.",
        ].join("\n"),
      );

      fs.writeFileSync(
        path.join(decisionsDir, "DECISION-test-fs-skip-ok2.md"),
        [
          "---",
          "id: DECISION-test-fs-skip-ok2",
          "title: Skip Test OK 2",
          "status: active",
          "primary_scope: constraint",
          "touches: [skip]",
          "created_by:",
          '  name: "Tester"',
          '  email: "tester@test.com"',
          "---",
          "",
          "# Context",
          "",
          "Valid decision two for the skip test scenario.",
          "",
          "# Decision",
          "",
          "This file also has valid frontmatter and should be indexed.",
        ].join("\n"),
      );

      // 1 file with broken frontmatter (missing required 'id' field)
      fs.writeFileSync(
        path.join(decisionsDir, "DECISION-test-fs-broken.md"),
        [
          "---",
          "title: Broken Decision",
          "status: active",
          "---",
          "",
          "# Context",
          "",
          "This file has no id field so the parser will throw.",
        ].join("\n"),
      );

      const result = await rebuildIndex({
        mode: "fs",
        projectMemoryDir: tmp.pmDir,
      });

      // Must not throw, must index 2 valid files, skip 1 broken file
      expect(result.indexed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(1);

      // Verify the valid ones are searchable
      const results = await searchMemory("skip test valid decision", 5);
      expect(
        results.find((r) => r.id === "DECISION-test-fs-skip-ok1"),
      ).toBeDefined();
      expect(
        results.find((r) => r.id === "DECISION-test-fs-skip-ok2"),
      ).toBeDefined();
      // The broken one should NOT be in the index
      expect(
        results.find((r) => r.id === "DECISION-test-fs-broken"),
      ).toBeUndefined();
    },
  );

  it(
    "handles empty directories without crashing",
    { timeout: 60000 },
    async () => {
      // beforeEach already cleaned all subdirs — they are empty
      const result = await rebuildIndex({
        mode: "fs",
        projectMemoryDir: tmp.pmDir,
      });

      expect(result).toBeDefined();
      expect(result.indexed).toBe(0);
      expect(result.failed).toBe(0);
      // skipped is optional; if present, must be 0
      if (result.skipped !== undefined) {
        expect(result.skipped).toBe(0);
      }
    },
  );

  it(
    "does not break backward-compatible entries API",
    { timeout: 60000 },
    async () => {
      // This test mirrors the call pattern from
      // rebuild_index_commit_survival.test.ts: passing an array directly.
      const entry = {
        type: "decision" as const,
        data: {
          id: "DECISION-test-fs-backward",
          title: "Backward Compat Decision",
          status: "active",
          primaryScope: "constraint",
          context:
            "Testing backward compatibility of the entries-based API.",
          decisionBody:
            "The old array-based API must still work after the refactor.",
          touches: ["backward", "compat"],
        },
      };

      const result = await rebuildIndex([entry]);

      expect(result.indexed).toBe(1);
      expect(result.failed).toBe(0);

      // Verify via search
      const results = await searchMemory(
        "backward compat entries API decision",
        5,
      );
      const match = results.find(
        (r) => r.id === "DECISION-test-fs-backward",
      );
      expect(match).toBeDefined();
      expect(match!.similarity).toBeGreaterThan(0.3);
    },
  );
});
