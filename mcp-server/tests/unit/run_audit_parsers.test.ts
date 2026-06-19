import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, it, expect } from "vitest";
import { parseFrontmatter, matchesIgnorePattern, AuditIgnoreSet, resolveProfileAtDate, readProfileHistory } from "../../src/tools/run_audit";
import type { ProfileHistoryEntry } from "../../src/tools/run_audit";

describe("parseFrontmatter", () => {
  it("parses basic key-value pairs", () => {
    const content = "---\nid: DECISION-2026-06-14-test\nstatus: active\n---\n# Title";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("DECISION-2026-06-14-test");
    expect(result.status).toBe("active");
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nid: crlf-test\r\nstatus: active\r\n---\r\n";
    expect(parseFrontmatter(content).id).toBe("crlf-test");
    expect(parseFrontmatter(content).status).toBe("active");
  });

  it("strips UTF-8 BOM from the beginning of content", () => {
    const content = "﻿---\nid: bom-test\nstatus: active\n---\n";
    expect(parseFrontmatter(content).id).toBe("bom-test");
  });

  it("handles CRLF + BOM together", () => {
    const content = "﻿---\r\nid: both-test\r\nstatus: active\r\n---\r\n";
    expect(parseFrontmatter(content).id).toBe("both-test");
  });

  it("strips surrounding double quotes from values", () => {
    const content = '---\nadr_id: "0015"\n---\n';
    expect(parseFrontmatter(content).adr_id).toBe("0015");
  });

  it("strips surrounding single quotes from values", () => {
    const content = "---\nadr_id: '0015'\n---\n";
    expect(parseFrontmatter(content).adr_id).toBe("0015");
  });

  it("returns empty object when no frontmatter block present", () => {
    expect(parseFrontmatter("# Just a heading\nSome text.")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseFrontmatter("")).toEqual({});
  });

  it("ignores list values (only captures scalar key: value lines)", () => {
    const content = "---\nid: test-id\ntouches:\n  - file_a\n  - file_b\n---\n";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("test-id");
    expect(result.touches).toBeUndefined();
  });
});

describe("matchesIgnorePattern", () => {
  it("matches exact key (no wildcard)", () => {
    expect(matchesIgnorePattern("commit:abc123", "commit:abc123")).toBe(true);
    expect(matchesIgnorePattern("commit:abc123", "commit:other")).toBe(false);
  });

  it("wildcard matches any chars within segment", () => {
    expect(matchesIgnorePattern("commit:*", "commit:abc123f")).toBe(true);
    expect(matchesIgnorePattern("tag-typo:*:skil-md", "tag-typo:phase-20260611-some-phase:skil-md")).toBe(true);
    expect(matchesIgnorePattern("tag-typo:*:skil-md", "tag-typo:phase-20260611-some-phase:other-tag")).toBe(false);
  });

  it("wildcard does not cross segment boundaries", () => {
    // * should not match : chars, so commit:* must not match commit:abc:extra
    expect(matchesIgnorePattern("commit:*", "commit:abc:extra")).toBe(false);
  });

  it("wildcard matches partial segment (prefix/suffix)", () => {
    expect(matchesIgnorePattern("phase-completeness:phase-2026*:*.md", "phase-completeness:phase-20260611-slug:plan.md")).toBe(true);
    expect(matchesIgnorePattern("phase-completeness:phase-2026*:*.md", "phase-completeness:phase-20260611-slug:phase.yml")).toBe(false);
  });

  it("special regex chars in pattern are escaped", () => {
    expect(matchesIgnorePattern("stub:file.md:section", "stub:file.md:section")).toBe(true);
    expect(matchesIgnorePattern("stub:file.md:section", "stub:fileXmd:section")).toBe(false);
  });
});

describe("AuditIgnoreSet", () => {
  it("exact match works", () => {
    const s = new AuditIgnoreSet();
    s.add("commit:abc123");
    expect(s.has("commit:abc123")).toBe(true);
    expect(s.has("commit:other")).toBe(false);
  });

  it("wildcard pattern match works", () => {
    const s = new AuditIgnoreSet();
    s.add("tag-typo:*:cat8");
    expect(s.has("tag-typo:phase-20260614-some-phase:cat8")).toBe(true);
    expect(s.has("tag-typo:phase-20260614-some-phase:cat1")).toBe(false);
  });

  it("exact match takes priority over pattern (both work)", () => {
    const s = new AuditIgnoreSet();
    s.add("commit:abc");
    s.add("commit:*");
    expect(s.has("commit:abc")).toBe(true);
    expect(s.has("commit:xyz")).toBe(true);
  });

  it("multiple patterns are all checked", () => {
    const s = new AuditIgnoreSet();
    s.add("tag-typo:*:decisions");
    s.add("tag-typo:*:discussions");
    expect(s.has("tag-typo:any-phase:decisions")).toBe(true);
    expect(s.has("tag-typo:any-phase:discussions")).toBe(true);
    expect(s.has("tag-typo:any-phase:security")).toBe(false);
  });
});

