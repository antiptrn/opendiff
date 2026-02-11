import { Hono } from "hono";
import { logAudit } from "../services/audit";
import { prisma } from "../db";
import { fetchRepoMetadata } from "../utils/github-metadata";
import { getAuthToken, getAuthUser, requireAuth, requireOrgAccess } from "../middleware/auth";
import { createNotification } from "../services/notifications";

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
reposRoutes.get("/repos", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const token = getAuthToken(c);
  const query = c.req.query("q") || "";

  try {
    // Check if Google user, use stored githubAccessToken
    const isGitHubToken = /^(gho_|ghu_|ghp_|github_pat_)/.test(token);
    const githubToken = isGitHubToken ? token : (user.githubAccessToken || null);
    if (!isGitHubToken && !user.githubAccessToken) {
      return c.json({ error: "GitHub not linked", code: "GITHUB_NOT_LINKED" }, 400);
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
        effectiveEnabled: s.enabled,
        effectiveTriageEnabled: s.triageEnabled,
      }))
    );
  } catch (error) {
    console.error("Error fetching activated repos:", error);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

reposRoutes.get("/settings/:owner/:repo", requireAuth(), async (c) => {
  const { owner, repo } = c.req.param();

  const settings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  // Return default settings (disabled) if no record exists
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

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    autofixEnabled: settings.autofixEnabled,
    sensitivity: settings.sensitivity,
    customReviewRules: settings.customReviewRules || "",
    effectiveEnabled: settings.enabled,
    effectiveTriageEnabled: settings.triageEnabled,
  });
});

reposRoutes.put("/settings/:owner/:repo", requireAuth(), async (c) => {
  const { owner, repo } = c.req.param();
  const body = await c.req.json();
  const orgId = await requireOrgAccess(c);

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

  const user = getAuthUser(c);
  const userId = user.id;

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
    organizationId: orgId ?? undefined,
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
    effectiveEnabled: settings.enabled,
    effectiveTriageEnabled: settings.triageEnabled,
  });
});

// Get all enabled repos for an organization
// Fetches GitHub metadata on-demand with caching
reposRoutes.get("/org/repos", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.header("X-Organization-Id");
  const searchQuery = c.req.query("q")?.toLowerCase() || "";

  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  try {
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
          effectiveEnabled: r.enabled,
          effectiveTriageEnabled: r.triageEnabled,
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
reposRoutes.get("/org/repos/:owner/:repo", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.header("X-Organization-Id");
  const { owner, repo } = c.req.param();

  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  try {
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
      effectiveEnabled: r.enabled,
      effectiveTriageEnabled: r.triageEnabled,
    });
  } catch (error) {
    console.error("Error fetching org repo:", error);
    return c.json({ error: "Failed to fetch repo" }, 500);
  }
});

// Fetch community health files from GitHub (README, LICENSE, SECURITY, CONTRIBUTING)
// Returns the files directly without storing in database
reposRoutes.post("/org/repos/:owner/:repo/sync-readme", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const token = getAuthToken(c);
  const orgId = c.req.header("X-Organization-Id");
  const { owner, repo } = c.req.param();

  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  try {
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
reposRoutes.delete("/settings/:owner/:repo", requireAuth(), async (c) => {
  const { owner, repo } = c.req.param();
  const user = getAuthUser(c);

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
