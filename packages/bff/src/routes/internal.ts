import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { prisma } from "../db";
import { getOrgQuotaPool } from "../middleware/organization";
import { createNotification } from "../services/notifications";
import { buildIssueFingerprint } from "../utils/issue-fingerprint";

/** Timing-safe comparison of two strings to prevent timing attacks. */
function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const internalRoutes = new Hono();

// Check if a user has an active seat for a given repo
internalRoutes.get("/check-seat/:owner/:repo", async (c) => {
  const apiKey = c.req.header("X-API-Key");

  // Validate internal API key
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { owner, repo } = c.req.param();
  const githubLogin = c.req.query("githubLogin");

  if (!githubLogin) {
    return c.json({ error: "githubLogin query parameter is required" }, 400);
  }

  try {
    // Get repository settings to find the organization
    const repoSettings = await prisma.repositorySettings.findUnique({
      where: { owner_repo: { owner, repo } },
      include: { organization: true },
    });

    if (!repoSettings || !repoSettings.organization) {
      return c.json({
        hasSeat: false,
        reason: "Repository not found or not associated with an organization",
      });
    }

    const org = repoSettings.organization;

    // Check if organization has active subscription
    if (org.subscriptionStatus !== "ACTIVE" || !org.subscriptionTier) {
      return c.json({ hasSeat: false, reason: "Organization has no active subscription" });
    }

    // Find user by GitHub login
    const user = await prisma.user.findFirst({
      where: { login: githubLogin },
    });

    if (!user) {
      return c.json({ hasSeat: false, reason: "User not found in database" });
    }

    // Check if user is a member of the organization with a seat
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return c.json({ hasSeat: false, reason: "User is not a member of the organization" });
    }

    const hasSeat =
      membership.hasSeat &&
      membership.organization.subscriptionStatus === "ACTIVE" &&
      membership.organization.subscriptionTier !== null;

    return c.json({
      hasSeat,
      reason: hasSeat ? "User has an active seat" : "User does not have a seat assigned",
    });
  } catch (error) {
    console.error("Error checking seat:", error);
    return c.json({ error: "Failed to check seat" }, 500);
  }
});

// Get repository settings for review agent (internal use only)
internalRoutes.get("/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const apiKey = c.req.header("X-API-Key");

  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const settings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  if (!settings) {
    return c.json({
      owner,
      repo,
      enabled: false,
      effectiveEnabled: false,
      autofixEnabled: false,
      sensitivity: 50,
    });
  }

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    enabled: settings.enabled,
    autofixEnabled: settings.autofixEnabled,
    sensitivity: settings.sensitivity,
    effectiveEnabled: settings.enabled,
  });
});

// Get custom review rules for review agent (internal use only)
internalRoutes.get("/review-rules/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const apiKey = c.req.header("X-API-Key");

  // Validate internal API key
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get repo settings to find custom review rules
  const repoSettings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  if (!repoSettings) {
    return c.json({ rules: null });
  }

  return c.json({ rules: repoSettings.customReviewRules || null });
});

// Get API key for review agent (internal use only)
internalRoutes.get("/api-key/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const apiKey = c.req.header("X-API-Key");

  // Validate internal API key
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get repo settings to find the organization
  const repoSettings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
    include: {
      organization: true,
    },
  });

  if (!repoSettings?.organization) {
    return c.json({ error: "No organization associated with this repo" }, 404);
  }

  const org = repoSettings.organization;

  // Check if org has BYOK tier with active subscription
  const hasByokTier =
    org.subscriptionTier === "SELF_SUFFICIENT" && org.subscriptionStatus === "ACTIVE";

  if (!hasByokTier) {
    return c.json({ error: "Organization not on Self-sufficient tier", useDefault: true });
  }

  if (!org.anthropicApiKey) {
    return c.json({ error: "No API key configured", useDefault: false });
  }

  return c.json({ apiKey: org.anthropicApiKey });
});

// Get autofix setting for review agent (internal use only)
internalRoutes.get("/autofix-setting/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const apiKey = c.req.header("X-API-Key");

  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const repoSettings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  if (!repoSettings) {
    return c.json({ autofixEnabled: false });
  }

  return c.json({ autofixEnabled: repoSettings.autofixEnabled });
});

