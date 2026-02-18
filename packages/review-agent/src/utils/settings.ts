import type { CodeIssue, RepositorySettings } from "shared/types";
import { buildIssueFingerprint } from "./issue-fingerprint";

export type { RepositorySettings };

export interface RuntimeAiConfig {
  authMethod: "API_KEY" | "OAUTH_TOKEN";
  model: string;
  credential: string;
}

const SETTINGS_API_URL = process.env.SETTINGS_API_URL;
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY;

export async function getRepositorySettings(
  owner: string,
  repo: string
): Promise<RepositorySettings> {
  const defaultSettings: RepositorySettings = {
    owner,
    repo,
    enabled: false,
    effectiveEnabled: false,
    autofixEnabled: false,
    sensitivity: 50,
  };

  if (!SETTINGS_API_URL) {
    console.warn(`SETTINGS_API_URL not configured, reviews disabled for ${owner}/${repo}`);
    return defaultSettings;
  }

  try {
    const headers: Record<string, string> = {};
    if (REVIEW_AGENT_API_KEY) {
      headers["X-API-Key"] = REVIEW_AGENT_API_KEY;
    }
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/settings/${owner}/${repo}`, {
      headers,
    });
    if (!response.ok) {
      console.warn(
        `Failed to fetch settings for ${owner}/${repo} (${response.status}), features disabled`
      );
      return defaultSettings;
    }
    return (await response.json()) as RepositorySettings;
  } catch (error) {
    console.warn(`Error fetching settings for ${owner}/${repo}:`, error);
    return defaultSettings;
  }
}

export async function getCustomReviewRules(owner: string, repo: string): Promise<string | null> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/review-rules/${owner}/${repo}`, {
      headers: {
        "X-API-Key": REVIEW_AGENT_API_KEY,
      },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { rules?: string };
    return data.rules || null;
  } catch (error) {
    console.warn(`Error fetching custom rules for ${owner}/${repo}:`, error);
    return null;
  }
}

export async function getRuntimeAiConfig(
  owner: string,
  repo: string
): Promise<RuntimeAiConfig | null> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/ai-config/${owner}/${repo}`, {
      headers: {
        "X-API-Key": REVIEW_AGENT_API_KEY,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      authMethod?: "API_KEY" | "OAUTH_TOKEN";
      model?: string;
      credential?: string;
      useDefault?: boolean;
    };

    if (data.useDefault) {
      return null;
    }

    if (!data.authMethod || !data.model || !data.credential) {
      throw new Error("AI credentials are not configured for this organization");
    }

    return {
      authMethod: data.authMethod,
      model: data.model,
      credential: data.credential,
    };
} catch (error) {
  if (error instanceof Error && error.message.includes("AI credentials are not configured")) {
    throw error;
  }
  console.warn(`Error fetching AI config for ${owner}/${repo}:`, error);
  return null;
}
}

export async function recordReview(data: {
  githubRepoId: number;
  owner: string;
  repo: string;
  pullNumber: number;
  reviewType: "initial" | "comment_reply";
  reviewId?: number;
  commentId?: number;
  tokensUsed?: number;
}): Promise<string | null> {
  if (!SETTINGS_API_URL) {
    console.warn("SETTINGS_API_URL not configured, skipping review recording");
    return null;
  }

  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (REVIEW_AGENT_API_KEY) {
      headers["X-API-Key"] = REVIEW_AGENT_API_KEY;
    }
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/reviews`, {
      method: "POST",
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      console.warn(`Failed to record review: ${response.status}`);
      return null;
    }

    const result = (await response.json()) as { id?: string };
    return result.id || null;
  } catch (error) {
    console.warn("Error recording review:", error);
    return null;
  }
}

