import { describe, it, expect } from "vitest";
import {
  buildPhaseText,
  buildDecisionText,
  buildDiscussionText,
  buildCommitText,
  buildEraText,
  buildInstructionText,
  buildAssignmentText,
  deriveOutcomeType,
  cosine,
  mmrRerank,
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

describe("deriveOutcomeType", () => {
  it('returns "none" for the literal "none"', () => {
    expect(deriveOutcomeType("none")).toBe("none");
  });

  it('returns "phase" for phase-prefix outcomes', () => {
    expect(deriveOutcomeType("phase-20260612-foo")).toBe("phase");
  });

  it('returns "decision" for DECISION-prefix outcomes', () => {
    expect(deriveOutcomeType("DECISION-2026-06-12-bar")).toBe("decision");
  });

  it('returns "roadmap" for roadmap outcome', () => {
    expect(deriveOutcomeType("roadmap")).toBe("roadmap");
  });

  it('returns "none" for empty string', () => {
    expect(deriveOutcomeType("")).toBe("none");
  });

  it('returns "none" for unknown format (default fallback)', () => {
    expect(deriveOutcomeType("unknown-format")).toBe("none");
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

describe("cosine", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0];
    expect(cosine(v, v)).toBeCloseTo(1, 6);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosine([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
  });

  it("returns 0 for zero vector", () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });
});

describe("mmrRerank", () => {
  // Synthetic 3D vectors: query at [1,0,0], two near-duplicates at [0.99,0.01,0],
  // a moderately relevant diverse record at [0.7,0.7,0], and an unrelated record at [0,0,1].
  // Distances precomputed as L2 (matching LanceDB _distance for normalized vectors).
  // C has high enough query relevance and is diverse from A, so at lambda=0.7
  // the MMR score for C beats B (near-duplicate of A) for the second pick.
  const queryVec = [1, 0, 0];
  const rows = [
    { id: "A", vector: [0.99, 0.01, 0], _distance: 0.10 },  // near-duplicate 1
    { id: "B", vector: [0.99, 0.02, 0], _distance: 0.11 },  // near-duplicate 2
    { id: "C", vector: [0.7, 0.7, 0], _distance: 0.50 },    // moderately relevant, diverse from A
    { id: "D", vector: [0, 0, 1], _distance: 1.35 },        // unrelated
  ];

  it("returns all indices when topK >= rows.length", () => {
    const result = mmrRerank(queryVec, rows, 0.7, 5);
    expect(result).toHaveLength(4);
    expect(new Set(result)).toEqual(new Set([0, 1, 2, 3]));
  });

  it("first pick is the max-similarity row (P@1 preserved)", () => {
    const result = mmrRerank(queryVec, rows, 0.7, 3);
    expect(result[0]).toBe(0); // row A has lowest _distance = highest sim
  });

  it("with lambda=0.7, second pick diversifies away from near-duplicate", () => {
    // Row A is top-1. Row B is near-duplicate of A. With lambda=0.7, MMR should
    // prefer C or D (diverse) over B (near-duplicate) for the second pick.
    const result = mmrRerank(queryVec, rows, 0.7, 3);
    expect(result[1]).not.toBe(1); // not the near-duplicate B
  });

  it("with lambda=1.0, degenerates to similarity sort (no diversity)", () => {
    // lambda=1.0 ignores diversity penalty entirely => picks by similarity only.
    // Both A and B have _distance=0.01, so A (first in array) is picked first,
    // B (second with same sim) is picked second.
    const result = mmrRerank(queryVec, rows, 1.0, 3);
    expect(result[0]).toBe(0); // A (first among equal sim)
    const secondPick = result[1];
    // At lambda=1.0, diversity penalty is zero, so the second pick is max querySim.
    // Index 0 is already selected, index 1 has the next highest querySim.
    expect(secondPick).toBe(1);
  });

  it("with lambda=0.0, pure diversity (first pick still max sim, rest maximally diverse)", () => {
    const result = mmrRerank(queryVec, rows, 0.0, 3);
    expect(result[0]).toBe(0); // first pick always max sim
    // Subsequent picks maximize diversity from selected.
    expect(result).toHaveLength(3);
  });

  it("handles empty rows", () => {
    const result = mmrRerank(queryVec, [], 0.7, 3);
    expect(result).toEqual([]);
  });

  it("handles single row", () => {
    const result = mmrRerank(queryVec, [rows[0]], 0.7, 3);
    expect(result).toEqual([0]);
  });
});
