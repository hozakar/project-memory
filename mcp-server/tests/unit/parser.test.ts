import { describe, it, expect } from "vitest";
import {
  ParseError,
  parseFrontmatter,
  parseDecisionFile,
  parseDiscussionFile,
  parseInstructionFile,
  parseNoteFile,
} from "../../src/parser";

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("returns empty object for empty frontmatter block (---\\n---)", () => {
    const content = "---\n---\n# Context\nSome text";
    const result = parseFrontmatter(content);
    expect(result).toEqual({});
  });

  it("parses flat key-value YAML frontmatter", () => {
    const content = "---\nid: DECISION-2026-06-14-test\nstatus: active\n---\n# Title";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("DECISION-2026-06-14-test");
    expect(result.status).toBe("active");
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\nid: crlf-test\r\nstatus: active\r\n---\r\n";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("crlf-test");
    expect(result.status).toBe("active");
  });

  it("strips UTF-8 BOM from the beginning of content", () => {
    const content = "\uFEFF---\nid: bom-test\nstatus: active\n---\n";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("bom-test");
  });

  it("handles CRLF + BOM together", () => {
    const content = "\uFEFF---\r\nid: both-test\r\nstatus: active\r\n---\r\n";
    const result = parseFrontmatter(content);
    expect(result.id).toBe("both-test");
  });

  it("strips surrounding double quotes from values", () => {
    const content = '---\nadr_id: "0015"\n---\n';
    const result = parseFrontmatter(content);
    expect(result.adr_id).toBe("0015");
  });

  it("strips surrounding single quotes from values", () => {
    const content = "---\nadr_id: '0015'\n---\n";
    const result = parseFrontmatter(content);
    expect(result.adr_id).toBe("0015");
  });

  it("returns empty object when no frontmatter block present (no ---)", () => {
    const content = "# Just a heading\nSome text.";
    expect(parseFrontmatter(content)).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseFrontmatter("")).toEqual({});
  });

  it("parses nested created_by as { name, email }", () => {
    const content = "---\ncreated_by:\n  name: John Doe\n  email: john@example.com\n---\n";
    const result = parseFrontmatter(content);
    expect(result.created_by).toEqual({ name: "John Doe", email: "john@example.com" });
  });

  it("parses contributors as array of nested objects", () => {
    const content = "---\ncontributors:\n  - name: Alice\n    email: alice@example.com\n  - name: Bob\n    email: bob@example.com\n---\n";
    const result = parseFrontmatter(content);
    expect(result.contributors).toEqual([
      { name: "Alice", email: "alice@example.com" },
      { name: "Bob", email: "bob@example.com" },
    ]);
  });

  it("parses tags as string array", () => {
    const content = "---\ntags:\n  - mcp\n  - schema\n  - workflow\n---\n";
    const result = parseFrontmatter(content);
    expect(result.tags).toEqual(["mcp", "schema", "workflow"]);
  });

  it("parses inline tags array", () => {
    const content = "---\ntags: [mcp, schema, workflow]\n---\n";
    const result = parseFrontmatter(content);
    expect(result.tags).toEqual(["mcp", "schema", "workflow"]);
  });

  it("parses nested outcome as { type, id, summary }", () => {
    const content = "---\noutcome:\n  type: decision\n  id: DECISION-2026-06-13-foo\n  summary: A decision was made\n---\n";
    const result = parseFrontmatter(content);
    expect(result.outcome).toEqual({
      type: "decision",
      id: "DECISION-2026-06-13-foo",
      summary: "A decision was made",
    });
  });

  it("parses touches as string array", () => {
    const content = "---\ntouches:\n  - conventions_md\n  - decisions\n---\n";
    const result = parseFrontmatter(content);
    expect(result.touches).toEqual(["conventions_md", "decisions"]);
  });

  it("parses nested identity objects", () => {
    const content = "---\ncreated_by:\n  name: John\n  email: john@test.com\nreviewed_by:\n  name: Admin\n  email: admin@test.com\n---\n";
    const result = parseFrontmatter(content);
    expect(result.created_by).toEqual({ name: "John", email: "john@test.com" });
    expect(result.reviewed_by).toEqual({ name: "Admin", email: "admin@test.com" });
  });

  it("throws ParseError on malformed YAML", () => {
    const content = "---\ninvalid: [unclosed\n---\n";
    expect(() => parseFrontmatter(content)).toThrow(ParseError);
  });

  it("catches js-yaml error and wraps in ParseError with cause", () => {
    const content = "---\nbad: \n  - missing\n  value\n---\n";
    expect(() => parseFrontmatter(content)).toThrow(ParseError);
  });

  it("handles colon-space in unquoted scalar values via fallback", () => {
    const content = "---\nsummary: Issue resolved: fixed the title\nstatus: done\n---\n# Body\n";
    const result = parseFrontmatter(content);
    expect(result.summary).toBe("Issue resolved: fixed the title");
    expect(result.status).toBe("done");
  });

  it("handles multiple colons in unquoted scalar values", () => {
    const content = '---\nsummary: A: B: C: all fixed\nstatus: done\n---\n# Body\n';
    const result = parseFrontmatter(content);
    expect(result.summary).toBe("A: B: C: all fixed");
    expect(result.status).toBe("done");
  });

  it("does not quote values already quoted", () => {
    const content = '---\nsummary: "Already: quoted"\nstatus: done\n---\n# Body\n';
    const result = parseFrontmatter(content);
    expect(result.summary).toBe("Already: quoted");
  });

  it("does not break flow sequences containing colons", () => {
    const content = '---\ntags: [audit:fix, cat:9]\nstatus: active\n---\n# Body\n';
    const result = parseFrontmatter(content);
    // FAILSAFE_SCHEMA + js-yaml parses YAML flow sequences into real arrays
    expect(result.tags).toEqual(["audit:fix", "cat:9"]);
  });

  it("throws ParseError on truly malformed YAML even after colon fix", () => {
    const content = "---\ninvalid: [unclosed\n---\n";
    expect(() => parseFrontmatter(content)).toThrow(ParseError);
  });
});

