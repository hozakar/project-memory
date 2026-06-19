import { describe, it, expect } from "vitest";
import { validateMemoryId } from "../../src/validation.js";

describe("validateMemoryId", () => {
  it("accepts valid phase IDs", () => {
    expect(() => validateMemoryId("phase-20260619-my-phase")).not.toThrow();
  });

  it("accepts valid decision IDs", () => {
    expect(() => validateMemoryId("DECISION-2026-06-19-my-decision")).not.toThrow();
  });

  it("accepts valid discussion IDs", () => {
    expect(() => validateMemoryId("DISCUSSION-2026-06-19-my-discussion")).not.toThrow();
  });

  it("rejects path traversal with forward slash", () => {
    expect(() => validateMemoryId("../etc/passwd")).toThrow("Invalid memory ID");
  });

  it("rejects path traversal with backslash", () => {
    expect(() => validateMemoryId("..\\etc\\passwd")).toThrow("Invalid memory ID");
  });

  it("rejects null bytes", () => {
    expect(() => validateMemoryId("phase\x00evil")).toThrow("Invalid memory ID");
  });

  it("rejects Windows ADS colon", () => {
    expect(() => validateMemoryId("phase:evil")).toThrow("Invalid memory ID");
  });

  it("rejects empty string", () => {
    expect(() => validateMemoryId("")).toThrow("Invalid memory ID");
  });

  it("rejects space", () => {
    expect(() => validateMemoryId("phase 20260619")).toThrow("Invalid memory ID");
  });
});
