import { Hono } from "hono";
import { logAudit } from "../audit";
import { findDbUser, getOrgIdFromHeader, getUserFromToken } from "../auth";
import { prisma } from "../db";
import { fetchRepoMetadata } from "../github-metadata";
import { createNotification } from "../notifications";

// Tier hierarchy for comparison
const _TIER_HIERARCHY: Record<string, number> = {
  FREE: 0,
  BYOK: 1,
  CODE_REVIEW: 2,
  TRIAGE: 3,
};

// Helper function to fetch a file from GitHub
async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string,
  githubToken: string
): Promise<string | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.raw+json",
      },
    });
    if (response.ok) {
      return await response.text();
    }
    return null;
  } catch {
    return null;
  }
}

const reposRoutes = new Hono();

// Fetch user's repositories with optional search
reposRoutes.get("/repos", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const query = c.req.query("q") || "";

  try {
    // Determine the GitHub token to use
    let githubToken = token;

    // Check if this is a Google user by trying to get user info
    const providerUser = await getUserFromToken(token);
    if (providerUser?._provider === "google") {
      // For Google users, we need their stored GitHub token
      const user = await findDbUser(providerUser);
      if (!user?.githubAccessToken) {
        return c.json({ error: "GitHub not linked", code: "GITHUB_NOT_LINKED" }, 400);
      }
      githubToken = user.githubAccessToken;
    }

    // Fetch user's repos (includes repos they have access to)
    const reposResponse = await fetch(
      "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, 500);
    }

    const repos = await reposResponse.json();

    // Filter by search query if provided
    const filteredRepos = query
      ? repos.filter((repo: { full_name: string }) =>
          repo.full_name.toLowerCase().includes(query.toLowerCase())
        )
      : repos;

    // Return simplified repo data
    return c.json(
      filteredRepos.slice(0, 50).map(
        (repo: {
          full_name: string;
          owner: { login: string };
          name: string;
          private: boolean;
          language: string | null;
          pushed_at: string | null;
          description: string | null;
        }) => ({
          full_name: repo.full_name,
          owner: repo.owner.login,
          name: repo.name,
          private: repo.private,
          language: repo.language,
          pushed_at: repo.pushed_at,
          description: repo.description,
        })
      )
    );
  } catch {
    return c.json({ error: "Failed to fetch repos" }, 500);
  }
});

// Repository settings endpoints

// Get all activated repos for user
reposRoutes.get("/settings", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const orgId = c.req.header("X-Organization-Id");

  try {
    // Get repos the user has access to
    const reposResponse = await fetch(
      "https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, 500);
    }

    const repos = await reposResponse.json();
    const repoIdentifiers = repos.map((r: { owner: { login: string }; name: string }) => ({
      owner: r.owner.login,
      repo: r.name,
    }));

    // Get the current user's seat in the organization
    const githubUser = await getUserFromToken(token);
    let canEnableReviews = false;
    let canEnableTriage = false;

    if (githubUser && orgId) {
      const user = await findDbUser(githubUser);

      if (user) {
        const membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: user.id,
            },
          },
          include: { organization: true },
        });

        if (membership?.hasSeat && membership.organization.subscriptionStatus === "ACTIVE") {
          const tier = membership.organization.subscriptionTier;
          canEnableReviews = tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
          canEnableTriage = tier === "TRIAGE" || tier === "BYOK";
        }
      }
    }

    // Get settings for user's repos that are enabled
    const settings = await prisma.repositorySettings.findMany({
      where: {
        AND: [
          {
            OR: repoIdentifiers.map((r: { owner: string; repo: string }) => ({
              owner: r.owner,
              repo: r.repo,
            })),
          },
          {
            OR: [{ enabled: true }, { triageEnabled: true }],
          },
        ],
      },
    });

    return c.json(
      settings.map((s) => ({
        owner: s.owner,
        repo: s.repo,
        enabled: s.enabled,
        triageEnabled: s.triageEnabled,
        effectiveEnabled: s.enabled && canEnableReviews,
        effectiveTriageEnabled: s.triageEnabled && canEnableTriage,
      }))
    );
  } catch (error) {
    console.error("Error fetching activated repos:", error);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

reposRoutes.get("/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();

  const settings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
    include: {
      organization: true,
    },
  });

  // Return default settings (disabled) if no record exists
  // Features require explicit enabling by a subscriber
  if (!settings) {
    return c.json({
      owner,
      repo,
      enabled: false,
      triageEnabled: false,
      customReviewRules: "",
      effectiveEnabled: false,
      effectiveTriageEnabled: false,
      autofixEnabled: false,
      sensitivity: 50,
    });
  }

  // Calculate effective state based on organization's subscription
  const org = settings.organization;
  const hasActiveSubscription = org && org.subscriptionStatus === "ACTIVE" && org.subscriptionTier;
  const tier = org?.subscriptionTier;

  // Can enable reviews if org has active subscription with review capability
  const canEnableReviews =
    hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK");
  // Can enable triage if org has active subscription with triage capability
  const canEnableTriage = hasActiveSubscription && (tier === "TRIAGE" || tier === "BYOK");

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    autofixEnabled: settings.autofixEnabled,
    sensitivity: settings.sensitivity,
    customReviewRules: settings.customReviewRules || "",
    // Effective state = stored setting AND org has subscription with permission
    effectiveEnabled: settings.enabled && canEnableReviews,
    effectiveTriageEnabled: settings.triageEnabled && canEnableTriage,
  });
});

