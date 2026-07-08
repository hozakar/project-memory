import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { dbPath, escapeLike } from "../../src/db";

describe("dbPath", () => {
  let savedEnv: string | undefined;
  let tmpDir: string;

  beforeEach(() => {
    savedEnv = process.env.PROJECT_MEMORY_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-test-"));
  });

  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.PROJECT_MEMORY_DIR;
    } else {
      process.env.PROJECT_MEMORY_DIR = savedEnv;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when PROJECT_MEMORY_DIR is a relative path", () => {
    process.env.PROJECT_MEMORY_DIR = "relative/path";
    expect(() => dbPath()).toThrow(/must be an absolute path/);
  });

  it("treats string 'undefined' as unset and falls through to cwd check", () => {
    process.env.PROJECT_MEMORY_DIR = "undefined";
    // Falls through to cwd() — which likely lacks .project-memory/ in test env, so expects the existence error
    expect(() => dbPath()).toThrow(/No \.project-memory\/ directory found/);
  });

  it("treats empty string as unset and falls through to cwd check", () => {
    process.env.PROJECT_MEMORY_DIR = "";
    expect(() => dbPath()).toThrow(/No \.project-memory\/ directory found/);
  });

  it("throws when absolute path has no .project-memory/ directory", () => {
    process.env.PROJECT_MEMORY_DIR = tmpDir;
    expect(() => dbPath()).toThrow(/No \.project-memory\/ directory found/);
    expect(() => dbPath()).toThrow(tmpDir);
  });

  it("returns correct vector-index path when .project-memory/ exists", () => {
    const pmDir = path.join(tmpDir, ".project-memory");
    fs.mkdirSync(pmDir);
    process.env.PROJECT_MEMORY_DIR = tmpDir;
    expect(dbPath()).toBe(path.join(tmpDir, ".project-memory", "vector-index"));
  });
});

describe("escapeLike", () => {
  it("escapes single quotes by doubling them", () => {
    expect(escapeLike("O'Brien")).toBe("O''Brien");
  });

  it("returns unchanged string when no special chars present", () => {
    expect(escapeLike("normal-value")).toBe("normal-value");
  });

  it("handles multiple single quotes", () => {
    expect(escapeLike("it's a 'test'")).toBe("it''s a ''test''");
  });

  it("handles empty string", () => {
    expect(escapeLike("")).toBe("");
  });

  it("escapes percent sign with backslash", () => {
    expect(escapeLike("50%")).toBe("50\\%");
  });

  it("escapes underscore with backslash", () => {
    expect(escapeLike("user_name")).toBe("user\\_name");
  });

  it("escapes backslash itself", () => {
    expect(escapeLike("path\\to\\file")).toBe("path\\\\to\\\\file");
  });

  it("escapes all LIKE special characters together", () => {
    expect(escapeLike("50%_test\\value")).toBe("50\\%\\_test\\\\value");
  });

  it("escapes percent after single quote", () => {
    expect(escapeLike("it's 100% done")).toBe("it''s 100\\% done");
  });
});
