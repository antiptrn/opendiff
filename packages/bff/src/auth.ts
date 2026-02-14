import { prisma } from "./db";

export interface ProviderUser {
  id: number | string;
  login?: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  _provider: "github" | "google";
  _githubId?: number;
  _googleId?: string;
}

// Fetch GitHub user data from an access token
export async function getGitHubUserFromToken(token: string) {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) {
    return null;
  }

  return userResponse.json();
}

// Fetch Google user data from an access token
export async function getGoogleUserFromToken(token: string) {
  const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!userResponse.ok) {
    return null;
  }

  return userResponse.json();
}

// Unified helper: resolve an OAuth token to provider user data
export async function getUserFromToken(token: string): Promise<ProviderUser | null> {
  // Try GitHub first
  const githubUser = await getGitHubUserFromToken(token);
  if (githubUser) {
    return {
      ...githubUser,
      _provider: "github" as const,
      _githubId: githubUser.id,
    };
  }

  // Try Google
  const googleUser = await getGoogleUserFromToken(token);
  if (googleUser) {
    return {
      id: googleUser.id,
      login: googleUser.email?.split("@")[0],
      name: googleUser.name,
      email: googleUser.email,
      avatar_url: googleUser.picture,
      _provider: "google" as const,
      _googleId: googleUser.id,
    };
  }

  return null;
}

// Construct Prisma where clause from provider user data
export function getDbUserWhere(providerUser: ProviderUser) {
  if (providerUser._provider === "github" && providerUser._githubId) {
    return { githubId: providerUser._githubId };
  }
  if (providerUser._provider === "google" && providerUser._googleId) {
    return { googleId: providerUser._googleId };
  }
  return null;
}

// Look up database user from provider user data
export async function findDbUser(providerUser: ProviderUser) {
  const where = getDbUserWhere(providerUser);
  if (!where) return null;
  return prisma.user.findUnique({ where });
}

// Convenience: resolve an OAuth token directly to a database user
export async function findDbUserFromToken(token: string) {
  const isGitHubToken = /^(gho_|ghu_|ghp_|github_pat_)/.test(token);

  if (isGitHubToken) {
    try {
      const githubResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });

      if (githubResponse.ok) {
        const githubUser = await githubResponse.json();
        return prisma.user.findUnique({
          where: { githubId: githubUser.id },
        });
      }
    } catch (error) {
      console.error("Failed to connect to GitHub API:", error);
    }
  } else {
    try {
      const googleResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (googleResponse.ok) {
        const googleUser = await googleResponse.json();
        return prisma.user.findUnique({
          where: { googleId: googleUser.id },
        });
      }
    } catch (error) {
      console.error("Failed to connect to Google API:", error);
    }
  }

  return null;
}

// Extract organization ID from X-Organization-Id header
export function getOrgIdFromHeader(c: { req: { header: (name: string) => string | undefined } }):
  | string
  | undefined {
  return c.req.header("X-Organization-Id");
}