reposRoutes.put("/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const authHeader = c.req.header("Authorization");
  const body = await c.req.json();
  const orgId = getOrgIdFromHeader(c);

  // Extract settings from body (githubRepoId stored for stable identification)
  const { enabled, triageEnabled, autofixEnabled, sensitivity, customReviewRules, githubRepoId } =
    body as {
      enabled?: boolean;
      triageEnabled?: boolean;
      autofixEnabled?: boolean;
      sensitivity?: number;
      customReviewRules?: string;
      githubRepoId?: number;
    };
  let userId: string | undefined;
  let canEnableReviews = false;
  let canEnableTriage = false;

  // Validate seat membership if user is authenticated and orgId is provided
  if (authHeader?.startsWith("Bearer ") && orgId) {
    const token = authHeader.slice(7);
    const githubUser = await getUserFromToken(token);

    if (githubUser) {
      const user = await findDbUser(githubUser);

      if (user) {
        userId = user.id;

        // Check if user is a member of the organization with a seat
        const membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: user.id,
            },
          },
          include: { organization: true },
        });

        if (membership?.hasSeat && membership.organization.subscriptionStatus === "ACTIVE") {
          const tier = membership.organization.subscriptionTier;
          canEnableReviews = tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
          canEnableTriage = tier === "TRIAGE" || tier === "BYOK";
        }

        // Enforce subscription limits
        if (enabled && !canEnableReviews) {
          return c.json(
            {
              error: "Reviews require an active paid subscription (BYOK, Code Review, or Triage)",
            },
            403
          );
        }

        if (triageEnabled && !canEnableTriage) {
          return c.json(
            {
              error: "Triage mode requires a BYOK or Triage subscription",
            },
            403
          );
        }
      }
    }
  } else if (enabled || triageEnabled) {
    // If trying to enable features but not authenticated or no orgId, reject
    return c.json(
      {
        error: "Authentication and organization context required to enable reviews",
      },
      401
    );
  }

  const settings = await prisma.repositorySettings.upsert({
    where: { owner_repo: { owner, repo } },
    update: {
      enabled: enabled ?? false,
      triageEnabled: triageEnabled ?? false,
      autofixEnabled: autofixEnabled !== undefined ? autofixEnabled : undefined,
      sensitivity: sensitivity !== undefined ? Math.max(0, Math.min(100, sensitivity)) : undefined,
      customReviewRules: customReviewRules !== undefined ? customReviewRules || null : undefined,
      organizationId: orgId || undefined,
      enabledById: userId,
      // Update githubRepoId if provided (stable identifier)
      ...(githubRepoId && { githubRepoId: BigInt(githubRepoId) }),
    },
    create: {
      owner,
      repo,
      enabled: enabled ?? false,
      triageEnabled: triageEnabled ?? false,
      autofixEnabled: autofixEnabled ?? true,
      sensitivity: sensitivity !== undefined ? Math.max(0, Math.min(100, sensitivity)) : 50,
      customReviewRules: customReviewRules || null,
      organizationId: orgId || undefined,
      enabledById: userId,
      githubRepoId: githubRepoId ? BigInt(githubRepoId) : null,
    },
  });

  await logAudit({
    organizationId: orgId,
    userId,
    action: "repo.settings.updated",
    target: `${owner}/${repo}`,
    metadata: { enabled, triageEnabled },
    c,
  });

  if (orgId) {
    createNotification({
      organizationId: orgId,
      type: "REPO_ADDED",
      title: "Repository added",
      body: `${owner}/${repo} has been added`,
    }).catch(console.error);
  }

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    githubRepoId: settings.githubRepoId ? Number(settings.githubRepoId) : null,
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    autofixEnabled: settings.autofixEnabled,
    sensitivity: settings.sensitivity,
    customReviewRules: settings.customReviewRules || "",
    effectiveEnabled: settings.enabled && canEnableReviews,
    effectiveTriageEnabled: settings.triageEnabled && canEnableTriage,
  });
});

