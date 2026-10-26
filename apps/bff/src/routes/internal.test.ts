import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const repositorySettings = {
  findFirst: mock((_args: unknown): Promise<unknown | null> => Promise.resolve(null)),
  findUnique: mock((_args: unknown): Promise<unknown | null> => Promise.resolve(null)),
  update: mock((_args: unknown): Promise<unknown> => Promise.resolve({})),
};
const organization = {
  update: mock((_args: unknown): Promise<unknown> => Promise.resolve({})),
};
const review = {
  create: mock((_args: unknown): Promise<unknown> => Promise.resolve({ id: "review-1" })),
  findFirst: mock((_args: unknown): Promise<unknown | null> => Promise.resolve({ id: "review-1" })),
};
const mergedPullRequest = {
  upsert: mock((_args: unknown): Promise<unknown> => Promise.resolve({})),
  count: mock((): Promise<number> => Promise.resolve(0)),
};
const getOrgQuotaPool = mock(() =>
  Promise.resolve({ total: 1_000_000, used: 10_000, hasUnlimited: false })
);

mock.module("../db", () => ({
  prisma: {
    repositorySettings,
    organization,
    review,
    mergedPullRequest,
  },
}));

mock.module("../middleware/organization", () => ({
  getOrgQuotaPool,
}));

mock.module("../services/notifications", () => ({
  createNotification: mock(() => Promise.resolve()),
}));

const { internalRoutes } = await import("./internal");

function createApp() {
  const app = new Hono();
  app.route("/api/internal", internalRoutes);
  return app;
}

function authRequest(path: string) {
  return new Request(`http://localhost${path}`, {
    headers: { "X-API-Key": "internal-secret" },
  });
}

function mockResolvedRepositorySettings(settings: unknown) {
  repositorySettings.findUnique
    .mockResolvedValueOnce({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      githubRepoId: null,
    })
    .mockResolvedValueOnce(settings);
}

