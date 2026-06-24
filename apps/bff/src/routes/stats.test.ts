import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const repositorySettings = {
  findMany: mock((_args: unknown): Promise<unknown[]> => Promise.resolve([])),
};
const review = {
  count: mock((_args: unknown): Promise<number> => Promise.resolve(0)),
};
const reviewComment = {
  count: mock((_args: unknown): Promise<number> => Promise.resolve(0)),
};
const reviewFix = {
  count: mock((_args: unknown): Promise<number> => Promise.resolve(0)),
};
const getAuthUser = mock(() => ({ id: "user-1", githubAccessToken: "ghp_linked" }));
const getAuthToken = mock(() => "gho_direct");
const requireOrgAccess = mock(() => Promise.resolve("org-1"));
const fetchGitHubRepos = mock(() => Promise.resolve([]));

mock.module("../db", () => ({
  prisma: {
    repositorySettings,
    review,
    reviewComment,
    reviewFix,
  },
}));

mock.module("../middleware/auth", () => ({
  requireAuth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  getAuthUser,
  getAuthToken,
  requireOrgAccess,
}));

mock.module("../utils/github-repos", () => ({
  fetchGitHubRepos,
}));

const { statsRoutes } = await import("./stats");

function createApp() {
  const app = new Hono();
  app.route("/api/stats", statsRoutes);
  return app;
}

describe("stats routes", () => {
  beforeEach(() => {
    repositorySettings.findMany.mockReset();
    review.count.mockReset();
    reviewComment.count.mockReset();
    reviewFix.count.mockReset();
    getAuthUser.mockReset();
    getAuthToken.mockReset();
    requireOrgAccess.mockReset();
    fetchGitHubRepos.mockReset();

    getAuthUser.mockReturnValue({ id: "user-1", githubAccessToken: "ghp_linked" });
    getAuthToken.mockReturnValue("gho_direct");
    requireOrgAccess.mockResolvedValue("org-1");
    repositorySettings.findMany.mockResolvedValue([
      { id: "repo-1", enabled: true },
      { id: "repo-2", enabled: false },
      { id: "repo-3", enabled: true },
    ]);
    review.count.mockResolvedValue(7);
    reviewComment.count.mockResolvedValue(11);
    reviewFix.count.mockResolvedValue(4);
    fetchGitHubRepos.mockResolvedValue([]);
  });

  it("counts configured organization repositories consistently with the repositories tab", async () => {
    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/stats", {
        headers: {
          Authorization: "Bearer token",
          "X-Organization-Id": "org-1",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      reviewCount: 7,
      connectedRepos: 3,
      totalRepos: 3,
      issuesFound: 11,
      issuesFixed: 4,
    });
    expect(repositorySettings.findMany).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
    });
    expect(fetchGitHubRepos).not.toHaveBeenCalled();
  });
});
