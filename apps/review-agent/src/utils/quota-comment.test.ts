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
    approveEnabled: false,
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

  it("includes sanitized internal error details when available", () => {
    const body = buildReviewFailureCommentBody({
      kind: "review",
      deliveryId: "delivery-123",
      error: new Error(
        'Unprocessable Entity: "Review This pull request has been updated since you started reviewing. Please review the latest changes and resubmit."'
      ),
    });

    expect(body).toContain("The service reported:");
    expect(body).toContain("pull request has been updated since you started reviewing");
    expect(body).toContain("delivery-123");
  });

  it("redacts tokens from internal error details", () => {
    const body = buildReviewFailureCommentBody({
      kind: "review",
      error:
        "failed to clone https://x-access-token:ghs_abcdefghijklmnopqrstuvwxyz123456@github.com/owner/repo.git with Bearer super-secret-token",
    });

    expect(body).toContain("https://x-access-token:[redacted]@github.com");
    expect(body).toContain("Bearer [redacted]");
    expect(body).not.toContain("abcdefghijklmnopqrstuvwxyz");
    expect(body).not.toContain("super-secret-token");
  });

  it("explains that OpenCode auth credentials need to be updated", () => {
    const body = buildReviewFailureCommentBody({
      kind: "review",
      reason: "opencode_auth",
      deliveryId: "delivery-123",
      error: new Error("refresh failed"),
    });

    expect(body).toContain(REVIEW_FAILURE_COMMENT_MARKER);
    expect(body).toContain("updated OpenCode auth");
    expect(body).toContain("credentials are expired or invalid");
    expect(body).toContain("delivery-123");
    expect(body).not.toContain("internal error");
    expect(body).not.toContain("refresh failed");
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
