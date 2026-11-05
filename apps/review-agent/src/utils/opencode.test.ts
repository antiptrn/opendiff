import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { OpenCodeAuthError, isOpenCodeAuthError, runOpencodePrompt } from "./opencode";

const prompt = mock();
const close = mock();

mock.module("./opencode-server", () => ({
  createManagedOpencode: mock(async () => ({
    client: {
      session: {
        create: mock(async () => ({ data: { id: "test-session" } })),
        prompt,
      },
    },
    server: { close },
  })),
}));
mock.module("./opencode-auth", () => ({
  shouldUseOpencodeAuthJson: () => false,
}));
mock.module("./opencode-runtime", () => ({
  resolveOpencodeRuntime: () => ({}),
}));

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

describe("runOpencodePrompt response selection", () => {
  const structured = {
    acceptedIssueIndices: [0],
    summary: "Verified finding",
    mergeSafety: "Fix before merging",
    verdict: "request_changes",
  };
  const format = { type: "json_schema" as const, schema: { type: "object" } };

  let previousPassword: string | undefined;
  beforeEach(() => {
    prompt.mockClear();
    close.mockClear();
    previousPassword = process.env.OPENCODE_SERVER_PASSWORD;
    process.env.OPENCODE_SERVER_PASSWORD = "";
  });

  afterEach(() => {
    if (previousPassword === undefined)
      Reflect.deleteProperty(process.env, "OPENCODE_SERVER_PASSWORD");
    else process.env.OPENCODE_SERVER_PASSWORD = previousPassword;
  });

  it.each([true, false])("prefers structured output with text (wrapped=%s)", async (wrapped) => {
    const payload = {
      info: { structured_output: structured, tokens: { input: 10, output: 5 } },
      parts: [{ type: "text", text: "Here are the verification results." }],
    };
    prompt.mockResolvedValue(wrapped ? { data: payload } : payload);

    const result = await runOpencodePrompt({
      cwd: process.cwd(),
      prompt: "Verify review scope",
      mode: "read_only",
      format,
    });

    expect(result).toEqual({ text: JSON.stringify(structured), tokensUsed: 15 });
    expect(prompt).toHaveBeenCalledWith({
      path: { id: "test-session" },
      body: { parts: [{ type: "text", text: "Verify review scope" }], format },
    });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, null])("falls back to text when structured output is %s", async (value) => {
    const text = JSON.stringify(structured);
    prompt.mockResolvedValue({
      data: {
        info: { structured_output: value },
        parts: [{ type: "text", text }],
      },
    });

    const result = await runOpencodePrompt({
      cwd: process.cwd(),
      prompt: "Verify review scope",
      mode: "read_only",
      format,
    });

    expect(result.text).toBe(text);
  });
});