describe("internal settings routes", () => {
  beforeEach(() => {
    process.env.REVIEW_AGENT_API_KEY = "internal-secret";
    repositorySettings.findFirst.mockReset();
    repositorySettings.findUnique.mockReset();
    repositorySettings.update.mockReset();
    organization.update.mockReset();
    review.create.mockReset();
    getOrgQuotaPool.mockReset();
    repositorySettings.findFirst.mockResolvedValue(null);
    repositorySettings.findUnique.mockResolvedValue(null);
    repositorySettings.update.mockResolvedValue({});
    organization.update.mockResolvedValue({});
    review.create.mockResolvedValue({ id: "review-1" });
    getOrgQuotaPool.mockResolvedValue({
      total: 1_000_000,
      used: 10_000,
      hasUnlimited: false,
    });
  });

  it("resolves repository settings by stable GitHub repo id after an owner or repo rename", async () => {
    repositorySettings.findFirst.mockResolvedValue({
      id: "repo-settings-1",
      owner: "old-owner",
      repo: "old-repo",
      githubRepoId: 123n,
    });
    repositorySettings.findUnique.mockResolvedValue({
      id: "repo-settings-1",
      owner: "new-owner",
      repo: "new-repo",
      enabled: true,
      approveEnabled: false,
      autofixEnabled: true,
      sensitivity: 75,
      organizationId: "org-1",
      organization: { id: "org-1" },
    });

    const app = createApp();
    const response = await app.fetch(
      authRequest("/api/internal/settings/new-owner/new-repo?githubRepoId=123")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      owner: "new-owner",
      repo: "new-repo",
      enabled: true,
      effectiveEnabled: true,
      approveEnabled: false,
      autofixEnabled: true,
      sensitivity: 75,
    });
    expect(repositorySettings.findFirst).toHaveBeenCalledWith({
      where: { githubRepoId: 123n },
      select: { id: true, owner: true, repo: true, githubRepoId: true },
    });
    expect(repositorySettings.update).toHaveBeenCalledWith({
      where: { id: "repo-settings-1" },
      data: { owner: "new-owner", repo: "new-repo" },
    });
    expect(repositorySettings.findUnique).toHaveBeenCalledWith({
      where: { id: "repo-settings-1" },
      include: { organization: true },
    });
    expect(getOrgQuotaPool).toHaveBeenCalledWith("org-1");
  });

  it("records the stable GitHub repo id when an existing owner/repo setting is missing it", async () => {
    repositorySettings.findFirst.mockResolvedValue(null);
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      enabled: true,
      autofixEnabled: false,
      sensitivity: 50,
      organizationId: "org-1",
      organization: { id: "org-1" },
    });

    const app = createApp();
    const response = await app.fetch(
      authRequest("/api/internal/settings/owner/repo?githubRepoId=456")
    );

    expect(response.status).toBe(200);
    expect(repositorySettings.update).toHaveBeenCalledWith({
      where: { id: "repo-settings-1" },
      data: { githubRepoId: 456n },
    });
  });

  it("marks repository settings disabled when the organization token quota is exhausted", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      enabled: true,
      autofixEnabled: true,
      sensitivity: 50,
      organizationId: "org-1",
      organization: { id: "org-1" },
    });
    getOrgQuotaPool.mockResolvedValue({
      total: 2_500_000,
      used: 2_500_000,
      hasUnlimited: false,
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/settings/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      owner: "owner",
      repo: "repo",
      enabled: true,
      effectiveEnabled: false,
      disabledReason: "quota_exhausted",
      quota: {
        total: 2_500_000,
        used: 2_500_000,
        hasUnlimited: false,
      },
    });
    expect(getOrgQuotaPool).toHaveBeenCalledWith("org-1");
  });

  it("keeps repository settings effective when quota remains", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      enabled: true,
      autofixEnabled: true,
      sensitivity: 50,
      organizationId: "org-1",
      organization: { id: "org-1" },
    });
    getOrgQuotaPool.mockResolvedValue({
      total: 100,
      used: 99,
      hasUnlimited: false,
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/settings/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.effectiveEnabled).toBe(true);
    expect(body.disabledReason).toBeUndefined();
    expect(body.quota).toEqual({ total: 100, used: 99, hasUnlimited: false });
  });

  it("records stable pull request metadata when creating a review", async () => {
    repositorySettings.findFirst.mockResolvedValue({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      githubRepoId: 123n,
      organizationId: "org-1",
      organization: { id: "org-1", tokensUsedThisCycle: 0 },
    });

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/internal/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": "internal-secret",
        },
        body: JSON.stringify({
          githubRepoId: 123,
          owner: "owner",
          repo: "repo",
          pullNumber: 124,
          reviewType: "initial",
          reviewId: 456,
          pullTitle: " Improve PR title display ",
          pullAuthor: " octocat ",
          tokensUsed: 42,
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ id: "review-1", created: true });
    expect(review.create).toHaveBeenCalledWith({
      data: {
        repositorySettingsId: "repo-settings-1",
        pullNumber: 124,
        reviewType: "initial",
        reviewId: 456,
        commentId: null,
        pullTitle: "Improve PR title display",
        pullAuthor: "octocat",
        organizationId: "org-1",
        tokensUsed: 42,
      },
    });
  });

  it("disables repository settings that are not attached to an organization", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      enabled: true,
      autofixEnabled: true,
      sensitivity: 50,
      organizationId: null,
      organization: null,
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/settings/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.effectiveEnabled).toBe(false);
    expect(body.disabledReason).toBe("missing_organization");
    expect(getOrgQuotaPool).not.toHaveBeenCalled();
  });

  it("uses OpenDiff default credentials for active Pro organizations", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      organization: {
        subscriptionTier: "PRO",
        subscriptionStatus: "ACTIVE",
      },
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/ai-config/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ useDefault: true });
  });

  it("uses OpenDiff default credentials for organizations with granted tokens and no plan", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      organization: {
        subscriptionTier: null,
        subscriptionStatus: null,
        grantedTokens: BigInt(500_000),
      },
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/ai-config/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ useDefault: true });
  });

  it("refuses organizations with neither a plan nor granted tokens", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      organization: {
        subscriptionTier: null,
        subscriptionStatus: null,
        grantedTokens: BigInt(0),
      },
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/ai-config/owner/repo"));

    expect(response.status).toBe(403);
  });

  it("returns BYOK API key config for active Self-sufficient organizations", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      organization: {
        subscriptionTier: "SELF_SUFFICIENT",
        subscriptionStatus: "ACTIVE",
        aiAuthMethod: "API_KEY",
        aiModel: "openai/gpt-5-codex",
        aiApiKey: "sk-test-openai",
        anthropicApiKey: null,
      },
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/ai-config/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      authMethod: "API_KEY",
      model: "openai/gpt-5-codex",
      credential: "sk-test-openai",
      useDefault: false,
    });
  });

  it("does not fall back to OpenDiff credentials when Self-sufficient key is missing", async () => {
    mockResolvedRepositorySettings({
      id: "repo-settings-1",
      owner: "owner",
      repo: "repo",
      organization: {
        subscriptionTier: "SELF_SUFFICIENT",
        subscriptionStatus: "ACTIVE",
        aiAuthMethod: null,
        aiModel: "openai/gpt-5-codex",
        aiApiKey: null,
        anthropicApiKey: null,
      },
    });

    const app = createApp();
    const response = await app.fetch(authRequest("/api/internal/ai-config/owner/repo"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      error: "No BYOK API key configured for Self-sufficient organization",
      useDefault: false,
    });
  });
});

describe("POST /api/internal/pull-requests/merged", () => {
  const merge = { owner: "acme", repo: "api", pullNumber: 7, mergedAt: "2026-10-20T10:00:00Z" };

  function post(body: unknown, apiKey = "internal-secret") {
    return createApp().fetch(
      new Request("http://localhost/api/internal/pull-requests/merged", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
        body: JSON.stringify(body),
      })
    );
  }

  beforeEach(() => {
    process.env.REVIEW_AGENT_API_KEY = "internal-secret";
    mergedPullRequest.upsert.mockClear();
  });

  it("rejects requests without the agent API key", async () => {
    const res = await post(merge, "wrong");
    expect(res.status).toBe(401);
    expect(mergedPullRequest.upsert).not.toHaveBeenCalled();
  });

  it("rejects incomplete payloads", async () => {
    const res = await post({ owner: "acme", repo: "api" });
    expect(res.status).toBe(400);
    expect(mergedPullRequest.upsert).not.toHaveBeenCalled();
  });

  it("records the merge", async () => {
    const res = await post(merge);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "recorded" });
    expect(mergedPullRequest.upsert).toHaveBeenCalledWith({
      where: { owner_repo_pullNumber: { owner: "acme", repo: "api", pullNumber: 7 } },
      create: { owner: "acme", repo: "api", pullNumber: 7, mergedAt: new Date("2026-10-20T10:00:00Z") },
      update: { mergedAt: new Date("2026-10-20T10:00:00Z") },
    });
  });
});
