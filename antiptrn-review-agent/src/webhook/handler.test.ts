import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodeReviewAgent } from "../agent/reviewer";
import type { GitHubClient } from "../github/client";
import type { ReviewFormatter } from "../review/formatter";
import { WebhookHandler } from "./handler";

type MockGitHubClient = Partial<GitHubClient>;
type MockCodeReviewAgent = Partial<CodeReviewAgent>;
type MockReviewFormatter = Partial<ReviewFormatter>;

// Test the private methods via a test subclass
class TestableWebhookHandler extends WebhookHandler {
  public testIsCodeFile(filename: string): boolean {
    return (this as unknown as { isCodeFile: (f: string) => boolean }).isCodeFile(filename);
  }

  public testShouldSkipFile(filename: string): boolean {
    return (this as unknown as { shouldSkipFile: (f: string) => boolean }).shouldSkipFile(filename);
  }
}

describe("WebhookHandler file filtering", () => {
  let handler: TestableWebhookHandler;
  let mockGitHubClient: MockGitHubClient;
  let mockAgent: MockCodeReviewAgent;
  let mockFormatter: MockReviewFormatter;

  beforeEach(() => {
    mockGitHubClient = {};
    mockAgent = {};
    mockFormatter = {};
    handler = new TestableWebhookHandler(
      mockGitHubClient as GitHubClient,
      mockAgent as CodeReviewAgent,
      mockFormatter as ReviewFormatter
    );
  });

  describe("isCodeFile", () => {
    it("should recognize TypeScript files", () => {
      expect(handler.testIsCodeFile("src/index.ts")).toBe(true);
      expect(handler.testIsCodeFile("components/Button.tsx")).toBe(true);
    });

    it("should recognize JavaScript files", () => {
      expect(handler.testIsCodeFile("lib/utils.js")).toBe(true);
      expect(handler.testIsCodeFile("components/App.jsx")).toBe(true);
      expect(handler.testIsCodeFile("config.mjs")).toBe(true);
      expect(handler.testIsCodeFile("config.cjs")).toBe(true);
    });

    it("should recognize Python files", () => {
      expect(handler.testIsCodeFile("main.py")).toBe(true);
      expect(handler.testIsCodeFile("tests/test_utils.py")).toBe(true);
    });

    it("should recognize other language files", () => {
      expect(handler.testIsCodeFile("main.go")).toBe(true);
      expect(handler.testIsCodeFile("lib.rs")).toBe(true);
      expect(handler.testIsCodeFile("App.java")).toBe(true);
      expect(handler.testIsCodeFile("Main.kt")).toBe(true);
      expect(handler.testIsCodeFile("app.rb")).toBe(true);
      expect(handler.testIsCodeFile("Program.cs")).toBe(true);
      expect(handler.testIsCodeFile("index.php")).toBe(true);
      expect(handler.testIsCodeFile("App.swift")).toBe(true);
      expect(handler.testIsCodeFile("main.c")).toBe(true);
      expect(handler.testIsCodeFile("utils.cpp")).toBe(true);
      expect(handler.testIsCodeFile("header.h")).toBe(true);
      expect(handler.testIsCodeFile("header.hpp")).toBe(true);
      expect(handler.testIsCodeFile("App.scala")).toBe(true);
    });

    it("should recognize frontend framework files", () => {
      expect(handler.testIsCodeFile("Component.vue")).toBe(true);
      expect(handler.testIsCodeFile("Component.svelte")).toBe(true);
    });

    it("should reject non-code files", () => {
      expect(handler.testIsCodeFile("README.md")).toBe(false);
      expect(handler.testIsCodeFile("package.json")).toBe(false);
      expect(handler.testIsCodeFile("tsconfig.json")).toBe(false);
      expect(handler.testIsCodeFile("image.png")).toBe(false);
      expect(handler.testIsCodeFile("styles.css")).toBe(false);
      expect(handler.testIsCodeFile("config.yaml")).toBe(false);
      expect(handler.testIsCodeFile("data.xml")).toBe(false);
      expect(handler.testIsCodeFile(".gitignore")).toBe(false);
      expect(handler.testIsCodeFile("Dockerfile")).toBe(false);
    });

    it("should handle files with no extension", () => {
      expect(handler.testIsCodeFile("Makefile")).toBe(false);
      expect(handler.testIsCodeFile("LICENSE")).toBe(false);
    });

    it("should handle files with multiple dots", () => {
      expect(handler.testIsCodeFile("component.test.ts")).toBe(true);
      expect(handler.testIsCodeFile("config.dev.js")).toBe(true);
      expect(handler.testIsCodeFile("file.backup.txt")).toBe(false);
    });
  });

  describe("shouldSkipFile", () => {
    it("should skip package-lock.json", () => {
      expect(handler.testShouldSkipFile("package-lock.json")).toBe(true);
      expect(handler.testShouldSkipFile("subdir/package-lock.json")).toBe(true);
    });

    it("should skip yarn.lock", () => {
      expect(handler.testShouldSkipFile("yarn.lock")).toBe(true);
      expect(handler.testShouldSkipFile("packages/app/yarn.lock")).toBe(true);
    });

    it("should skip pnpm-lock.yaml", () => {
      expect(handler.testShouldSkipFile("pnpm-lock.yaml")).toBe(true);
    });

    it("should skip minified files", () => {
      expect(handler.testShouldSkipFile("app.min.js")).toBe(true);
      expect(handler.testShouldSkipFile("styles.min.css")).toBe(true);
      expect(handler.testShouldSkipFile("dist/bundle.min.js")).toBe(true);
    });

    it("should skip generated files", () => {
      expect(handler.testShouldSkipFile("schema.generated.ts")).toBe(true);
      expect(handler.testShouldSkipFile("types.generated.d.ts")).toBe(true);
      expect(handler.testShouldSkipFile("api.generated.js")).toBe(true);
    });

    it("should skip TypeScript declaration files", () => {
      expect(handler.testShouldSkipFile("types.d.ts")).toBe(true);
      expect(handler.testShouldSkipFile("global.d.ts")).toBe(true);
      expect(handler.testShouldSkipFile("src/types/index.d.ts")).toBe(true);
    });

    it("should skip node_modules files", () => {
      expect(handler.testShouldSkipFile("node_modules/lodash/index.js")).toBe(true);
      expect(handler.testShouldSkipFile("packages/app/node_modules/react/index.js")).toBe(true);
    });

    it("should NOT skip regular code files", () => {
      expect(handler.testShouldSkipFile("src/index.ts")).toBe(false);
      expect(handler.testShouldSkipFile("lib/utils.js")).toBe(false);
      expect(handler.testShouldSkipFile("package.json")).toBe(false); // Not in skip patterns
      expect(handler.testShouldSkipFile("app.ts")).toBe(false);
    });

    it("should NOT skip bun.lock (only pnpm/yarn/npm locks)", () => {
      expect(handler.testShouldSkipFile("bun.lock")).toBe(false);
    });
  });
});

