import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// ── Types ────────────────────────────────────────────────────────────────────

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

// ── GitHub App Auth ──────────────────────────────────────────────────────────

export function getGitHubAppPrivateKey(): string | null {
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

export function createGitHubAppJwt(): string | null {
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
    console.warn("[github] No JWT available (missing GITHUB_APP_ID or private key)");
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
      console.warn(`[github] Installation lookup failed for ${owner}/${repo}: ${instRes.status}`);
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
        `[github] Token creation failed for installation ${inst.id}: ${tokenRes.status}`
      );
      return null;
    }
    const tokenData = (await tokenRes.json()) as { token: string };
    return tokenData.token;
  } catch (err) {
    console.warn(`[github] Error getting installation token for ${owner}/${repo}:`, err);
    return null;
  }
}