// ---------------------------------------------------------------------------
// parseDecisionFile
// ---------------------------------------------------------------------------

describe("parseDecisionFile", () => {
  it("parses a valid DECISION file with all fields", () => {
    const content = [
      "---",
      "id: DECISION-2026-06-14-test",
      "title: Test Decision",
      "status: active",
      "provenance: collaborative",
      "primary_scope: workflow",
      "created_by:",
      "  name: John Doe",
      "  email: john@example.com",
      "contributors:",
      "  - name: Alice",
      "    email: alice@example.com",
      "touches:",
      "  - conventions_md",
      "  - decisions",
      "---",
      "# Context",
      "This is the context section with background information.",
      "More context here.",
      "",
      "# Decision",
      "We decided to go with option A.",
      "",
      "# Chosen Solution",
      "The chosen solution is to use MCP.",
      "Details of the solution.",
      "",
      "# Alternatives",
      "Other options were considered.",
    ].join("\n");

    const result = parseDecisionFile(content);
    expect(result.id).toBe("DECISION-2026-06-14-test");
    expect(result.title).toBe("Test Decision");
    expect(result.status).toBe("active");
    expect(result.provenance).toBe("collaborative");
    expect(result.primaryScope).toBe("workflow");
    expect(result.createdBy).toEqual({ name: "John Doe", email: "john@example.com" });
    expect(result.contributors).toEqual([{ name: "Alice", email: "alice@example.com" }]);
    expect(result.touches).toEqual(["conventions_md", "decisions"]);
    expect(result.context).toContain("This is the context section");
    expect(result.decisionBody).toContain("We decided to go with option A");
    expect(result.decisionBody).toContain("The chosen solution is to use MCP");
  });

  it("extracts context from # Context section (first 1000 chars)", () => {
    const longContext = "Context line.\n".repeat(500);
    const content = [
      "---",
      "id: DECISION-2026-06-14-test",
      "title: Test",
      "status: active",
      "---",
      "# Context",
      longContext,
      "",
      "# Decision",
      "Body",
    ].join("\n");

    const result = parseDecisionFile(content);
    expect(result.context.length).toBeLessThanOrEqual(1000);
    expect(result.context).toContain("Context line.");
  });

  it("extracts decisionBody from # Decision + # Chosen Solution (first 1000 chars)", () => {
    const content = [
      "---",
      "id: DECISION-2026-06-14-test",
      "title: Test",
      "status: active",
      "---",
      "# Context",
      "Some context.",
      "",
      "# Decision",
      "Decision body here.",
      "",
      "# Chosen Solution",
      "Chosen solution body here.",
    ].join("\n");

    const result = parseDecisionFile(content);
    expect(result.decisionBody).toContain("Decision body here.");
    expect(result.decisionBody).toContain("Chosen solution body here.");
  });

  it("handles missing # Chosen Solution section gracefully", () => {
    const content = [
      "---",
      "id: DECISION-2026-06-14-test",
      "title: Test",
      "status: active",
      "---",
      "# Context",
      "Some context.",
      "",
      "# Decision",
      "Decision body here.",
    ].join("\n");

    const result = parseDecisionFile(content);
    expect(result.decisionBody).toContain("Decision body here.");
  });

  it("throws ParseError when id is missing", () => {
    const content = "---\ntitle: No ID\nstatus: active\n---\n# Context\nBody";
    expect(() => parseDecisionFile(content)).toThrow(ParseError);
  });

  it("falls back to first heading when title is missing from frontmatter", () => {
    const content = "---\nid: DECISION-2026-06-14-test\nstatus: active\n---\n# My Decision Title\n# Context\nBody";
    const result = parseDecisionFile(content);
    expect(result.title).toBe("My Decision Title");
  });

  it("falls back to ID when title is missing and no heading exists", () => {
    const content = "---\nid: DECISION-2026-06-14-test\nstatus: active\n---\nBody text without any heading.";
    const result = parseDecisionFile(content);
    expect(result.title).toBe("DECISION-2026-06-14-test");
  });

  it("throws ParseError when status is missing", () => {
    const content = "---\nid: DECISION-2026-06-14-test\ntitle: Test\n---\n# Context\nBody";
    expect(() => parseDecisionFile(content)).toThrow(ParseError);
  });

  it("handles empty frontmatter gracefully by throwing ParseError", () => {
    const content = "---\n---\n# Context\nSome text";
    expect(() => parseDecisionFile(content)).toThrow(ParseError);
  });

  it("extracts context from #  Context (two spaces)", () => {
    const content = [
      "---",
      "id: DECISION-2026-06-14-test",
      "title: Test",
      "status: active",
      "---",
      "#  Context",
      "Extra space heading context.",
      "",
      "# Decision",
      "Body",
    ].join("\n");

    const result = parseDecisionFile(content);
    expect(result.context).toContain("Extra space heading context.");
  });

  it("extracts context from #   Context (three spaces)", () => {
    const content = [
      "---",
      "id: DECISION-2026-06-14-test",
      "title: Test",
      "status: active",
      "---",
      "#   Context",
      "Triple space heading context.",
      "",
      "# Decision",
      "Body",
    ].join("\n");

    const result = parseDecisionFile(content);
    expect(result.context).toContain("Triple space heading context.");
  });
});

