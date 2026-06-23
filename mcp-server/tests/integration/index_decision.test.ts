import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTmpDir, type TmpDir } from "./helpers/tmp-db";
import { indexDecision } from "../../src/tools/index_decision";
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

describe("indexDecision + searchMemory roundtrip", () => {
  it("indexes a decision and retrieves it via semantic search", async () => {
    const result = await indexDecision({
      id: "DECISION-2026-06-23-onnx-runtime-choice",
      title: "Use ONNX runtime for local embeddings",
      status: "active",
      primaryScope: "constraint",
      context:
        "We need a fast, dependency-light way to compute MiniLM embeddings locally without shipping Python.",
      decisionBody:
        "Adopt @huggingface/transformers ONNX runtime. Ships a wasm/native backend, no Python dependency, supported on Windows/macOS/Linux.",
      touches: ["embedder_ts", "embedding_runtime"],
    });

    expect(result.success).toBe(true);

    const results = await searchMemory("ONNX MiniLM local embedding runtime", 5);

    const match = results.find(
      (r) => r.id === "DECISION-2026-06-23-onnx-runtime-choice"
    );
    expect(match).toBeDefined();
    expect(match!.similarity).toBeGreaterThan(0.3);
  });

  it("scope_filter restricts results to a specific primary_scope", async () => {
    await indexDecision({
      id: "DECISION-2026-06-23-workflow-pick",
      title: "Pre-commit hook layout",
      status: "active",
      primaryScope: "workflow",
      context: "Where to mount lint hooks.",
      decisionBody: "Use lint-staged under husky pre-commit.",
      touches: ["package_json", "husky"],
    });

    const results = await searchMemory(
      "decision",
      10,
      false,
      undefined,
      undefined,
      "decision",
      undefined,
      undefined,
      undefined,
      undefined,
      ["constraint"]
    );

    expect(results.find((r) => r.id === "DECISION-2026-06-23-workflow-pick")).toBeUndefined();
    expect(
      results.find((r) => r.id === "DECISION-2026-06-23-onnx-runtime-choice")
    ).toBeDefined();
  });

  it("superseded decisions are excluded by default", async () => {
    await indexDecision({
      id: "DECISION-2026-06-23-superseded-example",
      title: "Old approach we replaced",
      status: "superseded",
      primaryScope: "constraint",
      context: "Old context.",
      decisionBody: "Old approach text.",
      touches: ["something_old"],
    });

    const results = await searchMemory(
      "old approach",
      5,
      false,
      undefined,
      undefined,
      "decision"
    );

    expect(
      results.find((r) => r.id === "DECISION-2026-06-23-superseded-example")
    ).toBeUndefined();
  });
});
