import { mock } from "bun:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileToReview } from "./types";

// Mock the Agent SDK query function
let mockQueryResult = "";
let mockQueryShouldFail = false;
let mockQueryError = "Agent failed";
let lastQueryArgs: unknown = null;

mock.module("@anthropic-ai/claude-agent-sdk", () => ({
  query: async function* (args: unknown) {
    lastQueryArgs = args;
    if (mockQueryShouldFail) {
      yield {
        type: "result",
        subtype: "error",
        errors: [mockQueryError],
      };
    } else {
      yield {
        type: "result",
        subtype: "success",
        result: mockQueryResult,
      };
    }
  },
}));

// Import after mocking
import { CodeReviewAgent } from "./reviewer";

describe("CodeReviewAgent", () => {
  let agent: CodeReviewAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryShouldFail = false;
    lastQueryArgs = null;
    mockQueryResult = JSON.stringify({
      summary: "LGTM",
      issues: [],
      verdict: "approve",
    });
    agent = new CodeReviewAgent();
  });

  describe("reviewFiles", () => {
    it("should analyze files and return structured review", async () => {
      const files: FileToReview[] = [
        {
          filename: "src/auth.ts",
          patch: "@@ -0,0 +1,5 @@\n+function login...",
        },
      ];

      mockQueryResult = JSON.stringify({
        summary: "Found critical security vulnerability in authentication code.",
        issues: [
          {
            type: "security",
            severity: "critical",
            file: "src/auth.ts",
            line: 3,
            message: "SQL injection vulnerability detected",
            suggestion: "Use parameterized queries instead of string concatenation",
          },
        ],
        verdict: "request_changes",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Add login feature", prBody: "Implements user authentication" },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("request_changes");
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].type).toBe("security");
      expect(result.issues[0].severity).toBe("critical");
    });

    it("should approve clean code", async () => {
      const files: FileToReview[] = [
        {
          filename: "src/utils.ts",
        },
      ];

      mockQueryResult = JSON.stringify({
        summary: "Code looks good. Clean utility function with proper typing.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Add date utility", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
      expect(result.issues).toHaveLength(0);
    });

    it("should prefer CLAUDE_CODE_OAUTH_TOKEN over ANTHROPIC_API_KEY", async () => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-test";
      process.env.CLAUDE_CODE_OAUTH_TOKEN = "test-oauth-token";

      await agent.reviewFiles(
        [{ filename: "src/utils.ts" }],
        { prTitle: "Test auth", prBody: null },
        "/tmp/test-repo"
      );

      const args = lastQueryArgs as
        | { options?: { env?: Record<string, string> } }
        | null
        | undefined;
      expect(args?.options?.env?.CLAUDE_CODE_OAUTH_TOKEN).toBe("test-oauth-token");
      expect(args?.options?.env?.ANTHROPIC_API_KEY).toBeUndefined();
    });

    it("should detect multiple issues across files", async () => {
      const files: FileToReview[] = [{ filename: "src/api.ts" }, { filename: "src/db.ts" }];

      mockQueryResult = JSON.stringify({
        summary: "Multiple issues found across files.",
        issues: [
          {
            type: "style",
            severity: "warning",
            file: "src/api.ts",
            line: 1,
            message: "Use const/let instead of var",
          },
          {
            type: "security",
            severity: "critical",
            file: "src/db.ts",
            line: 1,
            message: "Never use eval with user input",
          },
        ],
        verdict: "request_changes",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Various changes", prBody: "" },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(2);
      expect(result.issues.map((i) => i.file)).toContain("src/api.ts");
      expect(result.issues.map((i) => i.file)).toContain("src/db.ts");
    });

    it("should handle agent errors gracefully", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockQueryShouldFail = true;
      mockQueryError = "API rate limit exceeded";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("API rate limit exceeded");
    });

    it("should handle malformed JSON response", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockQueryResult = "not valid json {{{";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });

    it("should filter non-actionable praise issues", async () => {
      const files: FileToReview[] = [{ filename: "src/select.tsx" }];

      mockQueryResult = JSON.stringify({
        summary: "Mostly good changes.",
        issues: [
          {
            type: "style",
            severity: "suggestion",
            file: "src/select.tsx",
            line: 143,
            message: "semantic HTML improvement: h3 changed to span",
            description:
              "This change is correct and improves semantic HTML. No action needed - this is a positive improvement.",
            suggestion: "No action needed.",
          },
        ],
        verdict: "comment",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Refactor Select item wrapper", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(0);
      expect(result.verdict).toBe("approve");
    });
  });

  describe("edge cases", () => {
    it("should handle empty files array", async () => {
      const files: FileToReview[] = [];

      mockQueryResult = JSON.stringify({
        summary: "No files to review.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Empty PR", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
      expect(result.issues).toHaveLength(0);
    });

    it("should handle JSON response wrapped in markdown code block", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockQueryResult = '```json\n{"summary": "LGTM", "issues": [], "verdict": "approve"}\n```';

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
      expect(result.summary).toBe("LGTM");
    });

    it("should handle response with extra whitespace around JSON", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockQueryResult = '  \n  {"summary": "LGTM", "issues": [], "verdict": "approve"}  \n  ';

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
    });

    it("should handle PR with null body", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockQueryResult = JSON.stringify({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });

      // Should not crash with null body
      const result = await agent.reviewFiles(
        files,
        { prTitle: "No description", prBody: null },
        "/tmp/test-repo"
      );

      expect(result).toBeDefined();
    });

    it("should handle PR with empty string body", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockQueryResult = JSON.stringify({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });

      // Should not crash with empty body
      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: "" },
        "/tmp/test-repo"
      );

      expect(result).toBeDefined();
    });

    it("should handle issue with line number 0", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockQueryResult = JSON.stringify({
        summary: "Issue at line 0",
        issues: [
          {
            type: "style",
            severity: "warning",
            file: "test.ts",
            line: 0,
            message: "General comment",
          },
        ],
        verdict: "comment",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues[0].line).toBe(0);
    });

    it("should handle empty result from agent", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockQueryResult = "";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });
  });

  describe("respondToComment", () => {
    it("should respond to conversation", async () => {
      const conversation = [{ user: "developer", body: "Why did you flag this?" }];

      mockQueryResult = "This was flagged because of potential security issues.";

      const response = await agent.respondToComment(conversation, "/tmp/test-repo", {
        filename: "test.ts",
        diff: "+new code",
      });

      expect(response).toContain("security");
    });

    it("should handle agent failure in conversation", async () => {
      const conversation = [{ user: "developer", body: "Question?" }];
      mockQueryShouldFail = true;
      mockQueryError = "Agent failed";

      await expect(agent.respondToComment(conversation, "/tmp/test-repo")).rejects.toThrow(
        "Agent failed"
      );
    });

    it("should handle empty response", async () => {
      const conversation = [{ user: "developer", body: "Question?" }];
      mockQueryResult = "";

      await expect(agent.respondToComment(conversation, "/tmp/test-repo")).rejects.toThrow(
        "Failed to get response"
      );
    });
  });
});