// Mark a fix as applied (agent callback after successful push)
internalRoutes.post("/fixes/:fixId/applied", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { fixId } = c.req.param();
  const { commitSha } = await c.req.json();

  try {
    const fix = await prisma.reviewFix.update({
      where: { id: fixId },
      data: { commitSha: commitSha || null },
      include: {
        comment: {
          include: {
            review: { include: { repositorySettings: true } },
          },
        },
      },
    });

    const review = fix.comment.review;
    if (review.organizationId) {
      const owner = review.repositorySettings?.owner;
      const repo = review.repositorySettings?.repo;
      createNotification({
        organizationId: review.organizationId,
        type: "FIX_APPLIED",
        title: "Fix applied",
        body: `Fix applied to PR #${review.pullNumber} in ${owner}/${repo}`,
        reviewId: review.id,
      }).catch(console.error);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error(`Failed to mark fix ${fixId} as applied:`, error);
    return c.json({ error: "Fix not found" }, 404);
  }
});

// Mark a fix as failed (agent callback after failed apply — revert to PENDING)
internalRoutes.post("/fixes/:fixId/failed", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { fixId } = c.req.param();

  try {
    const fix = await prisma.reviewFix.update({
      where: { id: fixId },
      data: { status: "FAILED", acceptedAt: null },
      include: {
        comment: {
          include: {
            review: { include: { repositorySettings: true } },
          },
        },
      },
    });

    const review = fix.comment.review;
    if (review.organizationId) {
      const owner = review.repositorySettings?.owner;
      const repo = review.repositorySettings?.repo;
      createNotification({
        organizationId: review.organizationId,
        type: "FIX_FAILED",
        title: "Fix failed",
        body: `Fix failed on PR #${review.pullNumber} in ${owner}/${repo}`,
        reviewId: review.id,
      }).catch(console.error);
    }

    return c.json({ success: true });
  } catch (error) {
    console.error(`Failed to mark fix ${fixId} as failed:`, error);
    return c.json({ error: "Fix not found" }, 404);
  }
});

// Acquire an idempotency lock for agent execution actions
internalRoutes.post("/execution-locks/acquire", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { key, context } = await c.req.json();
  if (!key || typeof key !== "string") {
    return c.json({ error: "key is required" }, 400);
  }

  try {
    await prisma.agentExecutionLock.create({
      data: {
        key,
        context: typeof context === "string" ? context : null,
      },
    });
    return c.json({ acquired: true });
  } catch {
    return c.json({ acquired: false });
  }
});

// Query active clarification locks for issue suppression
internalRoutes.post("/clarification-locks/suppressions", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { owner, repo, pullNumber, fingerprints } = await c.req.json();
  if (!owner || !repo || !pullNumber || !Array.isArray(fingerprints)) {
    return c.json({ error: "owner, repo, pullNumber, fingerprints are required" }, 400);
  }

  const rows = await prisma.reviewClarificationLock.findMany({
    where: {
      owner,
      repo,
      pullNumber,
      active: true,
      fingerprint: { in: fingerprints },
    },
    select: { fingerprint: true },
  });

  return c.json({ suppressedFingerprints: rows.map((r) => r.fingerprint) });
});

internalRoutes.get("/clarification-locks/pending/:owner/:repo/:pullNumber", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { owner, repo, pullNumber } = c.req.param();
  const pull = Number.parseInt(pullNumber, 10);
  if (!owner || !repo || Number.isNaN(pull)) {
    return c.json({ error: "Invalid parameters" }, 400);
  }

  const count = await prisma.reviewClarificationLock.count({
    where: { owner, repo, pullNumber: pull, active: true },
  });

  return c.json({ hasPending: count > 0, count });
});

internalRoutes.get(
  "/clarification-locks/by-thread/:owner/:repo/:pullNumber/:commentId",
  async (c) => {
    const apiKey = c.req.header("X-API-Key") || "";
    const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
    if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { owner, repo, pullNumber, commentId } = c.req.param();
    const pull = Number.parseInt(pullNumber, 10);
    let threadCommentId: bigint;
    try {
      threadCommentId = BigInt(commentId);
    } catch {
      return c.json({ error: "Invalid commentId" }, 400);
    }

    const lock = await prisma.reviewClarificationLock.findFirst({
      where: {
        owner,
        repo,
        pullNumber: pull,
        threadGithubCommentId: threadCommentId,
        active: true,
      },
      orderBy: { createdAt: "desc" },
    });

    if (!lock) {
      return c.json({ lock: null });
    }

    return c.json({ lock });
  }
);

