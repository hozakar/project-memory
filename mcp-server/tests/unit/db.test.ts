import { describe, it, expect } from "vitest";
import { escapeLike } from "../../src/db";

describe("escapeLike", () => {
  it("escapes single quotes by doubling them", () => {
    expect(escapeLike("O'Brien")).toBe("O''Brien");
  });

  it("returns unchanged string when no single quotes present", () => {
    expect(escapeLike("normal-value")).toBe("normal-value");
  });

  it("handles multiple single quotes", () => {
    expect(escapeLike("it's a 'test'")).toBe("it''s a ''test''");
  });

  it("handles empty string", () => {
    expect(escapeLike("")).toBe("");
  });
});