// ---------------------------------------------------------------------------
// parseDiscussionFile
// ---------------------------------------------------------------------------

describe("parseDiscussionFile", () => {
  it("parses a valid DISCUSSION file with nested outcome", () => {
    const content = [
      "---",
      "id: DISCUSSION-2026-06-14-test",
      "title: Test Discussion",
      "status: concluded",
      "provenance: collaborative",
      "tags:",
      "  - mcp",
      "  - architecture",
      "outcome:",
      "  type: decision",
      "  id: DECISION-2026-06-14-foo",
      "  summary: We chose option A",
      "created_by:",
      "  name: John Doe",
      "  email: john@example.com",
      "---",
      "# Discussion",
      "This is the discussion body with details.",
      "More discussion content here.",
    ].join("\n");

    const result = parseDiscussionFile(content);
    expect(result.id).toBe("DISCUSSION-2026-06-14-test");
    expect(result.title).toBe("Test Discussion");
    expect(result.status).toBe("concluded");
    expect(result.provenance).toBe("collaborative");
    expect(result.tags).toEqual(["mcp", "architecture"]);
    expect(result.outcome).toBe("DECISION-2026-06-14-foo");
    expect(result.createdBy).toEqual({ name: "John Doe", email: "john@example.com" });
    expect(result.bodyText).toContain("This is the discussion body");
  });

  it("sets outcome to 'none' when outcome type is none", () => {
    const content = [
      "---",
      "id: DISCUSSION-2026-06-14-test",
      "title: Test",
      "status: open",
      "outcome:",
      "  type: none",
      "---",
      "# Discussion\nBody",
    ].join("\n");

    const result = parseDiscussionFile(content);
    expect(result.outcome).toBe("none");
  });

  it("sets outcome to 'roadmap' when outcome type is roadmap", () => {
    const content = [
      "---",
      "id: DISCUSSION-2026-06-14-test",
      "title: Test",
      "status: open",
      "outcome:",
      "  type: roadmap",
      "---",
      "# Discussion\nBody",
    ].join("\n");

    const result = parseDiscussionFile(content);
    expect(result.outcome).toBe("roadmap");
  });

  it("bodyText is first 2000 chars of entire body", () => {
    const longBody = "Line of text.\n".repeat(500);
    const content = [
      "---",
      "id: DISCUSSION-2026-06-14-test",
      "title: Test",
      "status: open",
      "outcome:",
      "  type: none",
      "---",
      longBody,
    ].join("\n");

    const result = parseDiscussionFile(content);
    expect(result.bodyText.length).toBeLessThanOrEqual(2000);
  });

  it("throws ParseError when id is missing", () => {
    const content = "---\ntitle: Test\nstatus: open\noutcome:\n  type: none\n---\nBody";
    expect(() => parseDiscussionFile(content)).toThrow(ParseError);
  });

  it("falls back to ID when title and heading are both missing from discussion", () => {
    const content = "---\nid: DISCUSSION-2026-06-14-test\nstatus: open\noutcome:\n  type: none\n---\nBody";
    const result = parseDiscussionFile(content);
    expect(result.title).toBe("DISCUSSION-2026-06-14-test");
  });

  it("throws ParseError when status is missing", () => {
    const content = "---\nid: DISCUSSION-2026-06-14-test\ntitle: Test\noutcome:\n  type: none\n---\nBody";
    expect(() => parseDiscussionFile(content)).toThrow(ParseError);
  });

  it("throws ParseError when outcome is missing", () => {
    const content = "---\nid: DISCUSSION-2026-06-14-test\ntitle: Test\nstatus: open\n---\nBody";
    expect(() => parseDiscussionFile(content)).toThrow(ParseError);
  });
});

