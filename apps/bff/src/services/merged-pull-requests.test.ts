import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";

type Row = Record<string, unknown>;
const reviews: { pullNumber: number; owner: string; repo: string }[] = [];
const merged: Row[] = [];
let countCalls = 0;

const fakePrisma = {
  review: {
    findFirst: async ({
      where,
    }: {
      where: { pullNumber: number; repositorySettings: { owner: { equals: string }; repo: { equals: string } } };
    }) => {
      const { pullNumber, repositorySettings } = where;
      const hit = reviews.find(
        (r) =>
          r.pullNumber === pullNumber &&
          r.owner.toLowerCase() === repositorySettings.owner.equals.toLowerCase() &&
          r.repo.toLowerCase() === repositorySettings.repo.equals.toLowerCase()
      );
      return hit ? { id: "review" } : null;
    },
  },
  mergedPullRequest: {
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { owner_repo_pullNumber: { owner: string; repo: string; pullNumber: number } };
      create: Row;
      update: Row;
    }) => {
      const key = where.owner_repo_pullNumber;
      const existing = merged.find(
        (m) => m.owner === key.owner && m.repo === key.repo && m.pullNumber === key.pullNumber
      );
      if (existing) Object.assign(existing, update);
      else merged.push({ ...create });
    },
    count: async () => {
      countCalls++;
      return merged.length;
    },
  },
};

const { createMergedPullRequestService } = await import("./merged-pull-requests");
const { createPublicRoutes } = await import("../routes/public");
const { createPublicStatsService } = await import("./public-stats");

describe("merged pull requests", () => {
  // biome-ignore lint/suspicious/noExplicitAny: in-memory stand-in for the two Prisma delegates used
  let service = createMergedPullRequestService(() => fakePrisma as any);
  const recordMergedPullRequest = (input: Parameters<typeof service.record>[0]) => service.record(input);
  const countMergedPullRequests = () => service.count();

  beforeEach(() => {
    reviews.length = 0;
    merged.length = 0;
    countCalls = 0;
    // biome-ignore lint/suspicious/noExplicitAny: see above
    service = createMergedPullRequestService(() => fakePrisma as any);
  });

  it("records a merge only for pull requests Contrast reviewed", async () => {
    reviews.push({ pullNumber: 7, owner: "Acme", repo: "Api" });

    const reviewed = await recordMergedPullRequest({
      owner: "acme",
      repo: "api",
      pullNumber: 7,
      mergedAt: new Date(),
    });
    const unreviewed = await recordMergedPullRequest({
      owner: "acme",
      repo: "api",
      pullNumber: 8,
      mergedAt: new Date(),
    });

    expect(reviewed).toBe("recorded");
    expect(unreviewed).toBe("not_reviewed");
    expect(merged).toHaveLength(1);
  });

  it("counts each pull request once, however often it is reported", async () => {
    reviews.push({ pullNumber: 7, owner: "acme", repo: "api" });
    for (let i = 0; i < 3; i++) {
      await recordMergedPullRequest({ owner: "ACME", repo: "api", pullNumber: 7, mergedAt: new Date() });
    }
    expect(await countMergedPullRequests()).toBe(1);
  });

  it("caches the total between requests", async () => {
    await countMergedPullRequests();
    await countMergedPullRequests();
    expect(countCalls).toBe(1);
  });

  it("serves the totals publicly with an open CORS header, counting only accepted fixes", async () => {
    reviews.push({ pullNumber: 1, owner: "acme", repo: "api" });
    await recordMergedPullRequest({ owner: "acme", repo: "api", pullNumber: 1, mergedAt: new Date() });

    const fixStatuses: string[] = ["ACCEPTED", "PENDING", "ACCEPTED"];
    const statsDb = {
      reviewComment: { count: async () => 5 },
      reviewFix: {
        count: async ({ where }: { where: { status: string } }) =>
          fixStatuses.filter((status) => status === where.status).length,
      },
    };
    // biome-ignore lint/suspicious/noExplicitAny: in-memory stand-in for the two Prisma delegates used
    const getStats = createPublicStatsService(() => statsDb as any, countMergedPullRequests);
    const app = new Hono().route("/api/public", createPublicRoutes(getStats));
    const res = await app.fetch(new Request("http://localhost/api/public/stats"));

    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(await res.json()).toEqual({ prsMerged: 1, issuesFound: 5, fixesCommitted: 2 });
  });
});
