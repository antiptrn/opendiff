import { mock } from "bun:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeReviewAgent } from "../agent/reviewer";
import type { GitHubClient } from "../github/client";
import { ReviewFormatter } from "../review/formatter";
import { buildIssueFingerprint } from "../utils/issue-fingerprint";
import { buildIssueMarker } from "../utils/issue-markers";
import * as opencode from "../utils/opencode";
import * as reviewSnapshot from "../utils/review-snapshot";

const mockSnapshotFiles = vi.fn();
const mockClone = vi.fn(async (_options, callback) => callback("/tmp/review-test", {}));

mock.module("../utils/git", () => ({ withClonedRepo: mockClone }));

function scopeFor(file = "src/index.ts", line = 1) {
  return {
    file,
    line,
    side: "RIGHT" as const,
    before: "The previous implementation handled the input.",
    after: "The changed implementation fails for that input.",
  };
}

// Now import handler after mocks are set up
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
      expect(handler.testShouldSkipFile("apps/app/yarn.lock")).toBe(true);
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
      expect(handler.testShouldSkipFile("apps/app/node_modules/react/index.js")).toBe(true);
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
  afterEach(() => vi.restoreAllMocks());
  let handler: WebhookHandler;
  let mockGitHubClient: MockGitHubClient;
  let mockAgent: MockCodeReviewAgent;
  let mockFormatter: MockReviewFormatter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(reviewSnapshot, "prepareReviewSnapshot").mockImplementation(async () => ({
      files: await mockSnapshotFiles(),
      baseDirectory: "/tmp/review-test/base",
    }));

    mockGitHubClient = {
      getPullRequest: vi.fn(),
      getFileContent: vi.fn(),
      submitReview: vi.fn().mockResolvedValue({ id: 123 }),
      validateReviewComments: vi
        .fn()
        .mockImplementation(async (_owner, _repo, _pull, _commit, comments) => ({
          validComments: comments,
          invalidComments: [],
        })),
      getPullRequestReviews: vi.fn().mockResolvedValue([]),
      getReviewComments: vi.fn().mockResolvedValue([]),
      getReviewCommentThread: vi.fn(),
      deleteReviewComment: vi.fn(),
      updatePullRequestReview: vi.fn().mockResolvedValue({ id: 129 }),
      getIssueComments: vi.fn().mockResolvedValue([]),
      createIssueComment: vi.fn().mockResolvedValue({ id: 9001 }),
      updateIssueComment: vi.fn().mockResolvedValue({ id: 9001 }),
      getInstallationToken: vi.fn().mockResolvedValue("fake-token"),
    };

    mockAgent = {
      reviewFiles: vi.fn(),
    };

    mockFormatter = {
      formatReview: vi.fn(),
      partitionIssues: vi.fn().mockReturnValue({ inlineIssues: [], bodyOnlyIssues: [] }),
      formatComment: vi.fn(),
      formatSummaryBody: vi.fn().mockReturnValue("Review body"),
      formatHistoricalSummaryBody: vi.fn().mockReturnValue("Review body"),
      formatReviewBody: vi.fn().mockReturnValue("Current review body"),
    };

    handler = new WebhookHandler(
      mockGitHubClient as GitHubClient,
      mockAgent as CodeReviewAgent,
      mockFormatter as ReviewFormatter,
      undefined,
      true
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
        login: "opendiff-bot",
      },
    };

    it("should post the summary comment and approve a first clean review without a status update body", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1 @@\n-old\n+new",
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

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(mockSnapshotFiles).toHaveBeenCalled();
      expect(mockClone).toHaveBeenCalledWith(
        expect.objectContaining({ commit: "abc123" }),
        expect.any(Function)
      );
      expect(mockAgent.reviewFiles).toHaveBeenCalled();
      expect(result.reviewId).toBe(123);
      expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "Review body"
      );
      expect(mockGitHubClient.submitReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "abc123",
        expect.objectContaining({
          body: "",
          event: "APPROVE",
          comments: undefined,
        })
      );
    });

    it("should post the summary without approving when approvals are disabled", async () => {
      const nonApprovingHandler = new WebhookHandler(
        mockGitHubClient as GitHubClient,
        mockAgent as CodeReviewAgent,
        mockFormatter as ReviewFormatter
      );
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1 @@\n-old\n+new",
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

      const result = await nonApprovingHandler.handlePullRequestReviewRequested(
        basePayload,
        "opendiff-bot"
      );

      expect(result.success).toBe(true);
      expect(result.reviewId).toBeUndefined();
      expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "Review body"
      );
      expect(mockGitHubClient.submitReview).not.toHaveBeenCalled();
    });

    it("should downgrade invalid inline comments into the summary and still submit the review", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1,3 @@\n context\n+new\n+another",
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Found issues.",
        issues: [
          {
            type: "style",
            severity: "warning",
            file: "src/index.ts",
            line: 2,
            message: "Resolvable issue",
            scope: scopeFor("src/index.ts", 2),
          },
          {
            type: "bug-risk",
            severity: "warning",
            file: "src/index.ts",
            line: 3,
            message: "Unresolvable issue",
            scope: scopeFor("src/index.ts", 3),
          },
        ],
        verdict: "comment",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## Review Summary\n\nFound issues.",
        event: "COMMENT",
        comments: [
          { path: "src/index.ts", line: 2, body: "comment-1" },
          { path: "src/index.ts", line: 3, body: "comment-2" },
        ],
      });
      mockFormatter.partitionIssues = vi.fn().mockReturnValue({
        inlineIssues: [
          {
            type: "style",
            severity: "warning",
            file: "src/index.ts",
            line: 2,
            message: "Resolvable issue",
            scope: scopeFor("src/index.ts", 2),
          },
          {
            type: "bug-risk",
            severity: "warning",
            file: "src/index.ts",
            line: 3,
            message: "Unresolvable issue",
            scope: scopeFor("src/index.ts", 3),
          },
        ],
        bodyOnlyIssues: [],
      });
      mockFormatter.formatComment = vi
        .fn()
        .mockImplementation((issue) =>
          issue.line === 2
            ? { path: "src/index.ts", line: 2, body: "comment-1" }
            : { path: "src/index.ts", line: 3, body: "comment-2" }
        );
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue(
          "## Review Summary\n\nFound issues.\n\n### Not in diff\n\nIssue moved to summary."
        );
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue(
          "## Review Summary\n\nFound issues.\n\n### Not in diff\n\nIssue moved to summary."
        );
      mockFormatter.formatReviewBody = vi
        .fn()
        .mockReturnValue("## Current Review\n\nFound issues.\n\n### Open Issues");
      mockGitHubClient.validateReviewComments.mockResolvedValue({
        validComments: [{ path: "src/index.ts", line: 2, body: "comment-1" }],
        invalidComments: [{ path: "src/index.ts", line: 3, body: "comment-2" }],
      });
      mockGitHubClient.submitReview.mockResolvedValue({ id: 130 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(mockFormatter.formatSummaryBody).toHaveBeenCalled();
      expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "## Review Summary\n\nFound issues.\n\n### Not in diff\n\nIssue moved to summary."
      );
      expect(mockGitHubClient.submitReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "abc123",
        expect.objectContaining({
          body: "## Current Review\n\nFound issues.\n\n### Open Issues",
          comments: [{ path: "src/index.ts", line: 2, body: "comment-1" }],
        })
      );
    });

    it("should avoid creating a GitHub review when there are no inline findings and verdict is comment", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Needs follow-up but no inline diff anchors",
        issues: [],
        verdict: "comment",
      });
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue("## Review Summary\n\nNeeds follow-up but no inline diff anchors");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue("## Review Summary\n\nNeeds follow-up but no inline diff anchors");
      mockFormatter.formatReview.mockReturnValue({
        body: "## Review Summary\n\nNeeds follow-up but no inline diff anchors",
        event: "COMMENT",
      });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(result.reviewId).toBeUndefined();
      expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "## Review Summary\n\nNeeds follow-up but no inline diff anchors"
      );
      expect(mockGitHubClient.submitReview).not.toHaveBeenCalled();
    });

    it("should suppress issues that were already mentioned in existing bot comments", async () => {
      const repeatedIssue = {
        type: "style" as const,
        severity: "warning" as const,
        file: "src/index.ts",
        line: 5,
        message: "Repeated issue",
        scope: scopeFor("src/index.ts", 2),
      };
      const fingerprint = buildIssueFingerprint(repeatedIssue);

      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1,2 @@\n context\n+new",
        },
      ]);
      mockGitHubClient.getReviewComments.mockResolvedValue([
        {
          id: 201,
          nodeId: "node-201",
          path: "src/index.ts",
          line: 10,
          user: "opendiff-bot",
          body: `Existing comment\n\n<!-- opendiff-fingerprint:${fingerprint} -->`,
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Found issues.",
        issues: [repeatedIssue],
        verdict: "comment",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## Review Summary\n\nNo new issues.",
        event: "COMMENT",
      });
      mockFormatter.partitionIssues = vi
        .fn()
        .mockReturnValue({ inlineIssues: [], bodyOnlyIssues: [] });
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue("## Review Summary\n\nNo new issues.");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue("## Review Summary\n\nNo new issues.");

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(result.issues).toEqual([]);
      expect(mockGitHubClient.submitReview).not.toHaveBeenCalled();
      expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "## Review Summary\n\nNo new issues."
      );
    });

    it("should post a status update for repeated historical issues without duplicate comments", async () => {
      const repeatedIssue = {
        type: "bug-risk" as const,
        severity: "warning" as const,
        file: "src/index.ts",
        line: 5,
        message: "Previously reported issue",
        scope: scopeFor("src/index.ts", 2),
      };

      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1,2 @@\n context\n+new",
        },
      ]);
      mockGitHubClient.getIssueComments.mockResolvedValue([
        {
          id: 101,
          user: "opendiff-bot",
          body: `## OpenDiff Summary\n\nOld summary\n\n${buildIssueMarker(repeatedIssue)}`,
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "The previously reported issue is still present.",
        issues: [repeatedIssue],
        verdict: "comment",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## Review Summary\n\nNo new inline comments.",
        event: "COMMENT",
      });
      mockFormatter.partitionIssues = vi
        .fn()
        .mockReturnValue({ inlineIssues: [], bodyOnlyIssues: [] });
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue("## OpenDiff Summary\n\nNo new inline comments.");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue(
          "## OpenDiff Summary\n\nStill open.\n\n### Still Open From Earlier Reviews\n\n- `src/index.ts:5` Previously reported issue"
        );
      mockFormatter.formatReviewBody = vi.fn().mockReturnValue("## Status Update\n\nStill open.");
      mockGitHubClient.submitReview.mockResolvedValue({ id: 131 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(result.reviewId).toBe(131);
      expect(result.issues).toEqual([]);
      expect(mockAgent.reviewFiles).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          priorReviewContext: expect.stringContaining(
            'src/index.ts:5 type=bug-risk severity=warning message="Previously reported issue"'
          ),
        }),
        expect.anything(),
        undefined
      );
      expect(mockFormatter.formatHistoricalSummaryBody).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: [expect.objectContaining(repeatedIssue)],
        }),
        [],
        expect.objectContaining({
          unresolvedHistoricalIssues: [expect.objectContaining(repeatedIssue)],
          addressedIssues: [],
        })
      );
      expect(mockFormatter.formatReviewBody).toHaveBeenCalledWith(
        expect.objectContaining({
          issues: [expect.objectContaining(repeatedIssue)],
        }),
        [expect.objectContaining(repeatedIssue)],
        []
      );
      expect(mockGitHubClient.updateIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        101,
        "## OpenDiff Summary\n\nStill open.\n\n### Still Open From Earlier Reviews\n\n- `src/index.ts:5` Previously reported issue"
      );
      expect(mockGitHubClient.submitReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "abc123",
        expect.objectContaining({
          body: "## Status Update\n\nStill open.",
          comments: undefined,
          event: "COMMENT",
        })
      );
    });

    it("should not coerce a filtered comment review into an approval", async () => {
      const repeatedIssue = {
        type: "style" as const,
        severity: "warning" as const,
        file: "src/index.ts",
        line: 5,
        message: "Repeated issue",
        scope: scopeFor("src/index.ts", 2),
      };
      const resolvedIssue = {
        type: "bug-risk" as const,
        severity: "warning" as const,
        file: "src/old.ts",
        line: 3,
        message: "Resolved issue",
        scope: scopeFor("src/index.ts", 2),
      };
      const repeatedFingerprint = buildIssueFingerprint(repeatedIssue);

      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1,2 @@\n context\n+new",
        },
      ]);
      mockGitHubClient.getIssueComments.mockResolvedValue([
        {
          id: 101,
          user: "opendiff-bot",
          body: `## Summary\n\nOld summary\n\n${buildIssueMarker(resolvedIssue)}`,
        },
      ]);
      mockGitHubClient.getReviewComments.mockResolvedValue([
        {
          id: 201,
          nodeId: "node-201",
          path: "src/index.ts",
          line: 10,
          user: "opendiff-bot",
          body: `Existing comment\n\n<!-- opendiff-fingerprint:${repeatedFingerprint} -->`,
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Status update only.",
        issues: [repeatedIssue],
        verdict: "comment",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## Review Summary\n\nStatus update only.",
        event: "COMMENT",
      });
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue("## Review Summary\n\nStatus update only.");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue(
          "## Review Summary\n\nStatus update only.\n\n### Addressed Since Earlier Reviews\n\n- `src/old.ts:3` Resolved issue"
        );
      mockFormatter.formatReviewBody = vi
        .fn()
        .mockReturnValue("## Status Update\n\nResolved earlier issues.");

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(result.reviewId).toBe(123);
      expect(mockGitHubClient.updateIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        101,
        "## Review Summary\n\nStatus update only.\n\n### Addressed Since Earlier Reviews\n\n- `src/old.ts:3` Resolved issue"
      );
      expect(mockGitHubClient.submitReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "abc123",
        expect.objectContaining({
          body: "## Status Update\n\nResolved earlier issues.",
          comments: undefined,
          event: "COMMENT",
        })
      );
    });

    it("should update the existing review summary comment on re-review", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ]);
      mockGitHubClient.getIssueComments.mockResolvedValue([
        {
          id: 101,
          user: "opendiff-bot",
          body: "## OpenDiff Summary\n\nOld summary",
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Updated summary",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## OpenDiff Summary\n\nNew summary",
        event: "APPROVE",
      });
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue("## OpenDiff Summary\n\nNew summary");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue("## OpenDiff Summary\n\nNew summary");
      mockFormatter.formatReviewBody = vi.fn().mockReturnValue("## Current Review\n\nNew summary");
      mockGitHubClient.submitReview.mockResolvedValue({ id: 129 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(mockGitHubClient.updateIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        101,
        "## OpenDiff Summary\n\nNew summary"
      );
      expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
      expect(result.reviewId).toBe(129);
      expect(mockGitHubClient.submitReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "abc123",
        expect.objectContaining({
          body: "## Current Review\n\nNew summary",
          event: "APPROVE",
        })
      );
    });

    it("should not duplicate an approval already submitted for the current head", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ]);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([
        {
          id: 129,
          user: "opendiff-bot[bot]",
          body: "## Current Review\n\nNew summary",
          state: "APPROVED",
          submittedAt: "2026-06-24T16:00:00Z",
          commitId: "abc123",
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Updated summary",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## Review Summary\n\nNew summary",
        event: "APPROVE",
      });
      mockFormatter.formatSummaryBody = vi.fn().mockReturnValue("## Review Summary\n\nNew summary");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue("## Review Summary\n\nNew summary");
      mockFormatter.formatReviewBody = vi.fn().mockReturnValue("## Current Review\n\nNew summary");
      mockGitHubClient.submitReview.mockResolvedValue({ id: 130 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(result.reviewId).toBeUndefined();
      expect(mockGitHubClient.submitReview).not.toHaveBeenCalled();
    });

    it("should post a status update when previously reported issues were addressed", async () => {
      const addressedIssue = {
        type: "style" as const,
        severity: "warning" as const,
        file: "src/index.ts",
        line: 5,
        message: "Previously reported issue",
        scope: scopeFor("src/index.ts", 1),
      };

      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ]);
      mockGitHubClient.getIssueComments.mockResolvedValue([
        {
          id: 101,
          user: "opendiff-bot",
          body: `## Summary\n\nOld summary\n\n${buildIssueMarker(addressedIssue)}`,
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "All previously reported issues are fixed.",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## Summary\n\nAll previously reported issues are fixed.",
        event: "APPROVE",
      });
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue("## Summary\n\nAll previously reported issues are fixed.");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue(
          "## Summary\n\nAll previously reported issues are fixed.\n\n### Addressed Since Earlier Reviews\n\n- `src/index.ts:5` Previously reported issue"
        );
      mockFormatter.formatReviewBody = vi
        .fn()
        .mockReturnValue("## Status Update\n\nAll previously reported issues are fixed.");
      mockGitHubClient.submitReview.mockResolvedValue({ id: 129 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(result.reviewId).toBe(129);
      expect(mockGitHubClient.updateIssueComment).toHaveBeenCalledWith(
        "owner",
        "repo",
        101,
        "## Summary\n\nAll previously reported issues are fixed.\n\n### Addressed Since Earlier Reviews\n\n- `src/index.ts:5` Previously reported issue"
      );
      expect(mockGitHubClient.submitReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "abc123",
        expect.objectContaining({
          body: "## Status Update\n\nAll previously reported issues are fixed.",
        })
      );
    });

    it("should quote resolved status update bodies before adding the resolved notice", async () => {
      const addressedIssue = {
        type: "bug-risk" as const,
        severity: "warning" as const,
        file: "src/index.ts",
        line: 5,
        message: "Previously reported issue",
        scope: scopeFor("src/index.ts", 1),
      };
      const oldBody = `## Status Update\n\n### Overview\n\n- ⚠️ 1 warning\n\n### Open Issues\n\n- \`src/index.ts:5\` Previously reported issue.\n\n${buildIssueMarker(addressedIssue)}`;

      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1 +1 @@\n-old\n+new",
        },
      ]);
      mockGitHubClient.getPullRequestReviews.mockResolvedValue([
        {
          id: 129,
          user: "opendiff-bot",
          body: oldBody,
          state: "COMMENTED",
          submittedAt: "2026-06-24T16:00:00Z",
          commitId: "old-sha",
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "All previously reported issues are fixed.",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "## Status Update\n\nAll previously reported issues are fixed.",
        event: "APPROVE",
      });
      mockFormatter.formatSummaryBody = vi
        .fn()
        .mockReturnValue("## OpenDiff Summary\n\nAll previously reported issues are fixed.");
      mockFormatter.formatHistoricalSummaryBody = vi
        .fn()
        .mockReturnValue("## OpenDiff Summary\n\nAll previously reported issues are fixed.");
      mockFormatter.formatReviewBody = vi
        .fn()
        .mockReturnValue("## Status Update\n\nAll previously reported issues are fixed.");
      mockGitHubClient.submitReview.mockResolvedValue({ id: 130 });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      const quotedOldBody = oldBody
        .replace(/^## Status Update\s*\n+/i, "")
        .trim()
        .split("\n")
        .map((line) => (line.trim() ? `> ${line}` : ">"))
        .join("\n");
      const expectedBody = `${quotedOldBody}\n\nResolved in a later revision. See the living OpenDiff Summary comment for the current state of this PR.`;
      expect(result.success).toBe(true);
      expect(expectedBody).not.toContain("~~");
      expect(expectedBody).not.toContain("\n\n\nResolved in a later revision");
      expect(expectedBody).not.toContain("> ## Status Update");
      expect(expectedBody).toMatch(/^> ### Overview/);
      expect(mockGitHubClient.updatePullRequestReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        129,
        expectedBody
      );
      expect(mockGitHubClient.submitReview).toHaveBeenCalledWith(
        "owner",
        "repo",
        42,
        "abc123",
        expect.objectContaining({
          body: "",
          event: "APPROVE",
        })
      );
    });

    it("should skip if reviewer is not the bot", async () => {
      const payload = {
        ...basePayload,
        requested_reviewer: { login: "human-reviewer" },
      };

      const result = await handler.handlePullRequestReviewRequested(payload, "opendiff-bot");

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
      mockSnapshotFiles.mockResolvedValue([]);
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

      const result = await handler.handlePullRequestReviewRequested(payload, "opendiff-bot", [
        "ai-reviewers",
      ]);

      expect(result.success).toBe(true);
      expect(mockSnapshotFiles).toHaveBeenCalled();
    });

    it("should filter out non-code files", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "src/code.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+code" },
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

      await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      // Only code.ts should be reviewed
      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles).toHaveLength(1);
      expect(reviewedFiles[0].filename).toBe("src/code.ts");
    });

    it("should filter out files matching review ignored path patterns", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "src/code.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+code" },
        { filename: "src/config.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+config" },
        { filename: "generated/client.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+generated" },
        { filename: "apps/legacy/old.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+legacy" },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "OK",
        event: "APPROVE",
      });

      await handler.handlePullRequestReviewRequested(
        basePayload,
        "opendiff-bot",
        [],
        null,
        undefined,
        ["src/config.ts", "generated/*", "apps/legacy/*"]
      );

      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles.map((file: { filename: string }) => file.filename)).toEqual([
        "src/code.ts",
      ]);
    });

    it("should only review files matching review included path patterns", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "src/code.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+code" },
        { filename: "apps/app/src/page.tsx", status: "modified", patch: "@@ -0,0 +1 @@\n+page" },
        { filename: "apps/bff/src/index.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+server" },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "OK",
        event: "APPROVE",
      });

      await handler.handlePullRequestReviewRequested(
        basePayload,
        "opendiff-bot",
        [],
        null,
        undefined,
        [],
        ["src/apps/app/*"]
      );

      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles.map((file: { filename: string }) => file.filename)).toEqual([
        "apps/app/src/page.tsx",
      ]);
    });

    it("should let review ignored paths override included paths", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "apps/app/src/page.tsx", status: "modified", patch: "@@ -0,0 +1 @@\n+page" },
        {
          filename: "apps/app/src/generated/client.ts",
          status: "modified",
          patch: "@@ -0,0 +1 @@\n+generated",
        },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "OK",
        issues: [],
        verdict: "approve",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "OK",
        event: "APPROVE",
      });

      await handler.handlePullRequestReviewRequested(
        basePayload,
        "opendiff-bot",
        [],
        null,
        undefined,
        ["apps/app/src/generated/*"],
        ["src/apps/app/*"]
      );

      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles.map((file: { filename: string }) => file.filename)).toEqual([
        "apps/app/src/page.tsx",
      ]);
    });

    it("should drop review findings matching ignored path patterns", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "src/code.ts", status: "modified", patch: "@@ -0,0 +1 @@\n+code" },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Found issues",
        issues: [
          {
            type: "bug-risk",
            severity: "warning",
            file: "src/code.ts",
            line: 1,
            message: "Real issue",
            scope: scopeFor("src/code.ts"),
          },
          {
            type: "bug-risk",
            severity: "warning",
            file: "generated/client.ts",
            line: 1,
            message: "Ignored issue",
            scope: scopeFor("src/code.ts"),
          },
          {
            type: "bug-risk",
            severity: "warning",
            file: "src/config.ts",
            line: 1,
            message: "Ignored exact file issue",
            scope: scopeFor("src/code.ts"),
          },
        ],
        verdict: "comment",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "Review body",
        event: "COMMENT",
      });

      const result = await handler.handlePullRequestReviewRequested(
        basePayload,
        "opendiff-bot",
        [],
        null,
        undefined,
        ["generated/*", "src/config.ts"]
      );

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(1);
      expect(result.issues?.[0]?.file).toBe("src/code.ts");
    });

    it("should drop review findings outside included path patterns", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "apps/app/src/page.tsx", status: "modified", patch: "@@ -0,0 +1 @@\n+page" },
      ]);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Found issues",
        issues: [
          {
            type: "bug-risk",
            severity: "warning",
            file: "apps/app/src/page.tsx",
            line: 1,
            message: "Included issue",
            scope: scopeFor("apps/app/src/page.tsx"),
          },
          {
            type: "bug-risk",
            severity: "warning",
            file: "apps/bff/src/index.ts",
            line: 1,
            message: "Out of scope issue",
            scope: scopeFor("apps/app/src/page.tsx"),
          },
        ],
        verdict: "comment",
      });
      mockFormatter.formatReview.mockReturnValue({
        body: "Review body",
        event: "COMMENT",
      });

      const result = await handler.handlePullRequestReviewRequested(
        basePayload,
        "opendiff-bot",
        [],
        null,
        undefined,
        [],
        ["src/apps/app/*"]
      );

      expect(result.success).toBe(true);
      expect(result.issues).toHaveLength(1);
      expect(result.issues?.[0]?.file).toBe("apps/app/src/page.tsx");
    });

    it("should remove rejected findings from summaries, verdicts, returned issues and autofix", async () => {
      mockSnapshotFiles.mockResolvedValue([
        { filename: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" },
      ]);
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Unrelated architecture rewrite required",
        mergeSafety: "Not safe to merge. Unrelated architecture rewrite required.",
        verdict: "request_changes",
        issues: [
          {
            type: "bug-risk",
            severity: "critical",
            file: "src/legacy.ts",
            line: 10,
            message: "Unrelated architecture rewrite required",
          },
        ],
      });
      const fixIssue = vi.fn();
      const realHandler = new WebhookHandler(
        mockGitHubClient as GitHubClient,
        mockAgent as CodeReviewAgent,
        new ReviewFormatter(),
        undefined,
        true
      );
      const result = await realHandler.handlePullRequestOpened(basePayload, "opendiff-bot", null, {
        enabled: true,
        autofixEnabled: true,
        botUsername: "opendiff-bot",
        triageAgent: { fixIssue } as never,
      });
      expect(result.success).toBe(true);
      expect(result.issues).toEqual([]);
      expect(fixIssue).not.toHaveBeenCalled();
      const summary = mockGitHubClient.createIssueComment.mock.calls[0][3];
      expect(summary).not.toContain("Unrelated architecture");
      expect(summary).not.toContain("src/legacy.ts");
      expect(summary).toContain("src/index.ts");
      expect(summary).toContain("No in-scope findings remain");
      expect(mockGitHubClient.submitReview.mock.calls[0][4].event).toBe("APPROVE");
    });

    it("should retain a PR-caused regression in an unchanged caller", async () => {
      mockSnapshotFiles.mockResolvedValue([
        { filename: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" },
      ]);
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      const issue = {
        type: "bug-risk",
        severity: "warning",
        file: "src/caller.ts",
        line: 10,
        message: "The changed return type breaks this caller",
        scope: scopeFor(),
      };
      mockAgent.reviewFiles.mockResolvedValue({
        summary: "Changes the exported API.",
        mergeSafety: "Not safe to merge. The caller breaks.",
        verdict: "comment",
        issues: [issue],
      });
      const realHandler = new WebhookHandler(
        mockGitHubClient as GitHubClient,
        mockAgent as CodeReviewAgent,
        new ReviewFormatter()
      );
      const result = await realHandler.handlePullRequestReviewRequested(
        basePayload,
        "opendiff-bot"
      );
      expect(result.issues).toEqual([issue]);
      const summary = mockGitHubClient.createIssueComment.mock.calls[0][3];
      expect(summary).toContain("Additional PR Findings");
      expect(summary).toContain("src/caller.ts:10");
    });

    it.each([false, true])(
      "should exclude historical scope rejections without claiming they were fixed (legacy=%s)",
      async (legacy) => {
        mockSnapshotFiles.mockResolvedValue([
          { filename: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" },
        ]);
        mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
        const issue = {
          type: "bug-risk" as const,
          severity: "warning" as const,
          file: "src/legacy.ts",
          line: 10,
          message: "Existing issue",
          ...(legacy ? {} : { scope: scopeFor() }),
        };
        mockGitHubClient.getIssueComments.mockResolvedValue([
          {
            id: 101,
            user: "opendiff-bot",
            body: `## OpenDiff Summary\n\n${buildIssueMarker(issue)}`,
          },
        ]);
        mockAgent.reviewFiles.mockResolvedValue({
          summary: "Changes the API.",
          mergeSafety: "No in-scope findings remain.",
          verdict: "approve",
          issues: [],
          scopeRejectedIssues: legacy ? [] : [issue],
        });
        mockFormatter.formatReview.mockReturnValue({ body: "Review", event: "APPROVE" });
        await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");
        expect(mockFormatter.formatHistoricalSummaryBody.mock.calls[0][2]).toMatchObject({
          unresolvedHistoricalIssues: [],
          newIssues: [],
          addressedIssues: [],
        });
        if (legacy) {
          expect(mockAgent.reviewFiles.mock.calls[0][1].priorReviewContext).toBe("");
        }
      }
    );

    it.each(["head", "base"])(
      "should preserve both model passes' usage when the PR %s changes after review",
      async (revision) => {
        mockSnapshotFiles.mockResolvedValue([
          { filename: "src/index.ts", status: "modified", patch: "@@ -1 +1 @@\n-old\n+new" },
        ]);
        mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
        const prompt = vi
          .spyOn(opencode, "runOpencodePrompt")
          .mockResolvedValueOnce({
            text: JSON.stringify({
              summary: "Found a regression.",
              mergeSafety: "Review the finding.",
              verdict: "comment",
              issues: [
                {
                  type: "bug-risk",
                  severity: "warning",
                  file: "src/index.ts",
                  line: 1,
                  message: "Changed behavior breaks callers.",
                  scope: scopeFor(),
                },
              ],
            }),
            tokensUsed: 123,
          })
          .mockImplementationOnce(async () => {
            mockGitHubClient.getPullRequest.mockResolvedValue({
              ...basePayload.pull_request,
              [revision]: { ...basePayload.pull_request[revision], sha: "new-commit" },
            });
            return {
              text: JSON.stringify({
                acceptedIssueIndices: [0],
                summary: "Verified regression.",
                mergeSafety: "Review the finding.",
                verdict: "comment",
              }),
              tokensUsed: 77,
            };
          });
        handler = new WebhookHandler(
          mockGitHubClient as GitHubClient,
          new CodeReviewAgent(),
          mockFormatter as ReviewFormatter
        );
        const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");
        expect(prompt).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ success: true, skipped: true, tokensUsed: 200 });
        expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
        expect(mockGitHubClient.updateIssueComment).not.toHaveBeenCalled();
        expect(mockGitHubClient.updatePullRequestReview).not.toHaveBeenCalled();
        expect(mockGitHubClient.submitReview).not.toHaveBeenCalled();
      }
    );

    it("should handle API errors gracefully", async () => {
      mockSnapshotFiles.mockImplementation(async () => {
        throw new Error("API error");
      });

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(false);
      expect(result.error).toContain("API error");
    });

    it("should include deleted files for removal-caused regressions", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "deleted.ts", status: "removed", patch: "-deleted" },
        { filename: "added.ts", status: "added", patch: "@@ -0,0 +1 @@\n+added" },
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

      await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles).toHaveLength(2);
      expect(reviewedFiles[0].filename).toBe("deleted.ts");
      expect(reviewedFiles[1].filename).toBe("added.ts");
    });

    it("should handle PR with all files filtered out", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "README.md", status: "modified", patch: "+docs" },
        { filename: "package-lock.json", status: "modified", patch: "+lock" },
        { filename: ".gitignore", status: "modified", patch: "+ignore" },
        { filename: "types.d.ts", status: "added", patch: "@@ -0,0 +1 @@\n+types" },
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

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles).toHaveLength(0);
    });

    it("should pass files without content (OpenCode reads files itself)", async () => {
      mockGitHubClient.getPullRequest.mockResolvedValue(basePayload.pull_request);
      mockSnapshotFiles.mockResolvedValue([
        { filename: "file.ts", status: "added", patch: "@@ -0,0 +1 @@\n+code" },
      ]);
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

      const result = await handler.handlePullRequestReviewRequested(basePayload, "opendiff-bot");

      expect(result.success).toBe(true);
      // Content is undefined - OpenCode reads files itself
      const reviewedFiles = mockAgent.reviewFiles.mock.calls[0][0];
      expect(reviewedFiles[0].content).toBeUndefined();
      expect(reviewedFiles[0].filename).toBe("file.ts");
      expect(reviewedFiles[0].patch).toBe("@@ -0,0 +1 @@\n+code");
    });

    it("should pass both reviewer and team check correctly", async () => {
      // Neither reviewer nor team matches
      const payload = {
        ...basePayload,
        requested_reviewer: { login: "other-user" },
        requested_team: { slug: "other-team" },
      };

      const result = await handler.handlePullRequestReviewRequested(payload, "opendiff-bot", [
        "ai-team",
      ]);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(mockSnapshotFiles).not.toHaveBeenCalled();
    });

    it("should handle no reviewer or team specified", async () => {
      const payload = {
        ...basePayload,
        requested_reviewer: undefined,
        requested_team: undefined,
      };

      const result = await handler.handlePullRequestReviewRequested(payload, "opendiff-bot");

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });
  });
});
