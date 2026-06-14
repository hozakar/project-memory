import { describe, it, expect } from "vitest";
import {
  buildPhaseText,
  buildDecisionText,
  buildDiscussionText,
  buildCommitText,
  buildEraText,
  buildInstructionText,
  buildAssignmentText,
} from "../../src/utils";

describe("buildPhaseText", () => {
  it("joins title, tags, planText, implementationText, and commit diffs", () => {
    const result = buildPhaseText({
      id: "phase-20260614-test",
      title: "Test Phase",
      tags: ["mcp", "test"],
      planText: "plan content",
      implementationText: "impl content",
      commitDiffs: [{ hash: "abc123", message: "feat: add X", files: ["src/a.ts"], diffSnippet: "+line" }],
      status: "completed",
    });
    expect(result).toContain("Test Phase");
    expect(result).toContain("mcp test");
    expect(result).toContain("plan content");
    expect(result).toContain("impl content");
    expect(result).toContain("feat: add X");
    expect(result).toContain("src/a.ts");
  });

  it("handles undefined tags without throwing (null-safe join)", () => {
    const result = buildPhaseText({
      id: "phase-test",
      title: "No Tags",
      tags: undefined as unknown as string[],
      planText: "",
      implementationText: "",
      commitDiffs: [],
      status: "completed",
    });
    expect(result).toContain("No Tags");
  });

  it("truncates output to 6000 characters", () => {
    const result = buildPhaseText({
      id: "phase-test",
      title: "T",
      tags: [],
      planText: "x".repeat(7000),
      implementationText: "",
      commitDiffs: [],
      status: "completed",
    });
    expect(result.length).toBe(6000);
  });
});

describe("buildDecisionText", () => {
  it("joins title, status, context, and decision body", () => {
    const result = buildDecisionText({
      id: "DECISION-2026-06-14-test",
      title: "Test Decision",
      status: "active",
      context: "ctx",
      decisionBody: "body",
      touches: ["file_a", "file_b"],
    });
    expect(result).toContain("Test Decision");
    expect(result).toContain("active");
    expect(result).toContain("file_a file_b");
    expect(result).toContain("ctx");
    expect(result).toContain("body");
  });

  it("handles undefined touches without throwing (null-safe join)", () => {
    const result = buildDecisionText({
      id: "DECISION-test",
      title: "T",
      status: "active",
      context: "",
      decisionBody: "",
      touches: undefined as unknown as string[],
    });
    expect(result).toContain("T");
  });
});

describe("buildDiscussionText", () => {
  it("handles undefined tags without throwing (null-safe join)", () => {
    const result = buildDiscussionText({
      id: "DISCUSSION-test",
      title: "T",
      status: "concluded",
      outcome: "none",
      tags: undefined as unknown as string[],
      summary: "s",
      bodyText: "b",
    });
    expect(result).toContain("T");
  });
});

describe("buildCommitText", () => {
  it("joins message, files, and diff snippet", () => {
    const result = buildCommitText({
      hash: "deadbeef",
      message: "fix: bug",
      files: ["src/db.ts"],
      diffSnippet: "-old\n+new",
    });
    expect(result).toContain("fix: bug");
    expect(result).toContain("src/db.ts");
    expect(result).toContain("-old\n+new");
  });
});

describe("buildEraText", () => {
  it("includes id, title, dateRange, phases, and narrative", () => {
    const result = buildEraText({
      id: "era-001",
      title: "Era 1",
      phases: ["phase-a", "phase-b"],
      dateRange: "2026-06-08 to 2026-06-11",
      narrative: "narrative text",
    });
    expect(result).toContain("era-001");
    expect(result).toContain("Era 1");
    expect(result).toContain("phase-a phase-b");
    expect(result).toContain("narrative text");
  });
});

describe("buildInstructionText", () => {
  it("joins id, state, prompt, and optional origin", () => {
    const result = buildInstructionText({
      id: "INSTRUCTION-2026-06-13-test",
      prompt: "always use TDD",
      state: "active",
    });
    expect(result).toContain("INSTRUCTION-2026-06-13-test");
    expect(result).toContain("always use TDD");
    expect(result).toContain("active");
  });
});

describe("buildAssignmentText", () => {
  it("includes assignee, assigner, and description for freeform", () => {
    const result = buildAssignmentText({
      id: "ASSIGNMENT-2026-06-14-test",
      status: "pending",
      type: "freeform",
      assignedTo: { name: "Mehmet", email: "mehmet@example.com" },
      assignedBy: { name: "Hakan", email: "hakan@example.com" },
      assignedAt: "2026-06-14",
      targetType: null,
      targetId: null,
      description: "Review the auth module",
      rejectedAt: null,
      rejectionReason: null,
      completedAt: null,
      completionNote: null,
      completedPhaseId: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 0,
      lastRemindedAt: null,
    });
    expect(result).toContain("Mehmet");
    expect(result).toContain("Review the auth module");
    expect(result).toContain("pending");
  });

  it("includes target info for direct type", () => {
    const result = buildAssignmentText({
      id: "ASSIGNMENT-2026-06-14-direct",
      status: "accepted",
      type: "direct",
      assignedTo: { name: "Ahmet", email: "ahmet@example.com" },
      assignedBy: { name: "Hakan", email: "hakan@example.com" },
      assignedAt: "2026-06-14",
      targetType: "issue",
      targetId: "ISSUE-2026-06-14-foo",
      description: null,
      rejectedAt: null,
      rejectionReason: null,
      completedAt: null,
      completionNote: null,
      completedPhaseId: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 0,
      lastRemindedAt: null,
    });
    expect(result).toContain("issue ISSUE-2026-06-14-foo");
  });

  it("includes rejection reason when status is rejected", () => {
    const result = buildAssignmentText({
      id: "ASSIGNMENT-2026-06-14-rejected",
      status: "rejected",
      type: "freeform",
      assignedTo: { name: "Ahmet", email: "ahmet@example.com" },
      assignedBy: { name: "Hakan", email: "hakan@example.com" },
      assignedAt: "2026-06-14",
      targetType: null,
      targetId: null,
      description: "some task",
      rejectedAt: "2026-06-15",
      rejectionReason: "not my area",
      completedAt: null,
      completionNote: null,
      completedPhaseId: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 1,
      lastRemindedAt: "2026-06-14",
    });
    expect(result).toContain("not my area");
    expect(result).toContain("2026-06-15");
  });
});
