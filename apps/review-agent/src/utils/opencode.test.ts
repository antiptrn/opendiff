import { describe, expect, it } from "vitest";
import { OpenCodeAuthError, executionLaneForMode, isOpenCodeAuthError } from "./opencode";

function restoreExecutionMode(value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, "OPENCODE_EXECUTION_MODE");
  } else {
    process.env.OPENCODE_EXECUTION_MODE = value;
  }
}

describe("OpenCode auth error detection", () => {
  it("identifies typed OpenCode auth errors", () => {
    expect(isOpenCodeAuthError(new OpenCodeAuthError())).toBe(true);
  });

  it("identifies token refresh 401 errors from OpenCode", () => {
    expect(isOpenCodeAuthError(new Error("UnknownError: Token refresh failed: 401"))).toBe(true);
  });

  it("does not treat unrelated provider errors as auth failures", () => {
    expect(isOpenCodeAuthError(new Error("OpenCode provider error: rate limit exceeded"))).toBe(
      false
    );
  });
});

describe("OpenCode execution mode", () => {
  it("uses separate lanes by default", () => {
    const previousMode = process.env.OPENCODE_EXECUTION_MODE;
    Reflect.deleteProperty(process.env, "OPENCODE_EXECUTION_MODE");

    try {
      expect(executionLaneForMode("read_only")).toBe("read");
      expect(executionLaneForMode("read_write")).toBe("write");
    } finally {
      restoreExecutionMode(previousMode);
    }
  });

  it("uses one shared lane in serial mode", () => {
    const previousMode = process.env.OPENCODE_EXECUTION_MODE;
    process.env.OPENCODE_EXECUTION_MODE = "serial";

    try {
      expect(executionLaneForMode("read_only")).toBe("shared");
      expect(executionLaneForMode("read_write")).toBe("shared");
      expect(executionLaneForMode("no_tools")).toBe("shared");
    } finally {
      restoreExecutionMode(previousMode);
    }
  });
});
