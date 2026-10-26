import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const repositorySettings = {
  findUnique: mock((_args: unknown): Promise<unknown> => Promise.resolve(null)),
};
const requireOrgAccess = mock(() => Promise.resolve<string | null>("org-1"));
const postToReviewAgent = mock(
  (_path: string, _payload: unknown): Promise<unknown> =>
    Promise.resolve({ queued: 2, skippedDrafts: 1, rejected: 0 })
);

mock.module("../db", () => ({ prisma: { repositorySettings } }));
mock.module("../middleware/auth", () => ({
  requireAuth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  getAuthToken: () => "token",
  getAuthUser: () => ({ id: "user-1" }),
  requireOrgAccess,
}));
class ReviewAgentError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(body);
  }
}
mock.module("../utils/review-agent-client", () => ({ postToReviewAgent, ReviewAgentError }));
mock.module("../services/audit", () => ({ logAudit: mock(() => Promise.resolve()) }));
mock.module("../services/notifications", () => ({
  createNotification: mock(() => Promise.resolve()),
}));
mock.module("../utils/github-metadata", () => ({ fetchRepoMetadata: mock(() => null) }));
mock.module("../utils/github-repos", () => ({
  fetchGitHubRepoByFullName: mock(() => null),
  fetchGitHubRepos: mock(() => []),
}));

// A fresh copy of the routes: other test files may already have loaded them with the real modules
const freshRepos = "./repos.ts?review-open-pulls";
const { reposRoutes } = (await import(freshRepos)) as typeof import("./repos");

function request(owner = "acme", repo = "web") {
  const app = new Hono();
  app.route("/api", reposRoutes);
  return app.request(`/api/settings/${owner}/${repo}/review-open-pulls`, { method: "POST" });
}

describe("POST /settings/:owner/:repo/review-open-pulls", () => {
  beforeEach(() => {
    repositorySettings.findUnique.mockReset();
    postToReviewAgent.mockClear();
    requireOrgAccess.mockImplementation(() => Promise.resolve("org-1"));
  });

  it("asks the review agent to review the repository's open pull requests", async () => {
    repositorySettings.findUnique.mockResolvedValue({ enabled: true, organizationId: "org-1" });

    const response = await request();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ queued: 2, skippedDrafts: 1, rejected: 0 });
    expect(postToReviewAgent).toHaveBeenCalledWith("/internal/review-open-pulls", {
      owner: "acme",
      repo: "web",
    });
  });

  it("returns 404 for a repository that isn't connected", async () => {
    repositorySettings.findUnique.mockResolvedValue(null);

    const response = await request();

    expect(response.status).toBe(404);
    expect(postToReviewAgent).not.toHaveBeenCalled();
  });

  it("returns 404 for a repository connected by another organization", async () => {
    repositorySettings.findUnique.mockResolvedValue({ enabled: true, organizationId: "org-2" });

    const response = await request();

    expect(response.status).toBe(404);
    expect(postToReviewAgent).not.toHaveBeenCalled();
  });

  it("refuses when reviews are off for the repository", async () => {
    repositorySettings.findUnique.mockResolvedValue({ enabled: false, organizationId: "org-1" });

    const response = await request();

    expect(response.status).toBe(400);
    expect(postToReviewAgent).not.toHaveBeenCalled();
  });

  it("says to install the GitHub App when it isn't installed on the repository", async () => {
    repositorySettings.findUnique.mockResolvedValue({ enabled: true, organizationId: "org-1" });
    postToReviewAgent.mockImplementationOnce(() =>
      Promise.reject(new ReviewAgentError(404, '{"error":"app_not_installed"}'))
    );

    const response = await request();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Install the Contrast GitHub App on acme/web so it can review its pull requests.",
      code: "app_not_installed",
    });
  });

  it("returns 502 when the review agent can't be reached", async () => {
    repositorySettings.findUnique.mockResolvedValue({ enabled: true, organizationId: "org-1" });
    postToReviewAgent.mockImplementationOnce(() => Promise.reject(new Error("connection refused")));

    const response = await request();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "Couldn't start reviews for open pull requests",
    });
  });
});