// ---------------------------------------------------------------------------
// parseInstructionFile
// ---------------------------------------------------------------------------

describe("parseInstructionFile", () => {
  it("parses a valid INSTRUCTION file", () => {
    const content = [
      "---",
      "id: INSTRUCTION-2026-06-14-test",
      "prompt: Always use TypeScript strict mode.",
      "state: active",
      "created_by:",
      "  name: John Doe",
      "  email: john@example.com",
      "---",
      "# Prompt",
      "Always use TypeScript strict mode.",
      "",
      "# Details",
      "Some details about this instruction.",
    ].join("\n");

    const result = parseInstructionFile(content);
    expect(result.id).toBe("INSTRUCTION-2026-06-14-test");
    expect(result.prompt).toBe("Always use TypeScript strict mode.");
    expect(result.state).toBe("active");
    expect(result.createdBy).toEqual({ name: "John Doe", email: "john@example.com" });
  });

  it("extracts prompt from # Prompt section", () => {
    const content = [
      "---",
      "id: INSTRUCTION-2026-06-14-test",
      "prompt: fallback prompt",
      "state: active",
      "---",
      "# Prompt",
      "This is the prompt text from the section body.",
      "It can span multiple lines.",
    ].join("\n");

    const result = parseInstructionFile(content);
    expect(result.prompt).toContain("This is the prompt text from the section body.");
  });

  it("uses frontmatter prompt as fallback when no # Prompt section", () => {
    const content = [
      "---",
      "id: INSTRUCTION-2026-06-14-test",
      "prompt: frontmatter prompt fallback",
      "state: active",
      "---",
      "# Details",
      "Some details.",
    ].join("\n");

    const result = parseInstructionFile(content);
    expect(result.prompt).toBe("frontmatter prompt fallback");
  });

  it("throws ParseError when id is missing", () => {
    const content = "---\nprompt: test\nstate: active\n---\n# Prompt\nBody";
    expect(() => parseInstructionFile(content)).toThrow(ParseError);
  });

  it("throws ParseError when state is missing", () => {
    const content = "---\nid: INSTRUCTION-2026-06-14-test\nprompt: test\n---\n# Prompt\nBody";
    expect(() => parseInstructionFile(content)).toThrow(ParseError);
  });
});