export async function recordReviewComments(
  reviewId: string,
  issues: CodeIssue[],
  triageResult?: {
    fixedIssues: Array<{
      issue: CodeIssue;
      commitSha: string;
      explanation: string;
      diff: string;
      githubCommentId?: number;
    }>;
    skippedIssues: Array<{
      issue: CodeIssue;
      reason: string;
    }>;
    clarificationIssues?: Array<{
      issue: CodeIssue;
      question: string;
      reason: string;
      githubCommentId?: number;
    }>;
  }
): Promise<void> {
  if (!SETTINGS_API_URL) return;

  type TriageFixItem = NonNullable<typeof triageResult>["fixedIssues"][number];
  const triageMap = new Map<string, TriageFixItem>();
  for (const f of triageResult?.fixedIssues ?? []) {
    triageMap.set(`${f.issue.file}:${f.issue.line}`, f);
  }

  type TriageClarificationItem = {
    issue: CodeIssue;
    question: string;
    reason: string;
    githubCommentId?: number;
  };
  const clarificationMap = new Map<string, TriageClarificationItem>();
  for (const c of triageResult?.clarificationIssues ?? []) {
    clarificationMap.set(`${c.issue.file}:${c.issue.line}`, c);
  }

  const comments = issues.map((issue) => {
    const tf = triageMap.get(`${issue.file}:${issue.line}`);
    const tc = clarificationMap.get(`${issue.file}:${issue.line}`);
    const fingerprint = buildIssueFingerprint(issue);
    return {
      type: issue.type,
      body: issue.message,
      path: issue.file,
      line: issue.line,
      githubCommentId: tf?.githubCommentId || tc?.githubCommentId || null,
      fingerprint,
      fix: tf
        ? {
            diff: tf.diff,
            summary: issue.suggestion || issue.message,
            commitSha: tf.commitSha,
            fingerprint,
          }
        : tc
          ? {
              status: "WAITING_FOR_USER",
              summary: tc.reason,
              clarificationQuestion: tc.question,
              clarificationContext: {
                reason: tc.reason,
                question: tc.question,
              },
              fingerprint,
            }
          : issue.suggestedCode
            ? { diff: issue.suggestedCode, summary: issue.suggestion || null, fingerprint }
            : null,
    };
  });

  try {
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/reviews/${reviewId}/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": REVIEW_AGENT_API_KEY || "",
      },
      body: JSON.stringify({ comments }),
    });

    if (!response.ok) {
      console.warn(`Failed to record review comments: ${response.status}`);
    }
  } catch (error) {
    console.warn("Error recording review comments:", error);
  }
}

export async function getSuppressedIssueFingerprints(
  owner: string,
  repo: string,
  pullNumber: number,
  fingerprints: string[]
): Promise<Set<string>> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY || fingerprints.length === 0) {
    return new Set();
  }

  try {
    const response = await fetch(
      `${SETTINGS_API_URL}/api/internal/clarification-locks/suppressions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": REVIEW_AGENT_API_KEY,
        },
        body: JSON.stringify({ owner, repo, pullNumber, fingerprints }),
      }
    );
    if (!response.ok) {
      return new Set();
    }
    const data = (await response.json()) as { suppressedFingerprints?: string[] };
    return new Set(data.suppressedFingerprints || []);
  } catch {
    return new Set();
  }
}

export async function hasPendingClarificationLocks(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<boolean> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return false;
  }

  try {
    const response = await fetch(
      `${SETTINGS_API_URL}/api/internal/clarification-locks/pending/${owner}/${repo}/${pullNumber}`,
      {
        headers: { "X-API-Key": REVIEW_AGENT_API_KEY },
      }
    );
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as { hasPending?: boolean };
    return Boolean(data.hasPending);
  } catch {
    return false;
  }
}

export async function acquireExecutionLock(key: string, context: string): Promise<boolean> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return true;
  }

  try {
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/execution-locks/acquire`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": REVIEW_AGENT_API_KEY,
      },
      body: JSON.stringify({ key, context }),
    });
    if (!response.ok) {
      return false;
    }
    const data = (await response.json()) as { acquired?: boolean };
    return Boolean(data.acquired);
  } catch {
    return false;
  }
}

export interface ClarificationLockInfo {
  owner: string;
  repo: string;
  pullNumber: number;
  fingerprint: string;
  file: string;
  line: number;
  issueType: string;
  message: string;
}

export async function getClarificationLockByThread(
  owner: string,
  repo: string,
  pullNumber: number,
  threadCommentId: number
): Promise<ClarificationLockInfo | null> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(
      `${SETTINGS_API_URL}/api/internal/clarification-locks/by-thread/${owner}/${repo}/${pullNumber}/${threadCommentId}`,
      {
        headers: { "X-API-Key": REVIEW_AGENT_API_KEY },
      }
    );
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { lock?: ClarificationLockInfo | null };
    return data.lock || null;
  } catch {
    return null;
  }
}

export async function resolveClarificationLock(
  owner: string,
  repo: string,
  pullNumber: number,
  fingerprint: string,
  commitSha?: string
): Promise<void> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return;
  }

  try {
    await fetch(`${SETTINGS_API_URL}/api/internal/clarification-locks/resolve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": REVIEW_AGENT_API_KEY,
      },
      body: JSON.stringify({ owner, repo, pullNumber, fingerprint, commitSha }),
    });
  } catch {
    // best effort
  }
}
