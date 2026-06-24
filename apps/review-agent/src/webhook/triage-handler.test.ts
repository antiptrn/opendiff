import { mock } from "bun:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TriageAgent } from "../agent/triage";
import type { CodeIssue } from "../agent/types";
import type { GitHubClient } from "../github/client";

mock.module("../utils/git", () => ({
  withClonedRepo: async (
    _options: unknown,
    callback: (tempDir: string, git: unknown) => Promise<unknown>
  ) => {
    const git = {
      add: async () => undefined,
      commit: async () => ({ commit: "abc123" }),
      diff: async () => "",
      push: async () => undefined,
      raw: async () => undefined,
    };

    return await callback("/tmp/repo", git);
  },
}));

import { getAutofixIgnoredDirForPath, handleTriageAfterReview } from "./triage-handler";

describe("handleTriageAfterReview", () => {
  let mockGitHubClient: Partial<GitHubClient>;
  let mockTriageAgent: Partial<TriageAgent>;

  beforeEach(() => {
    mockGitHubClient = {
      getIssueComments: vi.fn().mockResolvedValue([]),
      getReviewComments: vi.fn().mockResolvedValue([]),
      createIssueComment: vi.fn().mockResolvedValue({ id: 9001 }),
      replyToReviewComment: vi.fn().mockResolvedValue({ id: 9002 }),
      updateIssueComment: vi.fn().mockResolvedValue({ id: 9001 }),
    };

    mockTriageAgent = {
      fixIssue: vi.fn(),
    };
  });

  it("should upsert an autofix summary on a clean autofix push", async () => {
    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [],
      "owner",
      "repo",
      "opendiff-bot",
      true
    );

    expect(result.success).toBe(true);
    expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.stringContaining("## Autofix Summary")
    );
    expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.stringContaining("No autofix actions were needed for this push.")
    );
  });

  it("should format fixed autofix summaries as plain text and bullet points", async () => {
    const issue: CodeIssue = {
      type: "bug-risk",
      severity: "warning",
      file: "apps/review-agent/src/webhook/handler.ts",
      line: 454,
      message: "Resolved reviews can be processed repeatedly",
    };
    mockTriageAgent.fixIssue = vi.fn().mockResolvedValue({
      fixed: true,
      explanation:
        "Adjusted cleanupResolvedPreviousReviews so resolved reviews are skipped.\nThe summary remains readable.",
    });

    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [issue],
      "owner",
      "repo",
      "opendiff-bot",
      true
    );

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toHaveLength(1);
    const createIssueComment = mockGitHubClient.createIssueComment as unknown as {
      mock: { calls: unknown[][] };
    };
    const body = String(createIssueComment.mock.calls[0]?.[3] ?? "");
    expect(body).toContain("## Autofix Summary");
    expect(body).toContain("1 issue fixed automatically.");
    expect(body).toContain("### Fixed");
    expect(body).toContain(
      "- **bug-risk** in `apps/review-agent/src/webhook/handler.ts:454` — `abc123`: Adjusted cleanupResolvedPreviousReviews so resolved reviews are skipped. The summary remains readable."
    );
    expect(body).not.toContain("✅");
    expect(body).not.toContain("### ✅ Fixed");
    expect(body).not.toContain("  -");
    expect(body).not.toContain("  >");
  });

  it("should update existing remediation summary comments with the autofix summary title", async () => {
    mockGitHubClient.getIssueComments = vi.fn().mockResolvedValue([
      {
        id: 100,
        user: "opendiff-bot",
        body: "## Remediation Summary\n\nOld body",
      },
    ]);

    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [],
      "owner",
      "repo",
      "opendiff-bot",
      true
    );

    expect(result.success).toBe(true);
    expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
    expect(mockGitHubClient.updateIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      100,
      expect.stringContaining("## Autofix Summary")
    );
  });

  it("should not post an autofix summary on a clean pass when autofix is off", async () => {
    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [],
      "owner",
      "repo",
      "opendiff-bot",
      false
    );

    expect(result.success).toBe(true);
    expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
    expect(mockGitHubClient.updateIssueComment).not.toHaveBeenCalled();
  });

  it("should refresh the autofix summary when all issues match ignored autofix paths", async () => {
    const ignoredIssue: CodeIssue = {
      type: "bug-risk",
      severity: "warning",
      file: "apps/site/src/components/marketing/hero-section.tsx",
      line: 22,
      message: "Hero CTA points to an undefined route",
    };

    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [ignoredIssue],
      "owner",
      "repo",
      "opendiff-bot",
      true,
      { autofixIgnoredDirs: ["src/apps/site/*"] }
    );

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toHaveLength(0);
    expect(result.skippedIssues).toHaveLength(0);
    expect(result.clarificationIssues).toHaveLength(0);
    expect(mockTriageAgent.fixIssue).not.toHaveBeenCalled();
    expect(mockGitHubClient.replyToReviewComment).not.toHaveBeenCalled();
    expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.stringContaining("No autofix actions were needed for this push.")
    );
  });

  it("should match autofix ignored path patterns", () => {
    expect(getAutofixIgnoredDirForPath("README.md", ["README.md"])).toBe("README.md");
    expect(getAutofixIgnoredDirForPath("docs/README.md", ["README.md"])).toBeNull();
    expect(getAutofixIgnoredDirForPath("src/apps/bff/index.ts", ["src/apps/bff/*"])).toBe(
      "src/apps/bff/*"
    );
    expect(getAutofixIgnoredDirForPath("src/apps/bff/routes/index.ts", ["src/apps/bff/*"])).toBe(
      "src/apps/bff/*"
    );
    expect(
      getAutofixIgnoredDirForPath("apps/site/src/components/marketing/hero-section.tsx", [
        "src/apps/site/*",
      ])
    ).toBe("src/apps/site/*");
  });
});