describe("WebhookHandler", () => {
  let handler: WebhookHandler;
  let mockGitHubClient: MockGitHubClient;
  let mockAgent: MockCodeReviewAgent;
  let mockFormatter: MockReviewFormatter;

  beforeEach(() => {
    vi.clearAllMocks();

    mockGitHubClient = {
      getPullRequest: vi.fn(),
      getPullRequestFiles: vi.fn(),
      getFileContent: vi.fn(),
      submitReview: vi.fn(),
    };

    mockAgent = {
      reviewFiles: vi.fn(),
    };

    mockFormatter = {
      formatReview: vi.fn(),
    };

    handler = new WebhookHandler(
      mockGitHubClient as GitHubClient,
      mockAgent as CodeReviewAgent,
      mockFormatter as ReviewFormatter
    );
  });

  describe("handlePullRequestReviewRequested", () => {
    const basePayload = {
      action: "review_requested",
      pull_request: {
        number: 42,
        title: "Add new feature",
        body: "Description of the feature",
        head: { sha: "abc123", ref: "feature-branch" },
        base: { sha: "def456", ref: "main" },
        user: { login: "author" },
      },
      repository: {
        owner: { login: "owner" },
        name: "repo",
      },
      requested_reviewer: {
        login: "antiptrn-bot",
      },
    };

    it("should process review request for the bot", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockGitHubClient.getPullRequestFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1,5 +1,10 @@\n-old\n+new",
        },
      ]);
      mockGitHubClient.getFileContent.mockResolvedValue("const x = 1;");
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "LGTM",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "Review body",
        event: "APPROVE",
      });
      mockGitHubClient.submitReview.mockResolvedValue({ id: 123 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "antiptrn-bot");

      expect(result.success).toBe(true);
      expect(mockGitHubClient.getPullRequestFiles).toHaveBeenCalledWith("owner", "repo", 42);
      expect(mockAgent.reviewFiles).toHaveBeenCalled();
      expect(mockGitHubClient.submitReview).toHaveBeenCalled();
    });

    it("should skip if reviewer is not the bot", async () => {
      const payload = {
        ...basePayload,
        requested_reviewer: { login: "human-reviewer" },
      };

      const result = await handler.handlePullRequestReviewRequested(payload, "antiptrn-bot");

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mockGitHubClient.getPullRequest).not.toHaveBeenCalled();
    });

    it("should handle team review requests", async () => {
      const payload = {
        ...basePayload,
        requested_reviewer: undefined,
        requested_team: { slug: "ai-reviewers" },
      };

      // Assume bot is part of ai-reviewers team
      mockGitHubClient.getPullRequest.mockResolvedValue(payload.pull_request);
      mockGitHubClient.getPullRequestFiles.mockResolvedValue([]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "No files to review",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "No files",
        event: "APPROVE",
      });
      mockGitHubClient.submitReview.mockResolvedValue({ id: 124 });

      const result = await handler.handlePullRequestReviewRequested(payload, "antiptrn-bot", [
        "ai-reviewers",
      ]);

      expect(result.success).toBe(true);
      expect(mockGitHubClient.getPullRequestFiles).toHaveBeenCalled();
    });

    it("should filter out non-code files", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockGitHubClient.getPullRequestFiles.mockResolvedValue([
        { filename: "src/code.ts", status: "modified", patch: "+code" },
        { filename: "README.md", status: "modified", patch: "+docs" },
        { filename: "package-lock.json", status: "modified", patch: "+lock" },
        { filename: "image.png", status: "added", patch: undefined },
      ]);
      mockGitHubClient.getFileContent.mockResolvedValue("code");
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "OK",
        event: "APPROVE",
      });
      mockGitHubClient.submitReview.mockResolvedValue({ id: 125 });

      await handler.handlePullRequestReviewRequested(basePayload, "antiptrn-bot");

      // Only code.ts should be reviewed
      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles).toHaveLength(1);
      expect(reviewedFiles[0].filename).toBe("src/code.ts");
    });

    it("should handle API errors gracefully", async () => {
      mockGitHubClient.getPullRequestFiles.mockRejectedValue(new Error("API error"));

      const result = await handler.handlePullRequestReviewRequested(basePayload, "antiptrn-bot");

      expect(result.success).toBe(false);
      expect(result.error).toContain("API error");
    });

    it("should skip deleted files", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockGitHubClient.getPullRequestFiles.mockResolvedValue([
        { filename: "deleted.ts", status: "removed", patch: "-deleted" },
        { filename: "added.ts", status: "added", patch: "+added" },
      ]);
      mockGitHubClient.getFileContent.mockResolvedValue("added code");
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "OK",
        event: "APPROVE",
      });
      mockGitHubClient.submitReview.mockResolvedValue({ id: 126 });

      await handler.handlePullRequestReviewRequested(basePayload, "antiptrn-bot");

      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles).toHaveLength(1);
      expect(reviewedFiles[0].filename).toBe("added.ts");
    });

    it("should handle PR with all files filtered out", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockGitHubClient.getPullRequestFiles.mockResolvedValue([
        { filename: "README.md", status: "modified", patch: "+docs" },
        { filename: "package-lock.json", status: "modified", patch: "+lock" },
        { filename: ".gitignore", status: "modified", patch: "+ignore" },
        { filename: "types.d.ts", status: "added", patch: "+types" },
      ]);
      // No code files, so agent should be called with empty array
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "No code files to review.",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "No code files",
        event: "APPROVE",
      });
      mockGitHubClient.submitReview.mockResolvedValue({ id: 127 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "antiptrn-bot");

      expect(result.success).toBe(true);
      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles).toHaveLength(0);
    });

    it("should handle file with null content from GitHub", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockGitHubClient.getPullRequestFiles.mockResolvedValue([
        { filename: "missing.ts", status: "added", patch: "+code" },
      ]);
      mockGitHubClient.getFileContent.mockResolvedValue(null); // File not found
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "OK",
        event: "APPROVE",
      });
      mockGitHubClient.submitReview.mockResolvedValue({ id: 128 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "antiptrn-bot");

      expect(result.success).toBe(true);
      // Should use empty string when content is null
      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles[0].content).toBe("");
    });

    it("should pass both reviewer and team check correctly", async () => {
      // Neither reviewer nor team matches
      const payload = {
        ...basePayload,
        requested_reviewer: { login: "other-user" },
        requested_team: { slug: "other-team" },
      };

      const result = await handler.handlePullRequestReviewRequested(payload, "antiptrn-bot", [
        "ai-team",
      ]);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mockGitHubClient.getPullRequestFiles).not.toHaveBeenCalled();
    });

    it("should handle no reviewer or team specified", async () => {
      const payload = {
        ...basePayload,
        requested_reviewer: undefined,
        requested_team: undefined,
      };

      const result = await handler.handlePullRequestReviewRequested(payload, "antiptrn-bot");

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });
  });
});
