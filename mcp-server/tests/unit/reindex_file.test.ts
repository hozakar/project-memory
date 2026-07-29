import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

vi.mock("../../src/embedder", () => ({
  embed: vi.fn().mockResolvedValue(new Array(384).fill(0.1)),
}));

vi.mock("../../src/db", () => ({
  upsert: vi.fn().mockResolvedValue(undefined),
}));

import { reindexFile } from "../../src/tools/reindex_file";
import { embed } from "../../src/embedder";

let tmpDir: string;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "reindex-unit-"));
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(embed).mockResolvedValue(new Array(384).fill(0.1));
});

describe("reindexFile unit tests", () => {
  it("returns success for a valid decision file", async () => {
    const fp = join(tmpDir, "DECISION-test.md");
    writeFileSync(fp, [
      "---",
      "id: DECISION-2026-07-26-unit-test",
      "title: Unit Test Decision",
      "status: active",
      "touches:",
      "  - test_file",
      "---",
      "# Context",
      "Unit test context",
      "# Decision",
      "Unit test decision body",
    ].join("\n"));
    const result = await reindexFile(tmpDir, "decision", fp);
    expect(result).toEqual({ success: true });
  });

  it("returns success for a valid discussion file", async () => {
    const fp = join(tmpDir, "DISCUSSION-test.md");
    writeFileSync(fp, [
      "---",
      "id: DISCUSSION-2026-07-26-unit-test",
      "title: Unit Test Discussion",
      "status: concluded",
      "outcome: none",
      "tags:",
      "  - test",
      "---",
      "# Discussion",
      "Unit test discussion body",
    ].join("\n"));
    const result = await reindexFile(tmpDir, "discussion", fp);
    expect(result).toEqual({ success: true });
  });

  it("returns success for a valid instruction file", async () => {
    const fp = join(tmpDir, "INSTRUCTION-test.md");
    writeFileSync(fp, [
      "---",
      "id: INSTRUCTION-2026-07-26-unit-test",
      "state: active",
      "---",
      "# Prompt",
      "Always write tests first.",
    ].join("\n"));
    const result = await reindexFile(tmpDir, "instruction", fp);
    expect(result).toEqual({ success: true });
  });

  // removed: "returns success for a valid assignment file" — assignment feature dropped 2026-07-29

  it("returns success for a valid note file", async () => {
    const fp = join(tmpDir, "NOTE-test.md");
    writeFileSync(fp, [
      "---",
      "id: NOTE-2026-07-26-unit-test",
      "title: Unit Test Note",
      "created_by:",
      '  name: "Test User"',
      '  email: "test@example.com"',
      "created_at: 2026-07-26",
      "updated_at: 2026-07-26",
      "---",
      "# Note",
      "Unit test note body",
    ].join("\n"));
    const result = await reindexFile(tmpDir, "note", fp);
    expect(result).toEqual({ success: true });
  });

  it("returns file_not_found when file does not exist", async () => {
    const result = await reindexFile(tmpDir, "decision", join(tmpDir, "nonexistent.md"));
    expect(result.success).toBe(false);
    expect(result.error).toBe("file_not_found");
  });

  it("returns parse_error for malformed YAML frontmatter", async () => {
    const fp = join(tmpDir, "bad-yaml.md");
    writeFileSync(fp, "---\nid: broken\ntitle: [unclosed list\n---\n# Context\nBody\n");
    const result = await reindexFile(tmpDir, "decision", fp);
    expect(result.success).toBe(false);
    expect(result.error).toBe("parse_error");
    expect(result.details).toBeTruthy();
  });

  it("returns parse_error for missing required frontmatter fields", async () => {
    const fp = join(tmpDir, "no-id.md");
    writeFileSync(fp, "---\ntitle: No ID\n---\n# Context\nBody\n");
    const result = await reindexFile(tmpDir, "decision", fp);
    expect(result.success).toBe(false);
    expect(result.error).toBe("parse_error");
    expect(result.details).toContain("Missing required frontmatter");
  });

  it("returns unknown_error when embed rejects", async () => {
    vi.mocked(embed).mockRejectedValue(new Error("Model load failed"));
    const fp = join(tmpDir, "DECISION-embed-fail.md");
    writeFileSync(fp, [
      "---",
      "id: DECISION-2026-07-26-embed-fail",
      "title: Embed Fail Decision",
      "status: active",
      "touches:",
      "  - test",
      "---",
      "# Context",
      "Decision context",
      "# Decision",
      "Decision body",
    ].join("\n"));
    const result = await reindexFile(tmpDir, "decision", fp);
    expect(result.success).toBe(false);
    expect(result.error).toBe("unknown_error");
    expect(result.details).toBeTruthy();
  });

  it("returns unsupported_type for unknown type", async () => {
    const fp = join(tmpDir, "whatever.md");
    if (!existsSync(fp)) {
      writeFileSync(fp, "---\nid: x\n---\n");
    }
    const result = await reindexFile(tmpDir, "phase", fp);
    expect(result.success).toBe(false);
    expect(result.error).toBe("unsupported_type");
  });
});
