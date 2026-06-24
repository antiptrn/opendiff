import type { Octokit } from "@octokit/rest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GitHubClient } from "./client";
import type { PullRequest, PullRequestFile, Review } from "./types";

// Mock Octokit
const mockOctokit = {
  rest: {
    pulls: {
      get: vi.fn(),
      listFiles: vi.fn(),
      createReview: vi.fn(),
      deletePendingReview: vi.fn(),
      listReviews: vi.fn(),
    },
    repos: {
      getContent: vi.fn(),
    },
    reactions: {
      createForIssue: vi.fn(),
      deleteForIssue: vi.fn(),
    },
  },
} as unknown as Octokit;

describe("GitHubClient", () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.resetAllMocks();
    client = new GitHubClient(mockOctokit);
  });

  describe("getPullRequest", () => {
    it("should fetch pull request details", async () => {
      const mockPR: PullRequest = {
        number: 42,
        title: "Add new feature",
        body: "This PR adds a cool feature",
        head: { sha: "abc123", ref: "feature-branch" },
        base: { sha: "def456", ref: "main" },
        user: { login: "testuser" },
      };

      mockOctokit.rest.pulls.get.mockResolvedValue({ data: mockPR });

      const result = await client.getPullRequest("owner", "repo", 42);

      expect(mockOctokit.rest.pulls.get).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
      });
      expect(result).toEqual(mockPR);
    });

    it("should throw on API error", async () => {
      mockOctokit.rest.pulls.get.mockRejectedValue(new Error("Not found"));

      await expect(client.getPullRequest("owner", "repo", 999)).rejects.toThrow("Not found");
    });
  });

  describe("getPullRequestFiles", () => {
    it("should fetch list of changed files", async () => {
      const mockFiles: PullRequestFile[] = [
        {
          filename: "src/index.ts",
          status: "modified",
          additions: 10,
          deletions: 5,
          patch: "@@ -1,5 +1,10 @@\n-old line\n+new line",
        },
        {
          filename: "src/new-file.ts",
          status: "added",
          additions: 20,
          deletions: 0,
          patch: "@@ -0,0 +1,20 @@\n+new content",
        },
      ];

      mockOctokit.rest.pulls.listFiles.mockResolvedValue({ data: mockFiles });

      const result = await client.getPullRequestFiles("owner", "repo", 42);

      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
        per_page: 100,
        page: 1,
      });
      expect(result).toEqual(mockFiles);
    });

    it("should handle pagination for large PRs", async () => {
      const page1 = Array(100).fill({
        filename: "file.ts",
        status: "modified",
        additions: 1,
        deletions: 0,
      });
      const page2 = [
        {
          filename: "last-file.ts",
          status: "added",
          additions: 5,
          deletions: 0,
        },
      ];

      mockOctokit.rest.pulls.listFiles
        .mockResolvedValueOnce({ data: page1 })
        .mockResolvedValueOnce({ data: page2 });

      const result = await client.getPullRequestFiles("owner", "repo", 42);

      expect(mockOctokit.rest.pulls.listFiles).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(101);
    });
  });

  describe("getFileContent", () => {
    it("should fetch file content at a specific ref", async () => {
      const content = 'console.log("hello world");';
      const encodedContent = Buffer.from(content).toString("base64");

      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: "file",
          content: encodedContent,
          encoding: "base64",
        },
      });

      const result = await client.getFileContent("owner", "repo", "src/index.ts", "abc123");

      expect(mockOctokit.rest.repos.getContent).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        path: "src/index.ts",
        ref: "abc123",
      });
      expect(result).toBe(content);
    });

    it("should return null for directories", async () => {
      mockOctokit.rest.repos.getContent.mockResolvedValue({
        data: {
          type: "dir",
        },
      });

      const result = await client.getFileContent("owner", "repo", "src", "abc123");
      expect(result).toBeNull();
    });

    it("should return null for non-existent files", async () => {
      mockOctokit.rest.repos.getContent.mockRejectedValue({ status: 404 });

      const result = await client.getFileContent("owner", "repo", "missing.ts", "abc123");
      expect(result).toBeNull();
    });
  });

  describe("submitReview", () => {
    it("should submit a review with comments", async () => {
      const review: Review = {
        body: "Overall looks good, but a few suggestions.",
        event: "COMMENT",
        comments: [
          {
            path: "src/index.ts",
            line: 10,
            body: "Consider using const here",
          },
        ],
      };

      mockOctokit.rest.pulls.createReview.mockResolvedValue({
        data: { id: 12345 },
      });

      const result = await client.submitReview("owner", "repo", 42, "abc123", review);

      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
        commit_id: "abc123",
        body: review.body,
        event: review.event,
        comments: review.comments?.map((c) => ({ ...c, side: "RIGHT" })),
      });
      expect(result).toEqual({ id: 12345 });
    });

    it("should submit approval without comments", async () => {
      const review: Review = {
        body: "LGTM!",
        event: "APPROVE",
      };

      mockOctokit.rest.pulls.createReview.mockResolvedValue({
        data: { id: 12346 },
      });

      await client.submitReview("owner", "repo", 42, "abc123", review);

      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
        commit_id: "abc123",
        body: review.body,
        event: review.event,
        comments: undefined,
      });
    });

    it("should submit comment reviews for conversational fix requests", async () => {
      const review: Review = {
        body: "Please address these issues before merging.",
        event: "COMMENT",
        comments: [
          {
            path: "src/auth.ts",
            line: 25,
            body: "This introduces a security vulnerability",
          },
        ],
      };

      mockOctokit.rest.pulls.createReview.mockResolvedValue({
        data: { id: 12347 },
      });

      await client.submitReview("owner", "repo", 42, "abc123", review);

      expect(mockOctokit.rest.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "COMMENT",
        })
      );
    });
  });

  describe("pull request reactions", () => {
    it("should create an eyes reaction on the PR main post", async () => {
      mockOctokit.rest.reactions.createForIssue.mockResolvedValue({
        data: { id: 9876 },
      });

      const result = await client.createPullRequestEyesReaction("owner", "repo", 42);

      expect(mockOctokit.rest.reactions.createForIssue).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        issue_number: 42,
        content: "eyes",
      });
      expect(result).toEqual({ id: 9876 });
    });

    it("should remove the eyes reaction from the PR main post", async () => {
      mockOctokit.rest.reactions.deleteForIssue.mockResolvedValue({});

      await client.deletePullRequestEyesReaction("owner", "repo", 42, 9876);

      expect(mockOctokit.rest.reactions.deleteForIssue).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        issue_number: 42,
        reaction_id: 9876,
      });
    });
  });

  describe("getPullRequestReviews", () => {
    it("should include the reviewed commit id", async () => {
      mockOctokit.rest.pulls.listReviews.mockResolvedValue({
        data: [
          {
            id: 123,
            user: { login: "opendiff-bot" },
            body: "Looks good",
            state: "APPROVED",
            submitted_at: "2026-06-24T16:00:00Z",
            commit_id: "abc123",
          },
        ],
      });

      const result = await client.getPullRequestReviews("owner", "repo", 42);

      expect(mockOctokit.rest.pulls.listReviews).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
        per_page: 100,
      });
      expect(result).toEqual([
        {
          id: 123,
          user: "opendiff-bot",
          body: "Looks good",
          state: "APPROVED",
          submittedAt: "2026-06-24T16:00:00Z",
          commitId: "abc123",
        },
      ]);
    });
  });

  describe("validateReviewComments", () => {
    it("should keep all comments when GitHub accepts the pending review", async () => {
      const comments: NonNullable<Review["comments"]> = [
        { path: "src/index.ts", line: 10, body: "comment-1" },
      ];

      mockOctokit.rest.pulls.createReview.mockResolvedValue({
        data: { id: 2001 },
      });

      const result = await client.validateReviewComments("owner", "repo", 42, "abc123", comments);

      expect(result).toEqual({ validComments: comments, invalidComments: [] });
      expect(mockOctokit.rest.pulls.deletePendingReview).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
        review_id: 2001,
      });
    });

    it("should isolate invalid comments when GitHub rejects unresolved lines", async () => {
      const comments: NonNullable<Review["comments"]> = [
        { path: "src/index.ts", line: 10, body: "comment-1" },
        { path: "src/index.ts", line: 20, body: "comment-2" },
      ];

      mockOctokit.rest.pulls.createReview
        .mockRejectedValueOnce({
          status: 422,
          message: 'Unprocessable Entity: "Line could not be resolved"',
        })
        .mockResolvedValueOnce({ data: { id: 2002 } })
        .mockRejectedValueOnce({
          status: 422,
          message: 'Unprocessable Entity: "Line could not be resolved"',
        });

      const result = await client.validateReviewComments("owner", "repo", 42, "abc123", comments);

      expect(result).toEqual({
        validComments: [comments[0]],
        invalidComments: [comments[1]],
      });
      expect(mockOctokit.rest.pulls.deletePendingReview).toHaveBeenCalledWith({
        owner: "owner",
        repo: "repo",
        pull_number: 42,
        review_id: 2002,
      });
    });
  });
});