internalRoutes.post("/clarification-locks/resolve", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { owner, repo, pullNumber, fingerprint, commitSha } = await c.req.json();
  if (!owner || !repo || !pullNumber || !fingerprint) {
    return c.json({ error: "owner, repo, pullNumber, fingerprint are required" }, 400);
  }

  await prisma.reviewClarificationLock.updateMany({
    where: { owner, repo, pullNumber, fingerprint, active: true },
    data: { active: false, resolvedAt: new Date() },
  });

  await prisma.reviewFix.updateMany({
    where: {
      fingerprint,
      status: "WAITING_FOR_USER",
      comment: {
        review: {
          pullNumber,
          repositorySettings: { owner, repo },
        },
      },
    },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      commitSha: typeof commitSha === "string" ? commitSha : null,
    },
  });

  return c.json({ success: true });
});

// Get all skills for a repo's organization members (used by review agent for hydration)
internalRoutes.get("/skills/:owner/:repo", async (c) => {
  const apiKey = c.req.header("X-API-Key");
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { owner, repo } = c.req.param();

  const repoSettings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  if (!repoSettings?.organizationId) {
    return c.json({ skills: [] });
  }

  // Get all user IDs in this organization
  const members = await prisma.organizationMember.findMany({
    where: { organizationId: repoSettings.organizationId },
    select: { userId: true },
  });

  const userIds = members.map((m) => m.userId);

  // Fetch all skills from all org members
  const skills = await prisma.skill.findMany({
    where: { userId: { in: userIds } },
    include: { resources: true },
  });

  return c.json({ skills });
});

// Record a review (called by review agent)
internalRoutes.post("/reviews", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { githubRepoId, owner, repo, pullNumber, reviewType, reviewId, commentId, tokensUsed } =
    body;

  if (!githubRepoId || !pullNumber || !reviewType) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    let repoSettings = await prisma.repositorySettings.findFirst({
      where: { githubRepoId: BigInt(githubRepoId) },
      include: { organization: true },
    });

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

    if (org) {
      const quotaPool = await getOrgQuotaPool(org.id);
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

// Record review comments + fixes (called by review agent)
internalRoutes.post("/reviews/:reviewId/comments", async (c) => {
  const apiKey = c.req.header("X-API-Key") || "";
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || !apiKey || !safeCompare(apiKey, expectedApiKey)) {
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
    const fingerprint = buildIssueFingerprint({
      type: comment.type,
      file: comment.path,
      line: comment.line,
      message: comment.body,
    });

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
      const requestedStatus = comment.fix.status;
      const status =
        requestedStatus === "WAITING_FOR_USER"
          ? "WAITING_FOR_USER"
          : autofixEnabled
            ? "ACCEPTED"
            : "PENDING";
      fix = await prisma.reviewFix.create({
        data: {
          commentId: reviewComment.id,
          status,
          fingerprint,
          diff: comment.fix.diff || null,
          summary: comment.fix.summary || null,
          commitSha: comment.fix.commitSha || null,
          clarificationQuestion: comment.fix.clarificationQuestion || null,
          clarificationContext: comment.fix.clarificationContext || null,
          acceptedAt: status === "ACCEPTED" ? new Date() : null,
        },
      });

      if (status === "WAITING_FOR_USER") {
        await prisma.reviewClarificationLock.upsert({
          where: {
            owner_repo_pullNumber_fingerprint: {
              owner: review.repositorySettings?.owner || "",
              repo: review.repositorySettings?.repo || "",
              pullNumber: review.pullNumber,
              fingerprint,
            },
          },
          create: {
            owner: review.repositorySettings?.owner || "",
            repo: review.repositorySettings?.repo || "",
            pullNumber: review.pullNumber,
            fingerprint,
            file: comment.path || "",
            line: comment.line || 0,
            issueType: comment.type || "unknown",
            message: comment.body,
            reviewFixId: fix.id,
            threadGithubCommentId: comment.githubCommentId ? BigInt(comment.githubCommentId) : null,
            active: true,
          },
          update: {
            file: comment.path || "",
            line: comment.line || 0,
            issueType: comment.type || "unknown",
            message: comment.body,
            reviewFixId: fix.id,
            threadGithubCommentId: comment.githubCommentId ? BigInt(comment.githubCommentId) : null,
            active: true,
            resolvedAt: null,
          },
        });
      }
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

export { internalRoutes };
