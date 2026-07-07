import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexAssignment } from "../../src/tools/index_assignment";
import { searchMemory } from "../../src/tools/search_memory";

let tmp: TmpDir;

beforeAll(() => {
  tmp = createTmpDir();
  process.env.PROJECT_MEMORY_DIR = tmp.dir;
});

afterAll(() => {
  try {
    tmp.cleanup();
  } catch {
    // LanceDB may hold file handles open on Windows; cleanup is best-effort
  }
});

describe("indexAssignment + searchMemory roundtrip", () => {
  it("indexes an assignment and retrieves it via semantic search", async () => {
    const result = await indexAssignment({
      id: "ASSIGNMENT-2026-06-23-onboarding-task",
      status: "pending",
      type: "freeform",
      assignedTo: { name: "Other Dev", email: "other@example.com" },
      assignedBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      assignedAt: "2026-06-23",
      targetType: null,
      targetId: null,
      description:
        "Write onboarding documentation covering project-memory MCP installation steps.",
      rejectedAt: null,
      rejectionReason: null,
      completedAt: null,
      completionNote: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 0,
      lastRemindedAt: null,
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
    });

    expect(result.success).toBe(true);

    const results = await searchMemory(
      "onboarding documentation MCP installation",
      5,
      false,
      undefined,
      undefined,
      "assignment"
    );

    const match = results.find(
      (r) => r.id === "ASSIGNMENT-2026-06-23-onboarding-task"
    );
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.3);
  });

  it("assigned_to_email filter restricts results to a specific assignee", async () => {
    await indexAssignment({
      id: "ASSIGNMENT-2026-06-23-self-task",
      status: "pending",
      type: "freeform",
      assignedTo: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      assignedBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
      assignedAt: "2026-06-23",
      targetType: null,
      targetId: null,
      description: "Self-assigned reminder to review the latest MCP changes.",
      rejectedAt: null,
      rejectionReason: null,
      completedAt: null,
      completionNote: null,
      completedDecisionId: null,
      completedDiscussionId: null,
      remindCount: 0,
      lastRemindedAt: null,
      createdBy: { name: "Hakan Ozakar", email: "hozakar@gmail.com" },
    });

    const results = await searchMemory(
      "reminder review MCP changes",
      10,
      false,
      undefined,
      undefined,
      "assignment",
      undefined,
      undefined,
      "other@example.com"
    );

    expect(
      results.find((r) => r.id === "ASSIGNMENT-2026-06-23-self-task")
    ).toBeUndefined();
  });
});
