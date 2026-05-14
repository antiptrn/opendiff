import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const mockRepositorySettingsFindUnique = mock(() => Promise.resolve(null as unknown));
const mockGetOrgQuotaPool = mock(() => Promise.resolve({ total: 0, used: 0, hasUnlimited: false }));

mock.module("../db", () => ({
  prisma: {
    repositorySettings: {
      findUnique: mockRepositorySettingsFindUnique,
    },
  },
}));

mock.module("../middleware/organization", () => ({
  getOrgQuotaPool: mockGetOrgQuotaPool,
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

function requestSettings(owner = "antiptrn", repo = "opendiff") {
  return createApp().fetch(
    new Request(`http://localhost/api/internal/settings/${owner}/${repo}`, {
      headers: { "X-API-Key": "test-key" },
    })
  );
}

describe("internal settings routes", () => {
  beforeEach(() => {
    process.env.REVIEW_AGENT_API_KEY = "test-key";
    mockRepositorySettingsFindUnique.mockReset();
    mockRepositorySettingsFindUnique.mockResolvedValue(null);
    mockGetOrgQuotaPool.mockReset();
    mockGetOrgQuotaPool.mockResolvedValue({ total: 0, used: 0, hasUnlimited: false });
  });

  it("disables repository settings when quota is exhausted before review work starts", async () => {
    mockRepositorySettingsFindUnique.mockResolvedValue({
      owner: "antiptrn",
      repo: "opendiff",
      enabled: true,
      autofixEnabled: true,
      sensitivity: 50,
      organizationId: "org-1",
    });
    mockGetOrgQuotaPool.mockResolvedValue({ total: 0, used: 0, hasUnlimited: false });

    const response = await requestSettings();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.enabled).toBe(true);
    expect(body.effectiveEnabled).toBe(false);
    expect(body.disabledReason).toBe("quota_exhausted");
    expect(body.quota).toEqual({ total: 0, used: 0, hasUnlimited: false });
    expect(mockGetOrgQuotaPool).toHaveBeenCalledWith("org-1");
  });

  it("keeps repository settings effective when quota remains", async () => {
    mockRepositorySettingsFindUnique.mockResolvedValue({
      owner: "antiptrn",
      repo: "opendiff",
      enabled: true,
      autofixEnabled: true,
      sensitivity: 50,
      organizationId: "org-1",
    });
    mockGetOrgQuotaPool.mockResolvedValue({ total: 100, used: 99, hasUnlimited: false });

    const response = await requestSettings();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.effectiveEnabled).toBe(true);
    expect(body.disabledReason).toBeUndefined();
    expect(body.quota).toEqual({ total: 100, used: 99, hasUnlimited: false });
  });

  it("disables repository settings that are not attached to an organization", async () => {
    mockRepositorySettingsFindUnique.mockResolvedValue({
      owner: "antiptrn",
      repo: "opendiff",
      enabled: true,
      autofixEnabled: true,
      sensitivity: 50,
      organizationId: null,
    });

    const response = await requestSettings();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.effectiveEnabled).toBe(false);
    expect(body.disabledReason).toBe("missing_organization");
    expect(mockGetOrgQuotaPool).not.toHaveBeenCalled();
  });
});
