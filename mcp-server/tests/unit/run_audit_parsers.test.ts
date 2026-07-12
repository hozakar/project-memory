import { describe, it, expect } from "vitest";
import { parseFrontmatter, matchesIgnorePattern, AuditIgnoreSet, parseSupersedesList, parseSupersededBy, findSupersessionCycles, parseIndexHeader } from "../../src/tools/run_audit";

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

describe("parseSupersedesList", () => {
  it("returns empty array for supersedes: null", () => {
    const content = "---\nid: TEST\nsupersedes: null\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual([]);
  });

  it("returns single ID for supersedes: DECISION-X", () => {
    const content = "---\nid: TEST\nsupersedes: DECISION-2026-06-13-branch-per-phase\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual(["DECISION-2026-06-13-branch-per-phase"]);
  });

  it("returns multi-ID array for bracket list format", () => {
    const content = "---\nid: TEST\nsupersedes: [DECISION-2026-06-13-branch-per-phase, DECISION-2026-06-13-foo-bar]\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual([
      "DECISION-2026-06-13-branch-per-phase",
      "DECISION-2026-06-13-foo-bar",
    ]);
  });

  it("returns multi-ID array for YAML block list format", () => {
    const content = "---\nid: TEST\nsupersedes:\n  - DECISION-2026-06-13-branch-per-phase\n  - DECISION-2026-06-13-foo-bar\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual([
      "DECISION-2026-06-13-branch-per-phase",
      "DECISION-2026-06-13-foo-bar",
    ]);
  });

  it("returns empty array for empty block list", () => {
    const content = "---\nid: TEST\nsupersedes:\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual([]);
  });

  it("returns empty array when no supersedes field exists", () => {
    const content = "---\nid: TEST\nstatus: active\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual([]);
  });

  it("handles CRLF line endings with block list", () => {
    const content = "---\r\nid: TEST\r\nsupersedes:\r\n  - DECISION-2026-06-13-branch-per-phase\r\n---\r\n# Body";
    expect(parseSupersedesList(content)).toEqual(["DECISION-2026-06-13-branch-per-phase"]);
  });

  it("returns empty array for supersedes: []", () => {
    const content = "---\nid: TEST\nsupersedes: []\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual([]);
  });

  it("handles single ID with surrounding quotes", () => {
    const content = "---\nid: TEST\nsupersedes: 'DECISION-2026-06-13-branch-per-phase'\n---\n# Body";
    expect(parseSupersedesList(content)).toEqual(["DECISION-2026-06-13-branch-per-phase"]);
  });

  it("returns empty array when no frontmatter", () => {
    expect(parseSupersedesList("No frontmatter here")).toEqual([]);
  });
});

describe("parseSupersededBy", () => {
  it("returns null for superseded_by: null", () => {
    const content = "---\nid: TEST\nsuperseded_by: null\n---\n# Body";
    expect(parseSupersededBy(content)).toBeNull();
  });

  it("returns the ID for superseded_by: DECISION-X", () => {
    const content = "---\nid: TEST\nsuperseded_by: DECISION-2026-06-13-branch-per-phase\n---\n# Body";
    expect(parseSupersededBy(content)).toBe("DECISION-2026-06-13-branch-per-phase");
  });

  it("returns null when no superseded_by field exists", () => {
    const content = "---\nid: TEST\nstatus: active\n---\n# Body";
    expect(parseSupersededBy(content)).toBeNull();
  });

  it("handles surrounding quotes", () => {
    const content = "---\nid: TEST\nsuperseded_by: 'DECISION-2026-06-13-branch-per-phase'\n---\n# Body";
    expect(parseSupersededBy(content)).toBe("DECISION-2026-06-13-branch-per-phase");
  });
});

describe("parseIndexHeader", () => {
  it("canonical 7-col header", () => {
    const content = "| Date | ID | Scope | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n| 2026-07-03 | DECISION-2026-07-03-foo | workflow | active | - | a | c |\n";
    const map = parseIndexHeader(content);
    expect(map).not.toBeNull();
    expect(map!.get("status")).toBe(4);
    expect(map!.get("id")).toBe(2);
    expect(map!.get("scope")).toBe(3);
    expect(map!.get("global")).toBe(5);
  });

  it("non-canonical 6-col header (missing Scope)", () => {
    const content = "| Date | ID | Status | Global | Claim | Touches |\n|---|---|---|---|---|---|\n| 2026-07-03 | DECISION-2026-07-03-foo | active | No | Claim text | touch1, touch2 |\n";
    const map = parseIndexHeader(content);
    expect(map).not.toBeNull();
    expect(map!.get("status")).toBe(3);
    expect(map!.get("global")).toBe(4);
  });

  it("non-canonical 6-col header (missing Scope, different order)", () => {
    const content = "| Date | ID | Status | Global | Touches | Claim |\n|---|---|---|---|---|---|\n";
    const map = parseIndexHeader(content);
    expect(map).not.toBeNull();
    expect(map!.get("status")).toBe(3);
  });

  it("returns null when no header found", () => {
    const content = "# Just a heading\n\nSome text without a table.\n";
    expect(parseIndexHeader(content)).toBeNull();
  });

  it("returns null when header without separator row", () => {
    const content = "| Date | ID | Status | Global |\n| 2026-07-03 | DECISION-foo | active | No |\n";
    // No separator row after header → null
    expect(parseIndexHeader(content)).toBeNull();
  });

  it("column names are lowercased in the map", () => {
    const content = "| Date | ID | Scope | STATUS | Global | Touches | Claim |\n|---|---|---|---|---|---|---|\n";
    const map = parseIndexHeader(content);
    expect(map).not.toBeNull();
    expect(map!.get("status")).toBe(4);
    expect(map!.get("STATUS")).toBeUndefined();
  });
});

describe("findSupersessionCycles", () => {
  it("returns empty for acyclic graph", () => {
    const graph = new Map([
      ["DECISION-A", ["DECISION-B"]],
      ["DECISION-B", ["DECISION-C"]],
      ["DECISION-C", []],
    ]);
    expect(findSupersessionCycles(graph)).toEqual([]);
  });

  it("detects a 2-cycle", () => {
    const graph = new Map([
      ["DECISION-A", ["DECISION-B"]],
      ["DECISION-B", ["DECISION-A"]],
    ]);
    const cycles = findSupersessionCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
    // Each cycle should have the form [X, Y, X] (closing back to start)
    const cycle = cycles[0];
    expect(cycle.length).toBe(3);
    expect(cycle[0]).toBe(cycle[2]);
  });

  it("detects a 3-cycle A→B→C→A", () => {
    const graph = new Map([
      ["DECISION-2026-06-01-A", ["DECISION-2026-06-02-B"]],
      ["DECISION-2026-06-02-B", ["DECISION-2026-06-03-C"]],
      ["DECISION-2026-06-03-C", ["DECISION-2026-06-01-A"]],
    ]);
    const cycles = findSupersessionCycles(graph);
    expect(cycles.length).toBeGreaterThan(0);
    const cycle = cycles[0];
    expect(cycle[0]).toBe(cycle[cycle.length - 1]);
    expect(cycle.length).toBeGreaterThanOrEqual(3);
  });

  it("skips dangling neighbors (not in graph)", () => {
    // D neighbor does not exist in graph keys
    const graph = new Map([
      ["DECISION-A", ["DECISION-B"]],
      ["DECISION-B", ["DECISION-MISSING"]],
    ]);
    expect(findSupersessionCycles(graph)).toEqual([]);
  });

  it("returns empty for empty graph", () => {
    expect(findSupersessionCycles(new Map())).toEqual([]);
  });
});
