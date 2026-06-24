import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const repositorySettings = {
  findFirst: mock((_args: unknown): Promise<unknown | null> => Promise.resolve(null)),
  findUnique: mock((_args: unknown): Promise<unknown | null> => Promise.resolve(null)),
  update: mock((_args: unknown): Promise<unknown> => Promise.resolve({})),
};
const getOrgQuotaPool = mock(() =>
  Promise.resolve({ total: 1_000_000, used: 10_000, hasUnlimited: false })
);

mock.module("../db", () => ({
  prisma: {
    repositorySettings,
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
    getOrgQuotaPool.mockReset();
    repositorySettings.findFirst.mockResolvedValue(null);
    repositorySettings.findUnique.mockResolvedValue(null);
    repositorySettings.update.mockResolvedValue({});
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
});
