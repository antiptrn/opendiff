import { describe, expect, it } from "vitest";
import { OpenCodeAuthError, isOpenCodeAuthError } from "./opencode";

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