// ---------------------------------------------------------------------------
// parseAssignmentFile
// ---------------------------------------------------------------------------

// removed: parseAssignmentFile tests — assignment feature dropped 2026-07-29

// ---------------------------------------------------------------------------
// parseNoteFile
// ---------------------------------------------------------------------------

describe("parseNoteFile", () => {
  it("parses a valid NOTE file", () => {
    const content = [
      "---",
      "id: NOTE-2026-06-14-test",
      "title: Test Note",
      "tags:",
      "  - idea",
      "  - research",
      "created_by:",
      "  name: John Doe",
      "  email: john@example.com",
      "created_at: 2026-06-14",
      "updated_at: 2026-06-15",
      "---",
      "# Note",
      "This is the note body content.",
      "",
      "More content here.",
    ].join("\n");

    const result = parseNoteFile(content);
    expect(result.id).toBe("NOTE-2026-06-14-test");
    expect(result.title).toBe("Test Note");
    expect(result.tags).toEqual(["idea", "research"]);
    expect(result.createdBy).toEqual({ name: "John Doe", email: "john@example.com" });
    expect(result.createdAt).toBe("2026-06-14");
    expect(result.updatedAt).toBe("2026-06-15");
    expect(result.body).toContain("This is the note body content.");
  });

  it("body is content after # Note heading (trimmed)", () => {
    const content = [
      "---",
      "id: NOTE-2026-06-14-test",
      "title: Test",
      "created_by:",
      "  name: John",
      "  email: john@example.com",
      "created_at: 2026-06-14",
      "updated_at: 2026-06-14",
      "---",
      "# Note",
      "",
      "  Indented body content.  ",
    ].join("\n");

    const result = parseNoteFile(content);
    expect(result.body).toBe("Indented body content.");
  });

  it("body is empty string when no # Note section", () => {
    const content = [
      "---",
      "id: NOTE-2026-06-14-test",
      "title: Test",
      "created_by:",
      "  name: John",
      "  email: john@example.com",
      "created_at: 2026-06-14",
      "updated_at: 2026-06-14",
      "---",
      "No heading here.",
    ].join("\n");

    const result = parseNoteFile(content);
    expect(result.body).toBe("");
  });

  it("uses frontmatter title as fallback for id when id missing", () => {
    const content = [
      "---",
      "title: Some Note Title",
      "created_by:",
      "  name: John",
      "  email: john@example.com",
      "created_at: 2026-06-14",
      "updated_at: 2026-06-14",
      "---",
      "# Note",
      "Body.",
    ].join("\n");

    const result = parseNoteFile(content);
    expect(result.title).toBe("Some Note Title");
  });

  it("throws ParseError when created_by is missing", () => {
    const content = [
      "---",
      "id: NOTE-2026-06-14-test",
      "title: Test",
      "created_at: 2026-06-14",
      "updated_at: 2026-06-14",
      "---",
      "# Note",
      "Body",
    ].join("\n");

    expect(() => parseNoteFile(content)).toThrow(ParseError);
  });

  it("throws ParseError when created_at is missing", () => {
    const content = [
      "---",
      "id: NOTE-2026-06-14-test",
      "title: Test",
      "created_by:",
      "  name: John",
      "  email: john@example.com",
      "updated_at: 2026-06-14",
      "---",
      "# Note",
      "Body",
    ].join("\n");

    expect(() => parseNoteFile(content)).toThrow(ParseError);
  });

  it("throws ParseError when updated_at is missing", () => {
    const content = [
      "---",
      "id: NOTE-2026-06-14-test",
      "title: Test",
      "created_by:",
      "  name: John",
      "  email: john@example.com",
      "created_at: 2026-06-14",
      "---",
      "# Note",
      "Body",
    ].join("\n");

    expect(() => parseNoteFile(content)).toThrow(ParseError);
  });
});
