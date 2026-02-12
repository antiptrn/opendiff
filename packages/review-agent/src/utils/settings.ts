import type { CodeIssue, RepositorySettings } from "shared/types";

export type { RepositorySettings };

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
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/settings/${owner}/${repo}`, { headers });
    if (!response.ok) {
      console.warn(`Failed to fetch settings for ${owner}/${repo} (${response.status}), features disabled`);
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
  }
): Promise<void> {
  if (!SETTINGS_API_URL) return;

  type TriageFixItem = NonNullable<typeof triageResult>["fixedIssues"][number];
  const triageMap = new Map<string, TriageFixItem>();
  for (const f of triageResult?.fixedIssues ?? []) {
    triageMap.set(`${f.issue.file}:${f.issue.line}`, f);
  }

  const comments = issues.map((issue) => {
    const tf = triageMap.get(`${issue.file}:${issue.line}`);
    return {
      body: issue.message,
      path: issue.file,
      line: issue.line,
      githubCommentId: tf?.githubCommentId || null,
      fix: tf
        ? { diff: tf.diff, summary: issue.suggestion || issue.message, commitSha: tf.commitSha }
        : issue.suggestedCode
          ? { diff: issue.suggestedCode, summary: issue.suggestion || null }
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
