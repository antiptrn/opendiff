import type { RepositorySettings } from "shared/types";
import type { GitHubClient } from "../github/client";

export const TOKEN_QUOTA_BLOCKED_COMMENT_MARKER = "<!-- opendiff-token-quota-blocked -->";
export const REVIEW_FAILURE_COMMENT_MARKER = "<!-- opendiff-review-failed -->";

export type ReviewFailureCommentKind = "review" | "autofix" | "comment_reply";
export type ReviewFailureCommentReason = "internal_error" | "opencode_auth";

export type TokenQuotaAwareRepositorySettings = RepositorySettings & {
  disabledReason?:
    | "repository_not_configured"
    | "repository_disabled"
    | "missing_organization"
    | "quota_exhausted";
  quota?: {
    total: number;
    used: number;
    hasUnlimited: boolean;
  };
};

export function buildTokenQuotaBlockedCommentBody(
  settings: TokenQuotaAwareRepositorySettings
): string {
  const quotaDetails =
    settings.quota && settings.quota.total !== -1
      ? `\n\nCurrent usage: ${settings.quota.used.toLocaleString("en-US")} of ${settings.quota.total.toLocaleString("en-US")} tokens used this cycle.`
      : "";

  return `${TOKEN_QUOTA_BLOCKED_COMMENT_MARKER}
## Opendiff paused

I couldn't run the requested review or autofix because this organization has no tokens remaining for the current billing cycle.${quotaDetails}

Add tokens or upgrade the plan, then request another review or rerun autofix.`;
}

function findExistingBotComment(
  issueComments: Awaited<ReturnType<GitHubClient["getIssueComments"]>>,
  botUsername: string,
  marker: string
) {
  const botUsers = new Set([botUsername, `${botUsername}[bot]`]);
  return [...issueComments]
    .reverse()
    .find((comment) => botUsers.has(comment.user) && comment.body.includes(marker));
}

export async function upsertTokenQuotaBlockedComment(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string,
  settings: TokenQuotaAwareRepositorySettings
): Promise<void> {
  const body = buildTokenQuotaBlockedCommentBody(settings);
  const issueComments = await github.getIssueComments(owner, repo, pullNumber);
  const existingComment = findExistingBotComment(
    issueComments,
    botUsername,
    TOKEN_QUOTA_BLOCKED_COMMENT_MARKER
  );

  if (existingComment) {
    await github.updateIssueComment(owner, repo, existingComment.id, body);
    console.log(`Updated token quota blocked comment ${existingComment.id}`);
    return;
  }

  await github.createIssueComment(owner, repo, pullNumber, body);
  console.log("Posted token quota blocked comment");
}

function reviewFailureActionLabel(kind: ReviewFailureCommentKind): string {
  switch (kind) {
    case "autofix":
      return "autofix";
    case "comment_reply":
      return "comment reply";
    case "review":
      return "review";
  }
}

export function buildReviewFailureCommentBody(options: {
  kind: ReviewFailureCommentKind;
  reason?: ReviewFailureCommentReason;
  deliveryId?: string | null;
  error?: unknown;
}): string {
  const deliveryDetails = options.deliveryId ? `\n\nDelivery ID: \`${options.deliveryId}\`` : "";
  const action = reviewFailureActionLabel(options.kind);
  const errorDetails =
    options.reason === "opencode_auth" ? "" : buildSanitizedErrorDetails(options.error);

  if (options.reason === "opencode_auth") {
    return `${REVIEW_FAILURE_COMMENT_MARKER}
## Opendiff needs updated OpenCode auth

I couldn't complete the requested ${action} because the review agent's OpenCode auth credentials are expired or invalid.${deliveryDetails}

Update the OpenCode auth credentials on the deployment, then retry the ${action}.`;
  }

  return `${REVIEW_FAILURE_COMMENT_MARKER}
## Opendiff couldn't complete

I couldn't complete the requested ${action} because the service hit an internal error.${deliveryDetails}${errorDetails}

Please retry after the service is healthy. If this keeps happening, check the review-agent logs for the failure details.`;
}

function buildSanitizedErrorDetails(error: unknown): string {
  const message = extractErrorMessage(error);
  if (!message) {
    return "";
  }

  return `\n\nThe service reported:\n\n\`\`\`text\n${sanitizeErrorMessage(message)}\n\`\`\``;
}

function extractErrorMessage(error: unknown): string {
  if (!error) {
    return "";
  }

  if (error instanceof Error) {
    return error.message.trim();
  }

  if (typeof error === "string") {
    return error.trim();
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function sanitizeErrorMessage(message: string): string {
  const redacted = message
    .replace(
      /https:\/\/x-access-token:[^@\s]+@github\.com/g,
      "https://x-access-token:[redacted]@github.com"
    )
    .replace(/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g, "[redacted-github-token]")
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[redacted-api-key]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+\b/gi, "Bearer [redacted]");

  return redacted.length > 1200 ? `${redacted.slice(0, 1200)}\n[truncated]` : redacted;
}

export async function upsertReviewFailureComment(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string,
  options: {
    kind: ReviewFailureCommentKind;
    reason?: ReviewFailureCommentReason;
    deliveryId?: string | null;
    error?: unknown;
  }
): Promise<void> {
  const body = buildReviewFailureCommentBody(options);
  const issueComments = await github.getIssueComments(owner, repo, pullNumber);
  const existingComment = findExistingBotComment(
    issueComments,
    botUsername,
    REVIEW_FAILURE_COMMENT_MARKER
  );

  if (existingComment) {
    await github.updateIssueComment(owner, repo, existingComment.id, body);
    console.log(`Updated review failure comment ${existingComment.id}`);
    return;
  }

  await github.createIssueComment(owner, repo, pullNumber, body);
  console.log("Posted review failure comment");
}
