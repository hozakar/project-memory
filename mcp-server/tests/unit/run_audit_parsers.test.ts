import { describe, it, expect } from "vitest";
import { parseFrontmatter, matchesIgnorePattern, AuditIgnoreSet } from "../../src/tools/run_audit";

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
