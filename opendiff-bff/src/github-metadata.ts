import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// --- Types ---

export interface RepoMeta {
  id: number;
  owner: string;
  repo: string;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  avatarUrl: string | null;
  defaultBranch: string;
  htmlUrl: string;
  language: string | null;
  pushedAt: string | null;
}

export interface PRMeta {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  author: string | null;
  authorAvatarUrl: string | null;
  headBranch: string;
  baseBranch: string;
  htmlUrl: string;
  assignees: string[];
  labels: string[];
  reviewers: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Cache ---

interface CacheEntry<T> {
  data: T;
  expires: number;
}

const repoCache = new Map<string, CacheEntry<RepoMeta>>();
const prCache = new Map<string, CacheEntry<PRMeta>>();

const REPO_TTL = 5 * 60 * 1000; // 5 minutes
const PR_TTL = 60 * 1000; // 1 minute

// --- GitHub App Auth Helpers ---

function getGitHubAppPrivateKey(): string | null {
  const raw = process.env.GITHUB_PRIVATE_KEY;
  if (raw) return raw;
  const path = process.env.GITHUB_PRIVATE_KEY_PATH;
  if (path) {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      return null;
    }
  }
  return null;
}

function createGitHubAppJwt(): string | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = getGitHubAppPrivateKey();
  if (!appId || !privateKey) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })
  ).toString("base64url");
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey, "base64url");
  return `${header}.${payload}.${signature}`;
}

export async function getInstallationTokenForRepo(
  owner: string,
  repo: string
): Promise<string | null> {
  const jwt = createGitHubAppJwt();
  if (!jwt) {
    console.warn("[github-metadata] No JWT available (missing GITHUB_APP_ID or private key)");
    return null;
  }

  try {
    const instRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!instRes.ok) {
      console.warn(
        `[github-metadata] Installation lookup failed for ${owner}/${repo}: ${instRes.status}`
      );
      return null;
    }
    const inst = (await instRes.json()) as { id: number };

    const tokenRes = await fetch(
      `https://api.github.com/app/installations/${inst.id}/access_tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!tokenRes.ok) {
      console.warn(
        `[github-metadata] Token creation failed for installation ${inst.id}: ${tokenRes.status}`
      );
      return null;
    }
    const tokenData = (await tokenRes.json()) as { token: string };
    return tokenData.token;
  } catch (err) {
    console.warn(`[github-metadata] Error getting installation token for ${owner}/${repo}:`, err);
    return null;
  }
}

// --- Fetch Functions ---

export async function fetchRepoMetadata(owner: string, repo: string): Promise<RepoMeta | null> {
  const cacheKey = `${owner}/${repo}`;
  const cached = repoCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const token = await getInstallationTokenForRepo(owner, repo);
  if (!token) return null;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as {
      id: number;
      owner: { login: string; avatar_url: string };
      name: string;
      full_name: string;
      description: string | null;
      private: boolean;
      default_branch: string;
      html_url: string;
      language: string | null;
      pushed_at: string | null;
    };

    const meta: RepoMeta = {
      id: data.id,
      owner: data.owner.login,
      repo: data.name,
      fullName: data.full_name,
      description: data.description,
      isPrivate: data.private,
      avatarUrl: data.owner.avatar_url,
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
      language: data.language,
      pushedAt: data.pushed_at,
    };

    repoCache.set(cacheKey, { data: meta, expires: Date.now() + REPO_TTL });
    return meta;
  } catch {
    return null;
  }
}

export async function fetchPRMetadata(
  owner: string,
  repo: string,
  pullNumber: number
): Promise<PRMeta | null> {
  const cacheKey = `${owner}/${repo}#${pullNumber}`;
  const cached = prCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  const token = await getInstallationTokenForRepo(owner, repo);
  if (!token) return null;

  try {
    // Fetch PR data
    const prRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!prRes.ok) return null;

    const pr = (await prRes.json()) as {
      number: number;
      title: string;
      body: string | null;
      state: "open" | "closed";
      merged: boolean;
      user: { login: string; avatar_url: string } | null;
      head: { ref: string };
      base: { ref: string };
      html_url: string;
      assignees: Array<{ login: string }>;
      labels: Array<{ name: string }>;
      requested_reviewers: Array<{ login: string }>;
      created_at: string;
      updated_at: string;
    };

    const meta: PRMeta = {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      merged: pr.merged,
      author: pr.user?.login ?? null,
      authorAvatarUrl: pr.user?.avatar_url ?? null,
      headBranch: pr.head.ref,
      baseBranch: pr.base.ref,
      htmlUrl: pr.html_url,
      assignees: pr.assignees.map((a) => a.login),
      labels: pr.labels.map((l) => l.name),
      reviewers: pr.requested_reviewers.map((r) => r.login),
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
    };

    prCache.set(cacheKey, { data: meta, expires: Date.now() + PR_TTL });
    return meta;
  } catch {
    return null;
  }
}

// Batch fetch PR metadata for multiple reviews
export async function fetchPRMetadataBatch(
  reviews: Array<{ owner: string; repo: string; pullNumber: number }>
): Promise<Map<string, PRMeta | null>> {
  const results = new Map<string, PRMeta | null>();

  // Fetch in parallel, but limit concurrency
  const BATCH_SIZE = 10;
  for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
    const batch = reviews.slice(i, i + BATCH_SIZE);
    const promises = batch.map(async (r) => {
      const key = `${r.owner}/${r.repo}#${r.pullNumber}`;
      const meta = await fetchPRMetadata(r.owner, r.repo, r.pullNumber);
      results.set(key, meta);
    });
    await Promise.all(promises);
  }

  return results;
}

// Clear cache (useful for testing or manual refresh)
export function clearMetadataCache(): void {
  repoCache.clear();
  prCache.clear();
}
