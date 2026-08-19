import { mock } from "bun:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileToReview } from "./types";

let mockPromptResult = "";
let mockPromptShouldFail = false;
let mockPromptError = "Agent failed";
let lastPromptArgs: unknown = null;

mock.module("../utils/opencode", () => ({
  runOpencodePrompt: async (args: unknown) => {
    lastPromptArgs = args;
    if (mockPromptShouldFail) {
      throw new Error(mockPromptError);
    }

    return {
      text: mockPromptResult,
      tokensUsed: 123,
    };
  },
}));

import { CodeReviewAgent } from "./reviewer";

describe("CodeReviewAgent", () => {
  let agent: CodeReviewAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPromptShouldFail = false;
    lastPromptArgs = null;
    mockPromptResult = JSON.stringify({
      summary: "LGTM",
      mergeSafety: "Safe to merge. The reviewed changes do not introduce blocking risk.",
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

      mockPromptResult = JSON.stringify({
        summary: "Found critical security vulnerability in authentication code.",
        mergeSafety:
          "Not safe to merge. The authentication changes expose a concrete SQL injection risk that must be fixed before release.",
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

      mockPromptResult = JSON.stringify({
        summary: "Code looks good. Clean utility function with proper typing.",
        mergeSafety:
          "Safe to merge. The utility change is isolated and does not introduce behavior, security, or performance risk.",
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

    it("should run in read-only mode", async () => {
      await agent.reviewFiles(
        [{ filename: "src/utils.ts" }],
        { prTitle: "Test auth", prBody: null },
        "/tmp/test-repo"
      );

      const args = lastPromptArgs as { mode?: string; cwd?: string } | null | undefined;
      expect(args?.mode).toBe("read_only");
      expect(args?.cwd).toBe("/tmp/test-repo");
    });

    it("should detect multiple issues across files", async () => {
      const files: FileToReview[] = [{ filename: "src/api.ts" }, { filename: "src/db.ts" }];

      mockPromptResult = JSON.stringify({
        summary: "Multiple issues found across files.",
        mergeSafety:
          "Not safe to merge. The changed files include a critical security issue and a maintainability issue that should be addressed first.",
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
      mockPromptShouldFail = true;
      mockPromptError = "API rate limit exceeded";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("API rate limit exceeded");
    });

    it("should handle malformed JSON response", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockPromptResult = "not valid json {{{";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });

    it("should reject review responses without generated merge safety", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];
      mockPromptResult = JSON.stringify({
        summary: "LGTM",
        issues: [],
        verdict: "approve",
      });

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });

    it("should derive a missing issue message from its description", async () => {
      const files: FileToReview[] = [{ filename: "src/auth.ts" }];
      mockPromptResult = JSON.stringify({
        summary: "Found an authentication issue.",
        mergeSafety: "Not safe to merge. Authentication can fail for valid users.",
        issues: [
          {
            type: "bug-risk",
            severity: "warning",
            file: "src/auth.ts",
            line: 42,
            description:
              "The callback assumes every identity has an email address. Add a fallback before reading it.",
          },
        ],
        verdict: "comment",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Update authentication", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].message).toBe(
        "The callback assumes every identity has an email address."
      );
    });

    it("should drop an irrecoverably malformed issue instead of failing the review", async () => {
      const files: FileToReview[] = [{ filename: "src/auth.ts" }];
      mockPromptResult = JSON.stringify({
        summary: "No actionable findings remained.",
        mergeSafety: "Safe to merge. Malformed model output did not identify a usable finding.",
        issues: [
          {
            type: "bug-risk",
            severity: "warning",
            file: "src/auth.ts",
            line: 42,
          },
        ],
        verdict: "comment",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Update authentication", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.issues).toHaveLength(0);
      expect(result.verdict).toBe("comment");
    });

    it("should filter non-actionable praise issues", async () => {
      const files: FileToReview[] = [{ filename: "src/select.tsx" }];

      mockPromptResult = JSON.stringify({
        summary: "Mostly good changes.",
        mergeSafety:
          "Safe to merge. The semantic wrapper change does not introduce blocking behavior or security risk.",
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

      mockPromptResult = JSON.stringify({
        summary: "No files to review.",
        mergeSafety: "Safe to merge. There are no reviewed code changes that introduce risk.",
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

      mockPromptResult =
        '```json\n{"summary": "LGTM", "mergeSafety": "Safe to merge. The reviewed change has no blocking risk.", "issues": [], "verdict": "approve"}\n```';

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

      mockPromptResult =
        '  \n  {"summary": "LGTM", "mergeSafety": "Safe to merge. The reviewed change has no blocking risk.", "issues": [], "verdict": "approve"}  \n  ';

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: null },
        "/tmp/test-repo"
      );

      expect(result.verdict).toBe("approve");
    });

    it("should handle PR with null body", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult = JSON.stringify({
        summary: "OK",
        mergeSafety: "Safe to merge. The reviewed change has no blocking risk.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "No description", prBody: null },
        "/tmp/test-repo"
      );

      expect(result).toBeDefined();
    });

    it("should handle PR with empty string body", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult = JSON.stringify({
        summary: "OK",
        mergeSafety: "Safe to merge. The reviewed change has no blocking risk.",
        issues: [],
        verdict: "approve",
      });

      const result = await agent.reviewFiles(
        files,
        { prTitle: "Test", prBody: "" },
        "/tmp/test-repo"
      );

      expect(result).toBeDefined();
    });

    it("should handle issue with line number 0", async () => {
      const files: FileToReview[] = [{ filename: "test.ts" }];

      mockPromptResult = JSON.stringify({
        summary: "Issue at line 0",
        mergeSafety:
          "Not safe to merge. The general issue needs review before this change can land safely.",
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
      mockPromptResult = "";

      await expect(
        agent.reviewFiles(files, { prTitle: "Test", prBody: null }, "/tmp/test-repo")
      ).rejects.toThrow("Failed to parse review response");
    });
  });

  describe("respondToComment", () => {
    it("should respond to conversation", async () => {
      const conversation = [{ user: "developer", body: "Why did you flag this?" }];

      mockPromptResult = "This was flagged because of potential security issues.";

      const response = await agent.respondToComment(conversation, "/tmp/test-repo", {
        filename: "test.ts",
        diff: "+new code",
      });

      expect(response).toContain("security");
    });

    it("should handle agent failure in conversation", async () => {
      const conversation = [{ user: "developer", body: "Question?" }];
      mockPromptShouldFail = true;
      mockPromptError = "Agent failed";

      await expect(agent.respondToComment(conversation, "/tmp/test-repo")).rejects.toThrow(
        "Agent failed"
      );
    });

    it("should handle empty response", async () => {
      const conversation = [{ user: "developer", body: "Question?" }];
      mockPromptResult = "";

      await expect(agent.respondToComment(conversation, "/tmp/test-repo")).rejects.toThrow(
        "Failed to get response"
      );
    });
  });
});
