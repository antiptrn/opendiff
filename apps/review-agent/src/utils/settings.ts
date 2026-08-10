import type { CodeIssue, RepositorySettings } from "shared/types";
import { buildIssueFingerprint } from "./issue-fingerprint";

export type { RepositorySettings };

export interface RuntimeAiConfig {
  authMethod: "API_KEY" | "OAUTH_TOKEN";
  model: string;
  credential: string;
  refreshToken?: string;
  accountId?: string;
}

const SETTINGS_API_URL = process.env.SETTINGS_API_URL;
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY;

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SETTINGS_API_TIMEOUT_MS = parsePositiveIntegerEnv("SETTINGS_API_TIMEOUT_MS", 10_000);

export class SettingsApiUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "SettingsApiUnavailableError";
  }
}

export function isSettingsApiUnavailableError(
  error: unknown
): error is SettingsApiUnavailableError {
  return error instanceof SettingsApiUnavailableError;
}

function buildSettingsApiUrl(pathname: string): URL | null {
  if (!SETTINGS_API_URL) {
    return null;
  }
  return new URL(pathname, SETTINGS_API_URL.replace(/\/?$/, "/"));
}

async function fetchSettingsApi(url: URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SETTINGS_API_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new SettingsApiUnavailableError(`Settings API request failed: ${reason}`);
  } finally {
    clearTimeout(timeout);
  }
}

function headersWithApiKey(extra?: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    ...(REVIEW_AGENT_API_KEY ? { "X-API-Key": REVIEW_AGENT_API_KEY } : {}),
  };
}

export async function getRepositorySettings(
  owner: string,
  repo: string,
  githubRepoId?: number
): Promise<RepositorySettings> {
  const defaultSettings: RepositorySettings = {
    owner,
    repo,
    enabled: false,
    effectiveEnabled: false,
    approveEnabled: false,
    autofixEnabled: false,
    reviewIncludedDirs: "",
    autofixIncludedDirs: "",
    reviewIgnoredDirs: "",
    autofixIgnoredDirs: "",
    sensitivity: 50,
  };

  if (!SETTINGS_API_URL) {
    const message = `SETTINGS_API_URL not configured, reviews disabled for ${owner}/${repo}`;
    if (process.env.NODE_ENV === "production") {
      throw new SettingsApiUnavailableError(message);
    }
    console.warn(message);
    return defaultSettings;
  }

  const url = buildSettingsApiUrl(
    `/api/internal/settings/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
  );
  if (!url) {
    return defaultSettings;
  }
  if (githubRepoId) {
    url.searchParams.set("githubRepoId", String(githubRepoId));
  }

  const response = await fetchSettingsApi(url, {
    headers: headersWithApiKey(),
  });
  if (!response.ok) {
    throw new SettingsApiUnavailableError(
      `Failed to fetch settings for ${owner}/${repo} (${response.status})`,
      response.status
    );
  }
  const settings = (await response.json()) as RepositorySettings;
  return {
    ...settings,
    approveEnabled: settings.approveEnabled === true,
  };
}

export async function getCustomReviewRules(
  owner: string,
  repo: string,
  githubRepoId?: number
): Promise<string | null> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return null;
  }

  try {
    const url = buildSettingsApiUrl(
      `/api/internal/review-rules/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
    if (!url) {
      return null;
    }
    if (githubRepoId) {
      url.searchParams.set("githubRepoId", String(githubRepoId));
    }

    const response = await fetchSettingsApi(url, {
      headers: headersWithApiKey(),
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
  repo: string,
  githubRepoId?: number
): Promise<RuntimeAiConfig | null> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return null;
  }

  try {
    const url = buildSettingsApiUrl(
      `/api/internal/ai-config/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`
    );
    if (!url) {
      return null;
    }
    if (githubRepoId) {
      url.searchParams.set("githubRepoId", String(githubRepoId));
    }

    const response = await fetchSettingsApi(url, {
      headers: headersWithApiKey(),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      authMethod?: "API_KEY" | "OAUTH_TOKEN";
      model?: string;
      credential?: string;
      refreshToken?: string;
      accountId?: string;
      useDefault?: boolean;
    };

    if (data.useDefault) {
      return null;
    }

    if (!data.authMethod || !data.model || !data.credential) {
      return null;
    }

    return {
      authMethod: data.authMethod,
      model: data.model,
      credential: data.credential,
      ...(data.refreshToken ? { refreshToken: data.refreshToken } : {}),
      ...(data.accountId ? { accountId: data.accountId } : {}),
    };
  } catch (error) {
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
  pullTitle?: string | null;
  pullAuthor?: string | null;
  tokensUsed?: number;
}): Promise<string | null> {
  if (!SETTINGS_API_URL) {
    console.warn("SETTINGS_API_URL not configured, skipping review recording");
    return null;
  }

  try {
    const url = buildSettingsApiUrl("/api/internal/reviews");
    if (!url) {
      return null;
    }
    const response = await fetchSettingsApi(url, {
      method: "POST",
      headers: headersWithApiKey({ "Content-Type": "application/json" }),
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
    const url = buildSettingsApiUrl(`/api/internal/reviews/${reviewId}/comments`);
    if (!url) {
      return;
    }
    const response = await fetchSettingsApi(url, {
      method: "POST",
      headers: headersWithApiKey({ "Content-Type": "application/json" }),
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
    const url = buildSettingsApiUrl("/api/internal/clarification-locks/suppressions");
    if (!url) {
      return new Set();
    }
    const response = await fetchSettingsApi(url, {
      method: "POST",
      headers: headersWithApiKey({ "Content-Type": "application/json" }),
      body: JSON.stringify({ owner, repo, pullNumber, fingerprints }),
    });
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
    const url = buildSettingsApiUrl(
      `/api/internal/clarification-locks/pending/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${pullNumber}`
    );
    if (!url) {
      return false;
    }
    const response = await fetchSettingsApi(url, {
      headers: headersWithApiKey(),
    });
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
    const url = buildSettingsApiUrl("/api/internal/execution-locks/acquire");
    if (!url) {
      return true;
    }
    const response = await fetchSettingsApi(url, {
      method: "POST",
      headers: headersWithApiKey({ "Content-Type": "application/json" }),
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
    const url = buildSettingsApiUrl(
      `/api/internal/clarification-locks/by-thread/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${pullNumber}/${threadCommentId}`
    );
    if (!url) {
      return null;
    }
    const response = await fetchSettingsApi(url, {
      headers: headersWithApiKey(),
    });
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
    const url = buildSettingsApiUrl("/api/internal/clarification-locks/resolve");
    if (!url) {
      return;
    }
    await fetchSettingsApi(url, {
      method: "POST",
      headers: headersWithApiKey({ "Content-Type": "application/json" }),
      body: JSON.stringify({ owner, repo, pullNumber, fingerprint, commitSha }),
    });
  } catch {
    // best effort
  }
}
