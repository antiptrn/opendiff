import { describe, expect, it } from "bun:test";
import { loadPrompt } from "./load-prompt";

describe("loadPrompt", () => {
  it("should load a prompt file and return its content", () => {
    const result = loadPrompt("generate-summary");
    expect(result).toContain("You are summarizing an AI code review");
    expect(result).toContain("{pullTitle}");
  });

  it("should substitute variables when provided", () => {
    const result = loadPrompt("generate-summary", {
      pullTitle: "Fix auth bug",
      pullAuthor: "alice",
      headBranch: "fix/auth",
      baseBranch: "main",
    });
    expect(result).toContain("**Title:** Fix auth bug");
    expect(result).toContain("**Author:** alice");
    expect(result).toContain("fix/auth → main");
    // Variables not provided should remain as placeholders
    expect(result).toContain("{cloneContext}");
    expect(result).toContain("{filesChanged}");
  });

  it("should leave unmatched placeholders intact", () => {
    const result = loadPrompt("generate-summary", {});
    expect(result).toContain("{pullTitle}");
    expect(result).toContain("{pullAuthor}");
  });

  it("should throw for non-existent prompt file", () => {
    expect(() => loadPrompt("nonexistent-prompt")).toThrow();
  });
});
