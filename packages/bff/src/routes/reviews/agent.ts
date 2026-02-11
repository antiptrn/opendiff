/** Review agent recording endpoints: record reviews and persist comments/fixes from the review agent. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { createNotification } from "../../services/notifications";
import { getOrgQuotaPool } from "../../middleware/organization";

const agentRoutes = new Hono();

// ==================== RECORD A REVIEW (AGENT) ====================

// Record a review (called by review agent)
agentRoutes.post("/reviews", async (c) => {
  const body = await c.req.json();
  const { githubRepoId, owner, repo, pullNumber, reviewType, reviewId, commentId, apiKey, tokensUsed } = body;

  // Validate API key for review agent
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (expectedApiKey && apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!githubRepoId || !pullNumber || !reviewType) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    // Look up repo settings by GitHub repo ID first
    let repoSettings = await prisma.repositorySettings.findFirst({
      where: { githubRepoId: BigInt(githubRepoId) },
      include: { organization: true },
    });

    // Fallback: look up by owner/repo and backfill githubRepoId
    if (!repoSettings && owner && repo) {
      repoSettings = await prisma.repositorySettings.findFirst({
        where: { owner, repo },
        include: { organization: true },
      });
      if (repoSettings) {
        await prisma.repositorySettings.update({
          where: { id: repoSettings.id },
          data: { githubRepoId: BigInt(githubRepoId) },
        });
      }
    }

    if (!repoSettings) {
      console.warn(
        `No repository settings found for githubRepoId: ${githubRepoId}, owner: ${owner}, repo: ${repo}`
      );
      return c.json({ error: "Repository not configured" }, 404);
    }

    const org = repoSettings.organization;

    // Check quota if organization exists
    if (org) {
      // Calculate quota pool from all seats in the organization
      const quotaPool = await getOrgQuotaPool(org.id);

      // quota of -1 means unlimited (has BYOK seat)
      if (quotaPool.total !== -1 && Number(org.tokensUsedThisCycle) >= quotaPool.total) {
        return c.json(
          {
            error: "Token quota exceeded",
            quota: quotaPool.total,
            used: Number(org.tokensUsedThisCycle),
          },
          403
        );
      }

      // Increment token usage counter (even for unlimited to track usage)
      await prisma.organization.update({
        where: { id: org.id },
        data: { tokensUsedThisCycle: { increment: tokensUsed || 0 } },
      });
    }

    const review = await prisma.review.create({
      data: {
        repositorySettingsId: repoSettings.id,
        pullNumber,
        reviewType,
        reviewId: reviewId || null,
        commentId: commentId || null,
        organizationId: org?.id || null,
        tokensUsed: tokensUsed || null,
      },
    });

    if (org) {
      createNotification({
        organizationId: org.id,
        type: "REVIEW_STARTED",
        title: "Review started",
        body: `PR #${pullNumber} in ${owner}/${repo}`,
        reviewId: review.id,
      }).catch(console.error);
    }

    return c.json({ id: review.id, created: true });
  } catch (error) {
    console.error("Error recording review:", error);
    return c.json({ error: "Failed to record review" }, 500);
  }
});

// ==================== REVIEW COMMENTS ENDPOINT (AGENT) ====================

// Agent posts comments + optional fixes for a review
agentRoutes.post("/reviews/:reviewId/comments", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (expectedApiKey && apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { reviewId } = c.req.param();
  const body = await c.req.json();
  const { comments } = body;

  if (!Array.isArray(comments) || comments.length === 0) {
    return c.json({ error: "comments array is required" }, 400);
  }

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { repositorySettings: true },
  });

  if (!review) {
    return c.json({ error: "Review not found" }, 404);
  }

  const autofixEnabled = review.repositorySettings?.autofixEnabled ?? false;

  const created = [];
  for (const comment of comments) {
    const reviewComment = await prisma.reviewComment.create({
      data: {
        reviewId,
        githubCommentId: comment.githubCommentId || null,
        body: comment.body,
        path: comment.path || null,
        line: comment.line || null,
        side: comment.side || null,
      },
    });

    let fix = null;
    if (comment.fix) {
      fix = await prisma.reviewFix.create({
        data: {
          commentId: reviewComment.id,
          status: autofixEnabled ? "ACCEPTED" : "PENDING",
          diff: comment.fix.diff || null,
          summary: comment.fix.summary || null,
          commitSha: comment.fix.commitSha || null,
          acceptedAt: autofixEnabled ? new Date() : null,
        },
      });
    }

    created.push({ commentId: reviewComment.id, fixId: fix?.id || null });
  }

  if (review.organizationId) {
    const owner = review.repositorySettings?.owner;
    const repo = review.repositorySettings?.repo;
    createNotification({
      organizationId: review.organizationId,
      type: "REVIEW_COMPLETED",
      title: "Review completed",
      body: `${created.length} comment${created.length !== 1 ? "s" : ""} on PR #${review.pullNumber} in ${owner}/${repo}`,
      reviewId: review.id,
    }).catch(console.error);
  }

  return c.json({ created, autofixEnabled });
});

export { agentRoutes };
