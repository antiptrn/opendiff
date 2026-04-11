/** Local code review endpoint: accepts files and delegates AI review to review-agent. */
import { Hono } from "hono";
import type { FilePayload, ReviewResult } from "shared/types";
import { getOrgIdFromHeader } from "../../auth";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import { getOrgQuotaPool } from "../../middleware/organization";
import { getOrgAiRuntimeConfig } from "../../utils/ai-config";
import { postToReviewAgent } from "../../utils/review-agent-client";

const localRoutes = new Hono();

localRoutes.post("/reviews/local", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  const orgId = getOrgIdFromHeader(c) || user.personalOrgId;
  if (!orgId) {
    return c.json(
      { error: "No organization found. Create an account at opendiff.dev first." },
      400
    );
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    include: { organization: true },
  });
  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  const quotaPool = await getOrgQuotaPool(orgId);
  if (quotaPool.total !== -1 && quotaPool.used > quotaPool.total) {
    return c.json(
      {
        error: "Token quota exceeded",
        used: quotaPool.used,
        limit: quotaPool.total,
      },
      403
    );
  }

  const body = await c.req.json();
  const {
    files,
    title,
    sensitivity = 50,
  } = body as {
    files?: FilePayload[];
    title?: string;
    sensitivity?: number;
  };

  if (!files || !Array.isArray(files) || files.length === 0) {
    return c.json({ error: "files array is required" }, 400);
  }

  if (!title) {
    return c.json({ error: "title is required" }, 400);
  }

  let review: ReviewResult;
  let totalTokens = 0;
  const aiConfig = await getOrgAiRuntimeConfig(orgId);

  // aiConfig is null when org hasn't configured BYOK credentials — the
  // review-agent will fall back to platform-default credentials from env vars.

  try {
    const response = await postToReviewAgent<{
      review: ReviewResult;
      tokensUsed: number;
    }>("/internal/local-review", { files, title, sensitivity, aiConfig });

    review = response.review;
    totalTokens = response.tokensUsed || 0;
  } catch (error) {
    console.error("Local review agent error:", error);
    return c.json({ error: "Review failed" }, 500);
  }

  if (totalTokens > 0) {
    await prisma.organization.update({
      where: { id: orgId },
      data: { tokensUsedThisCycle: { increment: totalTokens } },
    });
  }

  try {
    const dbReview = await prisma.review.create({
      data: {
        organizationId: orgId,
        repositorySettingsId: null,
        pullNumber: 0,
        reviewType: "local",
        tokensUsed: totalTokens || null,
        summary: review.summary,
        summaryStatus: 1,
      },
    });

    if (review.issues.length > 0) {
      await prisma.reviewComment.createMany({
        data: review.issues.map((issue) => ({
          reviewId: dbReview.id,
          body: issue.message,
          path: issue.file || null,
          line: issue.line || null,
        })),
      });
    }

    return c.json(review);
  } catch (error) {
    console.error("Failed to persist local review response:", error);
    return c.json({ error: "Failed to persist review response" }, 500);
  }
});

export { localRoutes };
