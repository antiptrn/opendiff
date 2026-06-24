import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "../github/client";
import {
  REVIEW_FAILURE_COMMENT_MARKER,
  TOKEN_QUOTA_BLOCKED_COMMENT_MARKER,
  type TokenQuotaAwareRepositorySettings,
  buildReviewFailureCommentBody,
  buildTokenQuotaBlockedCommentBody,
  upsertReviewFailureComment,
  upsertTokenQuotaBlockedComment,
} from "./quota-comment";

describe("quota comment", () => {
  const settings: TokenQuotaAwareRepositorySettings = {
    owner: "owner",
    repo: "repo",
    enabled: true,
    effectiveEnabled: false,
    autofixEnabled: true,
    sensitivity: 50,
    disabledReason: "quota_exhausted",
    quota: {
      total: 2_500_000,
      used: 2_500_000,
      hasUnlimited: false,
    },
  };

  let github: Partial<GitHubClient>;

  beforeEach(() => {
    github = {
      getIssueComments: vi.fn().mockResolvedValue([]),
      createIssueComment: vi.fn().mockResolvedValue({ id: 101 }),
      updateIssueComment: vi.fn().mockResolvedValue({ id: 100 }),
    };
  });

  it("explains that review or autofix was blocked by token exhaustion", () => {
    const body = buildTokenQuotaBlockedCommentBody(settings);

    expect(body).toContain(TOKEN_QUOTA_BLOCKED_COMMENT_MARKER);
    expect(body).toContain("requested review or autofix");
    expect(body).toContain("no tokens remaining");
    expect(body).toContain("2,500,000 of 2,500,000 tokens used");
  });

  it("creates a PR comment when no quota notice exists", async () => {
    await upsertTokenQuotaBlockedComment(
      github as GitHubClient,
      "owner",
      "repo",
      42,
      "opendiff-bot",
      settings
    );

    expect(github.createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.stringContaining("no tokens remaining")
    );
    expect(github.updateIssueComment).not.toHaveBeenCalled();
  });

  it("updates the existing bot quota notice instead of creating duplicates", async () => {
    (github.getIssueComments as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 100,
        user: "opendiff-bot[bot]",
        body: `${TOKEN_QUOTA_BLOCKED_COMMENT_MARKER}\nold body`,
        createdAt: "2026-06-24T00:00:00Z",
      },
    ]);

    await upsertTokenQuotaBlockedComment(
      github as GitHubClient,
      "owner",
      "repo",
      42,
      "opendiff-bot",
      settings
    );

    expect(github.updateIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      100,
      expect.stringContaining("requested review or autofix")
    );
    expect(github.createIssueComment).not.toHaveBeenCalled();
  });

  it("explains that a review failed for a non-quota service error", () => {
    const body = buildReviewFailureCommentBody({
      kind: "review",
      deliveryId: "delivery-123",
    });

    expect(body).toContain(REVIEW_FAILURE_COMMENT_MARKER);
    expect(body).toContain("requested review");
    expect(body).toContain("internal error");
    expect(body).toContain("delivery-123");
  });

  it("creates a PR comment when no failure notice exists", async () => {
    await upsertReviewFailureComment(github as GitHubClient, "owner", "repo", 42, "opendiff-bot", {
      kind: "autofix",
    });

    expect(github.createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.stringContaining("requested autofix")
    );
    expect(github.updateIssueComment).not.toHaveBeenCalled();
  });

  it("updates the existing bot failure notice instead of creating duplicates", async () => {
    (github.getIssueComments as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 100,
        user: "opendiff-bot[bot]",
        body: `${REVIEW_FAILURE_COMMENT_MARKER}\nold body`,
        createdAt: "2026-06-24T00:00:00Z",
      },
    ]);

    await upsertReviewFailureComment(github as GitHubClient, "owner", "repo", 42, "opendiff-bot", {
      kind: "comment_reply",
      deliveryId: "delivery-456",
    });

    expect(github.updateIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      100,
      expect.stringContaining("requested comment reply")
    );
    expect(github.createIssueComment).not.toHaveBeenCalled();
  });
});
