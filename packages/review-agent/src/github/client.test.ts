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
    },
    repos: {
      getContent: vi.fn(),
    },
  },
} as unknown as Octokit;

describe("GitHubClient", () => {
  let client: GitHubClient;

  beforeEach(() => {
    vi.clearAllMocks();
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

    it("should submit request changes", async () => {
      const review: Review = {
        body: "Please address these issues before merging.",
        event: "REQUEST_CHANGES",
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
          event: "REQUEST_CHANGES",
        })
      );
    });
  });
});
