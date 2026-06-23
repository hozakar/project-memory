/**
 * Smoke harness: verifies full and lite profile init creates the expected file shape,
 * and that a phase can be opened and closed within each profile's directory structure.
 * Run: npx tsx stress-test/profile-harness.ts
 *
 * Limitation: the skill-driven init is markdown-instructed (not callable from code),
 * so this harness inlines its own model of the expected directory structure in
 * `initFullProfile` / `initLiteProfile`. The tests therefore verify the harness's
 * assumptions about init output, not the actual on-load behavior of the skill.
 * If the skill's init instructions change, update this file in lockstep —
 * a drift between the two is silent.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function initFullProfile(dir: string): void {
  const pm = path.join(dir, ".project-memory");
  const subdirs = [
    "phases",
    "decisions",
    "discussions",
    "issues/open",
    "issues/closed",
    "instructions",
    "eras",
    "summaries",
  ];
  for (const sub of subdirs) {
    fs.mkdirSync(path.join(pm, sub), { recursive: true });
  }
  fs.writeFileSync(
    path.join(pm, "config.yml"),
    "profile: full\nprofile_history:\n  - profile: full\n    effective_date: 2026-06-19\n    reason: initial\n"
  );
  fs.writeFileSync(path.join(pm, "phases", "index.yml"), "phases: []\n");
  fs.writeFileSync(
    path.join(pm, "discussions", "index.md"),
    "# Discussions Index\n\n| Date | ID | Status | Outcome | Tags | Summary |\n|---|---|---|---|---|---|\n"
  );
  fs.writeFileSync(
    path.join(pm, "summaries", "project-memory.md"),
    "# Project Memory\n"
  );
  fs.writeFileSync(path.join(pm, "summaries", "current-state.md"), "# Current State\n");
  fs.writeFileSync(path.join(pm, "summaries", "architecture.md"), "# Architecture\n");
  fs.writeFileSync(path.join(pm, "summaries", "active-issues.md"), "# Active Issues\n");
  fs.writeFileSync(
    path.join(pm, "summaries", "roadmap.md"),
    "# Roadmap\n\n## Upcoming Work\n\n### Short-term\n\n### Later\n"
  );
}

function initLiteProfile(dir: string): void {
  const pm = path.join(dir, ".project-memory");
  const subdirs = ["phases", "decisions", "summaries"];
  for (const sub of subdirs) {
    fs.mkdirSync(path.join(pm, sub), { recursive: true });
  }
  fs.writeFileSync(
    path.join(pm, "config.yml"),
    "profile: lite\nprofile_history:\n  - profile: lite\n    effective_date: 2026-06-19\n    reason: initial\n"
  );
  fs.writeFileSync(path.join(pm, "phases", "index.yml"), "phases: []\n");
  fs.writeFileSync(
    path.join(pm, "decisions", "index.md"),
    "# Decision Index\n\n## Active\n\n## Superseded\n"
  );
  fs.writeFileSync(
    path.join(pm, "summaries", "roadmap.md"),
    "# Roadmap\n\n## Upcoming Work\n\n### Short-term\n\n### Later\n"
  );
  fs.writeFileSync(path.join(pm, "summaries", "current-state.md"), "# Current State\n");
}

function openPhase(dir: string, phaseId: string): void {
  const phaseDir = path.join(dir, ".project-memory", "phases", phaseId);
  fs.mkdirSync(phaseDir, { recursive: true });
  fs.writeFileSync(
    path.join(phaseDir, "phase.yml"),
    `id: ${phaseId}\ntitle: "Test Phase"\nstatus: in_progress\nbranch: ${phaseId}\nstarted_at: 2026-06-19\nclosed_at: null\ncommits: []\nsummary: ""\ndiscussions: []\ndecisions: []\ntags: [test]\ncreated_by:\n  name: "Test User"\n  email: "test@example.com"\ncontributors: []\n`
  );
}

function closePhase(dir: string, phaseId: string): void {
  const phaseYml = path.join(dir, ".project-memory", "phases", phaseId, "phase.yml");
  const content = fs.readFileSync(phaseYml, "utf-8");
  fs.writeFileSync(
    phaseYml,
    content
      .replace("status: in_progress", "status: completed")
      .replace("closed_at: null", "closed_at: 2026-06-19")
  );
}

function runTest(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (e: unknown) {
    return { name, passed: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-harness-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const results: TestResult[] = [];

results.push(
  runTest("full profile: init creates expected directories", () => {
    withTempDir((dir) => {
      initFullProfile(dir);
      const pm = path.join(dir, ".project-memory");
      const required = [
        "config.yml",
        "phases/index.yml",
        "discussions/index.md",
        "summaries/project-memory.md",
        "summaries/current-state.md",
        "summaries/architecture.md",
        "summaries/active-issues.md",
        "summaries/roadmap.md",
      ];
      for (const f of required) {
        assert(fs.existsSync(path.join(pm, f)), `Missing: ${f}`);
      }
      const config = fs.readFileSync(path.join(pm, "config.yml"), "utf-8");
      assert(config.includes("profile: full"), "config.yml must contain profile: full");
    });
  })
);

results.push(
  runTest("lite profile: init creates expected directories", () => {
    withTempDir((dir) => {
      initLiteProfile(dir);
      const pm = path.join(dir, ".project-memory");
      const required = [
        "config.yml",
        "phases/index.yml",
        "decisions/index.md",
        "summaries/roadmap.md",
        "summaries/current-state.md",
      ];
      for (const f of required) {
        assert(fs.existsSync(path.join(pm, f)), `Missing: ${f}`);
      }
      assert(
        !fs.existsSync(path.join(pm, "discussions", "index.md")),
        "lite profile must not create discussions/index.md"
      );
      const config = fs.readFileSync(path.join(pm, "config.yml"), "utf-8");
      assert(config.includes("profile: lite"), "config.yml must contain profile: lite");
    });
  })
);

results.push(
  runTest("full profile: phase open/close cycle", () => {
    withTempDir((dir) => {
      initFullProfile(dir);
      const phaseId = "phase-20260619-harness-test";
      openPhase(dir, phaseId);
      const phaseYml = path.join(dir, ".project-memory", "phases", phaseId, "phase.yml");
      assert(fs.existsSync(phaseYml), "phase.yml must exist after open");
      const opened = fs.readFileSync(phaseYml, "utf-8");
      assert(opened.includes("status: in_progress"), "opened phase must have status: in_progress");
      closePhase(dir, phaseId);
      const closed = fs.readFileSync(phaseYml, "utf-8");
      assert(closed.includes("status: completed"), "closed phase must have status: completed");
      assert(closed.includes("closed_at: 2026-06-19"), "closed phase must have closed_at set");
    });
  })
);

let passed = 0;
let failed = 0;
for (const r of results) {
  if (r.passed) {
    console.log(`  PASS  ${r.name}`);
    passed++;
  } else {
    console.error(`  FAIL  ${r.name}`);
    console.error(`        ${r.error}`);
    failed++;
  }
}
console.log(`\n${passed}/${results.length} tests passed.`);
if (failed > 0) process.exit(1);
