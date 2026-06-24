import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const review = {
  findMany: mock((_args: unknown): Promise<unknown[]> => Promise.resolve([])),
  groupBy: mock((_args: unknown): Promise<unknown[]> => Promise.resolve([])),
  count: mock((_args: unknown): Promise<number> => Promise.resolve(0)),
};
const requireOrgAccess = mock(() => Promise.resolve("org-1"));
const getAuthUser = mock(() => ({ id: "user-1", githubAccessToken: "ghp_linked" }));
const getAuthToken = mock(() => "token");
const fetchPRMetadataBatch = mock(() => Promise.resolve(new Map()));
const fetchPRMetadata = mock(() => Promise.resolve(null));
const generateReviewSummary = mock(() => Promise.resolve({ summary: "", fileTitles: {} }));

mock.module("../../db", () => ({
  prisma: {
    review,
  },
}));

mock.module("../../middleware/auth", () => ({
  requireAuth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  getAuthToken,
  getAuthUser,
  requireOrgAccess,
}));

mock.module("../../utils/github-metadata", () => ({
  fetchPRMetadata,
  fetchPRMetadataBatch,
}));

mock.module("../../utils/generate-summary", () => ({
  generateReviewSummary,
}));

const { queryRoutes } = await import("./queries");

function createApp() {
  const app = new Hono();
  app.route("/api", queryRoutes);
  return app;
}

describe("review query routes", () => {
  beforeEach(() => {
    review.findMany.mockReset();
    review.groupBy.mockReset();
    review.count.mockReset();
    requireOrgAccess.mockReset();
    getAuthUser.mockReset();
    getAuthToken.mockReset();
    fetchPRMetadataBatch.mockReset();
    fetchPRMetadata.mockReset();
    generateReviewSummary.mockReset();

    requireOrgAccess.mockResolvedValue("org-1");
    getAuthUser.mockReturnValue({ id: "user-1", githubAccessToken: "ghp_linked" });
    getAuthToken.mockReturnValue("token");
    review.count.mockResolvedValue(1);
    review.groupBy.mockImplementation((args: unknown) =>
      Promise.resolve(
        typeof args === "object" && args && "_max" in args
          ? [
              {
                repositorySettingsId: "repo-settings-1",
                pullNumber: 124,
                _max: { createdAt: new Date("2026-06-24T12:00:00.000Z") },
              },
            ]
          : [
              {
                repositorySettingsId: "repo-settings-1",
                pullNumber: 124,
              },
            ]
      )
    );
    fetchPRMetadataBatch.mockResolvedValue(new Map([["owner/repo#124", null]]));
  });

  it("uses stored PR metadata for the review list when GitHub metadata is unavailable", async () => {
    review.findMany.mockResolvedValue([
      {
        id: "review-1",
        repositorySettingsId: "repo-settings-1",
        repositorySettings: { owner: "owner", repo: "repo" },
        pullNumber: 124,
        pullTitle: "Improve PR title display",
        pullAuthor: "octocat",
        reviewType: "initial",
        comments: [],
        createdAt: new Date("2026-06-24T12:00:00.000Z"),
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/reviews", {
        headers: {
          Authorization: "Bearer token",
          "X-Organization-Id": "org-1",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews[0]).toMatchObject({
      id: "review-1",
      pullNumber: 124,
      pullTitle: "Improve PR title display",
      pullAuthor: "octocat",
      pullUrl: "https://github.com/owner/repo/pull/124",
    });
    expect(fetchPRMetadataBatch).toHaveBeenCalledWith(
      [{ owner: "owner", repo: "repo", pullNumber: 124 }],
      "ghp_linked"
    );
  });

  it("returns only the newest review for each pull request in the review list", async () => {
    review.groupBy.mockImplementation((args: unknown) =>
      Promise.resolve(
        typeof args === "object" && args && "_max" in args
          ? [
              {
                repositorySettingsId: "repo-settings-1",
                pullNumber: 137,
                _max: { createdAt: new Date("2026-06-24T14:00:00.000Z") },
              },
              {
                repositorySettingsId: "repo-settings-1",
                pullNumber: 135,
                _max: { createdAt: new Date("2026-06-24T13:00:00.000Z") },
              },
            ]
          : [
              {
                repositorySettingsId: "repo-settings-1",
                pullNumber: 137,
              },
              {
                repositorySettingsId: "repo-settings-1",
                pullNumber: 135,
              },
            ]
      )
    );
    review.findMany.mockResolvedValue([
      {
        id: "review-137-latest",
        repositorySettingsId: "repo-settings-1",
        repositorySettings: { owner: "owner", repo: "repo" },
        pullNumber: 137,
        pullTitle: "Autofix CI failures and merge conflicts",
        pullAuthor: "octocat",
        reviewType: "rereview",
        comments: [],
        createdAt: new Date("2026-06-24T14:00:00.000Z"),
      },
      {
        id: "review-137-same-timestamp",
        repositorySettingsId: "repo-settings-1",
        repositorySettings: { owner: "owner", repo: "repo" },
        pullNumber: 137,
        pullTitle: "Autofix CI failures and merge conflicts",
        pullAuthor: "octocat",
        reviewType: "initial",
        comments: [],
        createdAt: new Date("2026-06-24T14:00:00.000Z"),
      },
      {
        id: "review-135-latest",
        repositorySettingsId: "repo-settings-1",
        repositorySettings: { owner: "owner", repo: "repo" },
        pullNumber: 135,
        pullTitle: "Silence ignored autofix skips",
        pullAuthor: "octocat",
        reviewType: "rereview",
        comments: [],
        createdAt: new Date("2026-06-24T13:00:00.000Z"),
      },
    ]);

    const app = createApp();
    const response = await app.fetch(
      new Request("http://localhost/api/reviews", {
        headers: {
          Authorization: "Bearer token",
          "X-Organization-Id": "org-1",
        },
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.reviews.map((r: { id: string }) => r.id)).toEqual([
      "review-137-latest",
      "review-135-latest",
    ]);
    expect(body.pagination.total).toBe(2);
    expect(body.pagination.totalPages).toBe(1);
    expect(review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            expect.objectContaining({
              organizationId: "org-1",
              repositorySettingsId: { not: null },
            }),
            {
              OR: [
                {
                  repositorySettingsId: "repo-settings-1",
                  pullNumber: 137,
                  createdAt: new Date("2026-06-24T14:00:00.000Z"),
                },
                {
                  repositorySettingsId: "repo-settings-1",
                  pullNumber: 135,
                  createdAt: new Date("2026-06-24T13:00:00.000Z"),
                },
              ],
            },
          ],
        },
      })
    );
  });
});
