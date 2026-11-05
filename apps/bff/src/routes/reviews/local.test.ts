import { beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const organization = { update: mock(() => Promise.resolve({})) };
const review = { create: mock(() => Promise.resolve({ id: "review-1" })) };
const reviewComment = { createMany: mock(() => Promise.resolve({ count: 0 })) };
const postToReviewAgent = mock(
  (_path: string, _payload: unknown): Promise<unknown> => Promise.resolve({})
);

class ReviewAgentError extends Error {
  constructor(
    readonly status: number,
    readonly body: string
  ) {
    super(body);
  }
}

mock.module("../../db", () => ({
  prisma: {
    organizationMember: { findUnique: mock(() => Promise.resolve({ organization: {} })) },
    organization,
    review,
    reviewComment,
  },
}));
mock.module("../../auth", () => ({ getOrgIdFromHeader: () => "org-1" }));
mock.module("../../middleware/auth", () => ({
  requireAuth: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
  getAuthUser: () => ({ id: "user-1", personalOrgId: "org-1" }),
}));
mock.module("../../middleware/organization", () => ({
  getOrgQuotaPool: () => Promise.resolve({ total: 1000, used: 0 }),
}));
mock.module("../../utils/ai-config", () => ({ getOrgAiRuntimeConfig: () => Promise.resolve(null) }));
mock.module("../../utils/review-agent-client", () => ({ postToReviewAgent, ReviewAgentError }));

const freshLocal = "./local.ts?usage-failures";
const { localRoutes } = (await import(freshLocal)) as typeof import("./local");

function request() {
  const app = new Hono();
  app.route("/api", localRoutes);
  return app.request("/api/reviews/local", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: [{ filename: "test.ts", content: "export const value = 1;", patch: "" }],
      title: "Local change",
    }),
  });
}

describe("local review failure usage", () => {
  beforeEach(() => {
    organization.update.mockClear();
    review.create.mockClear();
    reviewComment.createMany.mockClear();
    postToReviewAgent.mockReset();
  });

  it.each([
    { failure: "verifier request failure", tokensUsed: 123 },
    { failure: "invalid verifier response", tokensUsed: 200 },
  ])("charges consumed tokens after $failure without saving a review", async ({ tokensUsed }) => {
    postToReviewAgent.mockRejectedValueOnce(
      new ReviewAgentError(500, JSON.stringify({ error: "Review failed", tokensUsed }))
    );

    const response = await request();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Review failed" });
    expect(organization.update).toHaveBeenCalledTimes(1);
    expect(organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { tokensUsedThisCycle: { increment: tokensUsed } },
    });
    expect(review.create).not.toHaveBeenCalled();
    expect(reviewComment.createMany).not.toHaveBeenCalled();
  });

  it.each(["not JSON", "{}", '{"tokensUsed":-1}', '{"tokensUsed":"123"}'])(
    "returns failures without charging invalid usage: %s",
    async (body) => {
      postToReviewAgent.mockRejectedValueOnce(new ReviewAgentError(500, body));

      const response = await request();

      expect(response.status).toBe(500);
      expect(organization.update).not.toHaveBeenCalled();
      expect(review.create).not.toHaveBeenCalled();
    }
  );

  it("charges successful reviews once and persists them", async () => {
    const result = { summary: "LGTM", issues: [], verdict: "approve" };
    postToReviewAgent.mockResolvedValueOnce({ review: result, tokensUsed: 200 });

    const response = await request();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(organization.update).toHaveBeenCalledTimes(1);
    expect(review.create).toHaveBeenCalledTimes(1);
  });
});