describe("resolveProfileAtDate", () => {
  it("returns fallback when profileHistory is empty", () => {
    expect(resolveProfileAtDate("2026-06-10", [], "full")).toBe("full");
    expect(resolveProfileAtDate("2026-06-10", [], "lite")).toBe("lite");
  });

  it("single profile, no transition — returns that profile for any date", () => {
    const history: ProfileHistoryEntry[] = [
      { profile: "full", effective_date: "2026-06-08" },
    ];
    expect(resolveProfileAtDate("2026-06-08", history, "full")).toBe("full");
    expect(resolveProfileAtDate("2026-06-20", history, "full")).toBe("full");
  });

  it("full → lite downgrade: phases before downgrade date resolve as full", () => {
    const history: ProfileHistoryEntry[] = [
      { profile: "full", effective_date: "2026-06-08" },
      { profile: "lite", effective_date: "2026-06-15" },
    ];
    // Phase created before downgrade → full
    expect(resolveProfileAtDate("2026-06-10", history, "lite")).toBe("full");
    // Phase created on downgrade date → lite
    expect(resolveProfileAtDate("2026-06-15", history, "lite")).toBe("lite");
    // Phase created after downgrade → lite
    expect(resolveProfileAtDate("2026-06-20", history, "lite")).toBe("lite");
  });

  it("lite → full upgrade: phases before upgrade date resolve as lite", () => {
    const history: ProfileHistoryEntry[] = [
      { profile: "lite", effective_date: "2026-06-08" },
      { profile: "full", effective_date: "2026-06-15" },
    ];
    // Phase created before upgrade → lite (no false-positive missing-file reports)
    expect(resolveProfileAtDate("2026-06-10", history, "full")).toBe("lite");
    // Phase created on upgrade date → full
    expect(resolveProfileAtDate("2026-06-15", history, "full")).toBe("full");
    // Phase created after upgrade → full
    expect(resolveProfileAtDate("2026-06-20", history, "full")).toBe("full");
  });

  it("returns fallback when date is before all history entries", () => {
    const history: ProfileHistoryEntry[] = [
      { profile: "full", effective_date: "2026-06-08" },
    ];
    // Phase date before the only history entry → fallback
    expect(resolveProfileAtDate("2026-06-01", history, "lite")).toBe("lite");
  });
});

describe("readProfileHistory", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pm-rph-test-"));
    fs.mkdirSync(path.join(tmpDir, ".project-memory"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeConfig(content: string): void {
    fs.writeFileSync(path.join(tmpDir, ".project-memory", "config.yml"), content, "utf-8");
  }

  it("returns empty array when config.yml has no profile_history key", () => {
    writeConfig("profile: full\nadr_enabled: false\n");
    expect(readProfileHistory(path.join(tmpDir, ".project-memory"))).toEqual([]);
  });

  it("parses a single profile_history entry correctly", () => {
    writeConfig([
      "profile: full",
      "profile_history:",
      "  - profile: full",
      '    effective_date: 2026-06-08',
      '    reason: "initial"',
    ].join("\n"));
    expect(readProfileHistory(path.join(tmpDir, ".project-memory"))).toEqual([
      { profile: "full", effective_date: "2026-06-08" },
    ]);
  });

  it("parses multiple entries and returns them sorted ascending by effective_date", () => {
    // reason field appears between profile: and effective_date: — real config.yml format
    writeConfig([
      "profile: lite",
      "profile_history:",
      "  - profile: lite",
      '    effective_date: 2026-06-15',
      '    reason: "downgrade"',
      "  - profile: full",
      '    effective_date: 2026-06-08',
      '    reason: "initial"',
    ].join("\n"));
    const result = readProfileHistory(path.join(tmpDir, ".project-memory"));
    expect(result).toEqual([
      { profile: "full", effective_date: "2026-06-08" },
      { profile: "lite", effective_date: "2026-06-15" },
    ]);
  });

  it("skips entries with unrecognized profile values", () => {
    writeConfig([
      "profile: full",
      "profile_history:",
      "  - profile: full",
      '    effective_date: 2026-06-08',
      "  - profile: experimental",
      '    effective_date: 2026-06-10',
    ].join("\n"));
    const result = readProfileHistory(path.join(tmpDir, ".project-memory"));
    expect(result).toHaveLength(1);
    expect(result[0].profile).toBe("full");
  });

  it("does not cross-pair profile and effective_date across items", () => {
    writeConfig([
      "profile: lite",
      "profile_history:",
      "  - profile: full",
      "    effective_date: 2026-06-01",
      "    reason: initial",
      "  - profile: lite",
      "    effective_date: 2026-06-15",
      "    reason: switched",
    ].join("\n"));
    const result = readProfileHistory(path.join(tmpDir, ".project-memory"));
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ profile: "full", effective_date: "2026-06-01" });
    expect(result[1]).toEqual({ profile: "lite", effective_date: "2026-06-15" });
  });

  it("handles item missing effective_date without cross-pairing", () => {
    writeConfig([
      "profile: lite",
      "profile_history:",
      "  - profile: full",
      "    reason: initial",
      "  - profile: lite",
      "    effective_date: 2026-06-15",
      "    reason: switched",
    ].join("\n"));
    const result = readProfileHistory(path.join(tmpDir, ".project-memory"));
    // First item has no effective_date — should be skipped, not cross-paired
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ profile: "lite", effective_date: "2026-06-15" });
  });
});
