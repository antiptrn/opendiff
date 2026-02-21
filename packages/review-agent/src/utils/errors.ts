import { randomUUID } from "node:crypto";
import * as Sentry from "@sentry/node";

const DEFAULT_SENTRY_DSN =
  "https://6de09e6d20ab3d865fc3296cfb592643@o4510924056297472.ingest.de.sentry.io/4510924065800272";

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN || DEFAULT_SENTRY_DSN;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    sendDefaultPii: true,
  });
}

/**
 * Report an error to Sentry and return a unique reference ID.
 * The reference ID is included in the generic PR comment so that
 * support can look up the full error details in Sentry.
 */
export function reportError(
  error: unknown,
  context: {
    owner?: string;
    repo?: string;
    pullNumber?: number;
    action?: string;
  }
): string {
  const errorId = randomUUID();

  console.error(`[${errorId}] Error:`, error);

  Sentry.withScope((scope) => {
    scope.setTag("errorId", errorId);
    if (context.owner) scope.setTag("owner", context.owner);
    if (context.repo) scope.setTag("repo", context.repo);
    if (context.pullNumber) scope.setTag("pullNumber", String(context.pullNumber));
    if (context.action) scope.setTag("action", context.action);

    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureMessage(String(error), "error");
    }
  });

  return errorId;
}

export function formatErrorComment(errorId: string): string {
  return [
    "⚠️ **OpenDiff encountered an error**",
    "",
    "We were unable to complete the review due to an internal error. Our team has been notified.",
    "",
    `Reference: \`${errorId}\``,
  ].join("\n");
}

export function formatQuotaExceededComment(errorId: string): string {
  return [
    "⚠️ **Review skipped — token quota exceeded**",
    "",
    "Your organization has used all available review tokens for this billing cycle.",
    "Please check your plan in the [OpenDiff dashboard](https://opendiff.com).",
    "",
    `Reference: \`${errorId}\``,
  ].join("\n");
}
