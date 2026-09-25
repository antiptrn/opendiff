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

import {
  getAutofixIgnoredDirForPath,
  getAutofixIncludedDirForPath,
  handleTriageAfterReview,
} from "./triage-handler";

describe("handleTriageAfterReview", () => {
  let mockGitHubClient: Partial<GitHubClient>;
  let mockTriageAgent: Partial<TriageAgent>;

  beforeEach(() => {
    mockGitHubClient = {
      getPullRequestCommits: vi.fn().mockResolvedValue([]),
      getPullRequestReviews: vi.fn().mockResolvedValue([]),
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

  it("should not post an autofix summary on a clean autofix push", async () => {
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
    expect(mockGitHubClient.updateIssueComment).not.toHaveBeenCalled();
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
      "- Adjusted cleanupResolvedPreviousReviews so resolved reviews are skipped. The summary remains readable."
    );
    expect(body).not.toContain("**bug-risk** in `apps/review-agent/src/webhook/handler.ts:454`");
    expect(body).not.toContain("`abc123`:");
    expect(body).not.toContain("✅");
    expect(body).not.toContain("### ✅ Fixed");
    expect(body).not.toContain("  -");
    expect(body).not.toContain("  >");
  });

  it("should not touch an existing remediation summary when no autofix actions occur", async () => {
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
    expect(mockGitHubClient.updateIssueComment).not.toHaveBeenCalled();
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

  it("should not post an autofix summary when all issues match ignored autofix paths", async () => {
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
    expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
    expect(mockGitHubClient.updateIssueComment).not.toHaveBeenCalled();
  });

  it("should not fix issues outside included autofix paths", async () => {
    const outOfScopeIssue: CodeIssue = {
      type: "bug-risk",
      severity: "warning",
      file: "apps/bff/src/index.ts",
      line: 22,
      message: "Server issue outside app scope",
    };

    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [outOfScopeIssue],
      "owner",
      "repo",
      "opendiff-bot",
      true,
      { autofixIncludedDirs: ["src/apps/app/*"] }
    );

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toHaveLength(0);
    expect(result.skippedIssues).toHaveLength(0);
    expect(result.clarificationIssues).toHaveLength(0);
    expect(mockTriageAgent.fixIssue).not.toHaveBeenCalled();
    expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
    expect(mockGitHubClient.updateIssueComment).not.toHaveBeenCalled();
  });

  it("passes PR history and the matching thread to each fix, including earlier commits in the run", async () => {
    const issue: CodeIssue = {
      type: "bug-risk",
      severity: "warning",
      file: "src/auth.ts",
      line: 10,
      message: "Preserve login behavior",
    };
    mockGitHubClient.getPullRequestCommits = vi.fn().mockResolvedValue([
      {
        sha: "head-sha",
        message: "Keep legacy login\n\nMobile clients depend on it",
        author: "author",
        date: "2026-09-25",
      },
    ]);
    mockGitHubClient.getIssueComments = vi.fn().mockResolvedValue([
      {
        id: 1,
        user: "maintainer",
        body: "Maintain backward compatibility",
        createdAt: "2026-09-25",
      },
    ]);
    mockGitHubClient.getPullRequestReviews = vi.fn().mockResolvedValue([
      {
        id: 2,
        user: "reviewer",
        body: "Avoid changing the API",
        state: "CHANGES_REQUESTED",
        commitId: "head-sha",
        submittedAt: "2026-09-25",
      },
    ]);
    mockGitHubClient.getReviewComments = vi.fn().mockResolvedValue([
      {
        id: 3,
        nodeId: "node3",
        user: "opendiff-bot",
        path: issue.file,
        line: 10,
        body: issue.message,
        inReplyToId: null,
        createdAt: "2026-09-25",
      },
      {
        id: 4,
        nodeId: "node4",
        user: "maintainer",
        path: issue.file,
        line: 10,
        body: "Keep the fallback",
        inReplyToId: 3,
        createdAt: "2026-09-25",
      },
    ]);
    const fixIssue = vi
      .fn()
      .mockResolvedValue({ fixed: true, explanation: "Preserved the fallback" });
    mockTriageAgent.fixIssue = fixIssue;

    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      { number: 42, head: { sha: "head-sha", ref: "feature" } },
      [issue, { ...issue, line: 20 }],
      "owner",
      "repo",
      "opendiff-bot",
      false
    );

    expect(result.fixedIssues).toHaveLength(2);
    const first = fixIssue.mock.calls[0][2];
    expect(first.pullRequestContext).toContain("Mobile clients depend on it");
    expect(first.pullRequestContext).toContain("Maintain backward compatibility");
    expect(first.pullRequestContext).toContain("Avoid changing the API");
    expect(first.pullRequestContext).toContain("reply to #3");
    expect(first.conversationContext).toContain("Keep the fallback");
    expect(first.previousFixesContext).toBeUndefined();
    expect(fixIssue.mock.calls[1][2].previousFixesContext).toContain(
      "abc123 — fix(bug-risk): Preserve login behavior"
    );
    expect(fixIssue.mock.calls[1][2].previousFixesContext).toContain("Preserved the fallback");
    expect(mockGitHubClient.getPullRequestCommits).toHaveBeenCalledTimes(1);
    expect(mockGitHubClient.getPullRequestReviews).toHaveBeenCalledTimes(1);
  });

  it("continues fixing when optional context fetches fail", async () => {
    mockGitHubClient.getPullRequestCommits = vi
      .fn()
      .mockRejectedValue(new Error("API unavailable"));
    mockGitHubClient.getReviewComments = vi.fn().mockRejectedValue(new Error("API unavailable"));
    const fixIssue = vi.fn().mockResolvedValue({ fixed: false, explanation: "No change needed" });
    mockTriageAgent.fixIssue = fixIssue;
    await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      { number: 42, head: { sha: "head-sha", ref: "feature" } },
      [{ type: "bug-risk", severity: "warning", file: "src/auth.ts", line: 10, message: "Issue" }],
      "owner",
      "repo",
      "opendiff-bot",
      false
    );
    expect(fixIssue).toHaveBeenCalledTimes(1);
    expect(fixIssue.mock.calls[0][2].pullRequestContext).toContain(
      "Context unavailable (fetch failed)."
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

  it("should match autofix included path patterns", () => {
    expect(
      getAutofixIncludedDirForPath("apps/site/src/components/marketing/hero-section.tsx", [
        "src/apps/site/*",
      ])
    ).toBe("src/apps/site/*");
    expect(
      getAutofixIncludedDirForPath("apps/site/public/robots.txt", ["src/apps/site/*"])
    ).toBeNull();
  });
});
