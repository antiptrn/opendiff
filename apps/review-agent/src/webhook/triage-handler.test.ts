import { mock } from "bun:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TriageAgent } from "../agent/triage";
import type { CodeIssue } from "../agent/types";
import type { GitHubClient } from "../github/client";

const push = vi.fn();
const clone = vi.fn();

mock.module("../utils/git", () => ({
  withClonedRepo: async (
    _options: unknown,
    callback: (tempDir: string, git: unknown) => Promise<unknown>
  ) => {
    clone();
    const git = {
      add: async () => undefined,
      commit: async () => ({ commit: "abc123" }),
      diff: async () => "",
      push,
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
  const issue: CodeIssue = {
    type: "bug-risk",
    severity: "warning",
    file: "src/example.ts",
    line: 1,
    message: "Return the expected value",
  };
  const pullRequest = { number: 42, head: { sha: "abc123", ref: "feature-branch" } };

  beforeEach(() => {
    clone.mockClear();
    push.mockReset();
    mockGitHubClient = {
      getPullRequest: vi.fn().mockResolvedValue({ ...pullRequest, labels: [] }),
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

  function runTriage(issues: CodeIssue[] = [issue], autofixEnabled = true) {
    return handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      pullRequest,
      issues,
      "owner",
      "repo",
      "opendiff-bot",
      autofixEnabled
    );
  }

  it.each([true, false])(
    "skips cloning and model calls for a labeled PR (autofix=%s)",
    async (autofixEnabled) => {
      mockGitHubClient.getPullRequest = vi.fn().mockResolvedValue({
        ...pullRequest,
        labels: [{ name: "No-Autofix" }],
      });

      const result = await runTriage([issue], autofixEnabled);

      expect(result.success).toBe(true);
      expect(result.skippedIssues).toEqual([
        { issue, reason: "This pull request has the `no-autofix` label." },
      ]);
      expect(clone).not.toHaveBeenCalled();
      expect(mockTriageAgent.fixIssue).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    }
  );

  it.each([1, 2])(
    "discards local fixes when the label is added during model work (%s findings)",
    async (count) => {
      let labeled = false;
      mockGitHubClient.getPullRequest = vi.fn().mockImplementation(async () => ({
        ...pullRequest,
        labels: labeled ? [{ name: "no-autofix" }] : [],
      }));
      mockTriageAgent.fixIssue = vi.fn().mockImplementation(async () => {
        labeled = true;
        return { fixed: true, explanation: "Fixed locally" };
      });

      const result = await runTriage([issue, { ...issue, line: 2 }].slice(0, count));

      expect(result.success).toBe(true);
      expect(result.fixedIssues).toHaveLength(0);
      expect(result.skippedIssues).toHaveLength(count);
      expect(mockTriageAgent.fixIssue).toHaveBeenCalledTimes(1);
      expect(push).not.toHaveBeenCalled();
      expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
    }
  );

  it("rechecks labels before a push retry", async () => {
    let labeled = false;
    mockGitHubClient.getPullRequest = vi.fn().mockImplementation(async () => ({
      ...pullRequest,
      labels: labeled ? [{ name: "no-autofix" }] : [],
    }));
    mockTriageAgent.fixIssue = vi
      .fn()
      .mockResolvedValue({ fixed: true, explanation: "Fixed locally" });
    push.mockImplementationOnce(async () => {
      labeled = true;
      throw new Error("Network error");
    });

    const result = await runTriage();

    expect(result.success).toBe(true);
    expect(result.fixedIssues).toHaveLength(0);
    expect(result.skippedIssues[0]?.reason).toContain("no-autofix");
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("does not run fixes when the current labels cannot be fetched", async () => {
    mockGitHubClient.getPullRequest = vi.fn().mockRejectedValue(new Error("GitHub unavailable"));

    const result = await runTriage();

    expect(result).toMatchObject({ success: false, error: "GitHub unavailable", fixedIssues: [] });
    expect(clone).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
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
    expect(push).toHaveBeenCalledWith("origin", "feature-branch");
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