// Get all enabled repos for an organization
// Fetches GitHub metadata on-demand with caching
reposRoutes.get("/org/repos", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const orgId = c.req.header("X-Organization-Id");
  const searchQuery = c.req.query("q")?.toLowerCase() || "";

  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  try {
    const providerUser = await getUserFromToken(token);
    if (!providerUser) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const user = await findDbUser(providerUser);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify user is a member of the organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return c.json({ error: "Not a member of this organization" }, 403);
    }

    // Get all repos for this organization (filter by owner/repo names)
    const repos = await prisma.repositorySettings.findMany({
      where: {
        AND: [
          { organizationId: orgId },
          ...(searchQuery
            ? [
                {
                  OR: [
                    { owner: { contains: searchQuery, mode: "insensitive" as const } },
                    { repo: { contains: searchQuery, mode: "insensitive" as const } },
                  ],
                },
              ]
            : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    // Calculate effective state based on subscription
    const org = membership.organization;
    const hasActiveSubscription = org.subscriptionStatus === "ACTIVE" && org.subscriptionTier;
    const tier = org.subscriptionTier;
    const canEnableReviews =
      hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK");
    const canEnableTriage = hasActiveSubscription && (tier === "TRIAGE" || tier === "BYOK");

    // Batch fetch GitHub metadata (with caching)
    const repoMetaPromises = repos.map((r) => fetchRepoMetadata(r.owner, r.repo));
    const repoMetas = await Promise.all(repoMetaPromises);

    return c.json(
      repos.map((r, i) => {
        const meta = repoMetas[i];
        return {
          owner: r.owner,
          repo: r.repo,
          githubRepoId: r.githubRepoId ? Number(r.githubRepoId) : null,
          fullName: meta?.fullName ?? `${r.owner}/${r.repo}`,
          description: meta?.description ?? null,
          isPrivate: meta?.isPrivate ?? false,
          avatarUrl: meta?.avatarUrl ?? null,
          defaultBranch: meta?.defaultBranch ?? null,
          htmlUrl: meta?.htmlUrl ?? `https://github.com/${r.owner}/${r.repo}`,
          language: meta?.language ?? null,
          pushedAt: meta?.pushedAt ?? null,
          enabled: r.enabled,
          triageEnabled: r.triageEnabled,
          autofixEnabled: r.autofixEnabled,
          sensitivity: r.sensitivity,
          customReviewRules: r.customReviewRules || "",
          effectiveEnabled: r.enabled && canEnableReviews,
          effectiveTriageEnabled: r.triageEnabled && canEnableTriage,
        };
      })
    );
  } catch (error) {
    console.error("Error fetching org repos:", error);
    return c.json({ error: "Failed to fetch repos" }, 500);
  }
});

// Get a single repo for an organization by owner/repo
// Fetches GitHub metadata on-demand with caching
reposRoutes.get("/org/repos/:owner/:repo", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const orgId = c.req.header("X-Organization-Id");
  const { owner, repo } = c.req.param();

  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  try {
    const providerUser = await getUserFromToken(token);
    if (!providerUser) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const user = await findDbUser(providerUser);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify user is a member of the organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return c.json({ error: "Not a member of this organization" }, 403);
    }

    // Get the specific repo
    const r = await prisma.repositorySettings.findFirst({
      where: {
        organizationId: orgId,
        owner,
        repo,
      },
    });

    if (!r) {
      return c.json({ error: "Repository not found" }, 404);
    }

    // Calculate effective state based on subscription
    const org = membership.organization;
    const hasActiveSubscription = org.subscriptionStatus === "ACTIVE" && org.subscriptionTier;
    const tier = org.subscriptionTier;
    const canEnableReviews =
      hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK");
    const canEnableTriage = hasActiveSubscription && (tier === "TRIAGE" || tier === "BYOK");

    // Fetch GitHub metadata on-demand
    const meta = await fetchRepoMetadata(r.owner, r.repo);

    return c.json({
      owner: r.owner,
      repo: r.repo,
      githubRepoId: r.githubRepoId ? Number(r.githubRepoId) : null,
      fullName: meta?.fullName ?? `${r.owner}/${r.repo}`,
      description: meta?.description ?? null,
      isPrivate: meta?.isPrivate ?? false,
      avatarUrl: meta?.avatarUrl ?? null,
      defaultBranch: meta?.defaultBranch ?? null,
      htmlUrl: meta?.htmlUrl ?? `https://github.com/${r.owner}/${r.repo}`,
      language: meta?.language ?? null,
      pushedAt: meta?.pushedAt ?? null,
      enabled: r.enabled,
      triageEnabled: r.triageEnabled,
      autofixEnabled: r.autofixEnabled,
      sensitivity: r.sensitivity,
      customReviewRules: r.customReviewRules || "",
      effectiveEnabled: r.enabled && canEnableReviews,
      effectiveTriageEnabled: r.triageEnabled && canEnableTriage,
    });
  } catch (error) {
    console.error("Error fetching org repo:", error);
    return c.json({ error: "Failed to fetch repo" }, 500);
  }
});

// Fetch community health files from GitHub (README, LICENSE, SECURITY, CONTRIBUTING)
// Returns the files directly without storing in database
reposRoutes.post("/org/repos/:owner/:repo/sync-readme", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const orgId = c.req.header("X-Organization-Id");
  const { owner, repo } = c.req.param();

  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  try {
    const providerUser = await getUserFromToken(token);
    if (!providerUser) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const user = await findDbUser(providerUser);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify user is a member of the organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
    });

    if (!membership) {
      return c.json({ error: "Not a member of this organization" }, 403);
    }

    // Check if repo exists in organization
    const repoSettings = await prisma.repositorySettings.findFirst({
      where: {
        organizationId: orgId,
        owner,
        repo,
      },
    });

    if (!repoSettings) {
      return c.json({ error: "Repository not found" }, 404);
    }

    // Need a GitHub token to fetch files
    const isGitHubToken = /^(gho_|ghu_|ghp_|github_pat_)/.test(token);
    let githubToken = isGitHubToken ? token : null;

    if (!githubToken && user.githubId) {
      const githubTokenHeader = c.req.header("X-GitHub-Token");
      if (githubTokenHeader) {
        githubToken = githubTokenHeader;
      }
    }

    if (!githubToken) {
      return c.json(
        {
          error:
            "GitHub access required to fetch docs. Please link your GitHub account or provide a GitHub token.",
          requiresGitHub: true,
        },
        400
      );
    }

    // Fetch README from GitHub (using the readme endpoint for automatic detection)
    const readmeResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, {
      headers: {
        Authorization: `Bearer ${githubToken}`,
        Accept: "application/vnd.github.raw+json",
      },
    });
    let readme: string | null = null;
    if (readmeResponse.ok) {
      readme = await readmeResponse.text();
    }

    // Fetch LICENSE (try common file names)
    let license: string | null = null;
    for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
      license = await fetchGitHubFile(owner, repo, name, githubToken);
      if (license) break;
    }

    // Fetch SECURITY.md (try common locations)
    let security: string | null = null;
    for (const path of ["SECURITY.md", ".github/SECURITY.md"]) {
      security = await fetchGitHubFile(owner, repo, path, githubToken);
      if (security) break;
    }

    // Fetch CONTRIBUTING.md (try common locations)
    let contributing: string | null = null;
    for (const path of ["CONTRIBUTING.md", ".github/CONTRIBUTING.md"]) {
      contributing = await fetchGitHubFile(owner, repo, path, githubToken);
      if (contributing) break;
    }

    // Return files directly (no longer stored in DB)
    return c.json({
      success: true,
      hasReadme: !!readme,
      hasLicense: !!license,
      hasSecurity: !!security,
      hasContributing: !!contributing,
      readme,
      license,
      security,
      contributing,
    });
  } catch (error) {
    console.error("Error fetching docs:", error);
    return c.json({ error: "Failed to fetch docs" }, 500);
  }
});

// Delete repository settings
reposRoutes.delete("/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get orgId from query param
  const orgId = c.req.query("orgId");

  // Check if settings exist
  const settings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  if (!settings) {
    return c.json({ error: "Repository settings not found" }, 404);
  }

  // Verify user has permission (member of the org that owns this repo settings)
  if (settings.organizationId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: settings.organizationId, userId: user.id },
      },
    });

    if (!membership) {
      return c.json({ error: "Not authorized to delete this repository" }, 403);
    }
  }

  // Delete the settings
  await prisma.repositorySettings.delete({
    where: { owner_repo: { owner, repo } },
  });

  await logAudit({
    organizationId: orgId || settings.organizationId || undefined,
    userId: user.id,
    action: "repo.settings.updated",
    target: `${owner}/${repo}`,
    metadata: { deleted: true },
    c,
  });

  return c.json({ success: true });
});

export { reposRoutes };
