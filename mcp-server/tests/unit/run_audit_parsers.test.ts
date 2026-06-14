import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "../../src/tools/run_audit";

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
