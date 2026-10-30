import { describe, expect, it } from "vitest";
import { resolveOpencodeRuntime } from "./opencode-runtime";

describe("OpenCode task model routing", () => {
  const globals = { OPENCODE_MODEL: "openai/global", OPENCODE_REASONING_EFFORT: "medium" };
  const split = {
    ...globals,
    OPENCODE_REVIEW_MODEL: "openai/gpt-6.1-terra",
    OPENCODE_REVIEW_REASONING_EFFORT: "max",
    OPENCODE_AUTOFIX_MODEL: "openai/gpt-6.1-sol",
    OPENCODE_AUTOFIX_REASONING_EFFORT: "high",
  };

  it("preserves global defaults for both tasks when no overrides are configured", () => {
    for (const task of ["review", "autofix"] as const) {
      expect(resolveOpencodeRuntime(task, null, globals)).toEqual({
        model: "openai/global",
        reasoningEffort: "medium",
      });
    }
    expect(resolveOpencodeRuntime("review", null, {})).toEqual({
      model: undefined,
      reasoningEffort: undefined,
    });
  });

  it("selects independent review and autofix models and reasoning efforts", () => {
    expect(resolveOpencodeRuntime("review", null, split)).toEqual({
      model: "openai/gpt-6.1-terra",
      reasoningEffort: "max",
    });
    expect(resolveOpencodeRuntime("autofix", null, split)).toEqual({
      model: "openai/gpt-6.1-sol",
      reasoningEffort: "high",
    });
    expect(split.OPENCODE_MODEL).toBe("openai/global");
  });

  it("falls back independently for an unspecified model or effort", () => {
    expect(
      resolveOpencodeRuntime("autofix", null, {
        ...globals,
        OPENCODE_AUTOFIX_MODEL: "anthropic/custom",
      })
    ).toEqual({ model: "anthropic/custom", reasoningEffort: "medium" });
    expect(
      resolveOpencodeRuntime("review", null, {
        ...globals,
        OPENCODE_REVIEW_REASONING_EFFORT: "high",
      })
    ).toEqual({ model: "openai/global", reasoningEffort: "high" });
  });

  it("keeps organization model selection and legacy reasoning when using its credentials", () => {
    for (const task of ["review", "autofix"] as const) {
      expect(resolveOpencodeRuntime(task, { model: "anthropic/byok" }, split)).toEqual({
        model: "anthropic/byok",
        reasoningEffort: "medium",
      });
    }
  });

  it("trims overrides and treats blank settings as unset", () => {
    expect(
      resolveOpencodeRuntime("autofix", undefined, {
        ...globals,
        OPENCODE_AUTOFIX_MODEL: "  openai/other  ",
        OPENCODE_AUTOFIX_REASONING_EFFORT: " HIGH ",
      })
    ).toEqual({ model: "openai/other", reasoningEffort: "high" });
    expect(
      resolveOpencodeRuntime("review", null, {
        ...globals,
        OPENCODE_REVIEW_MODEL: "  ",
        OPENCODE_REVIEW_REASONING_EFFORT: " ",
      })
    ).toEqual({ model: "openai/global", reasoningEffort: "medium" });
  });

  it("rejects an invalid scoped effort instead of silently running at a different effort", () => {
    expect(() =>
      resolveOpencodeRuntime("autofix", null, {
        ...globals,
        OPENCODE_AUTOFIX_REASONING_EFFORT: "typo",
      })
    ).toThrow("OPENCODE_AUTOFIX_REASONING_EFFORT");
    expect(
      resolveOpencodeRuntime("review", null, {
        ...globals,
        OPENCODE_REASONING_EFFORT: "legacy-typo",
      }).reasoningEffort
    ).toBeUndefined();
    expect(() =>
      resolveOpencodeRuntime("review", null, {
        ...globals,
        OPENCODE_AUTOFIX_REASONING_EFFORT: "typo",
      })
    ).not.toThrow();
  });
});
