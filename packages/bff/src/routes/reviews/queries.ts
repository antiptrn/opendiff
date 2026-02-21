/** Review query endpoints: list reviews, get review details, update metadata, and accept/reject fixes. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { getAuthToken, getAuthUser, requireAuth, requireOrgAccess } from "../../middleware/auth";
import { generateReviewSummary } from "../../utils/generate-summary";
import { fetchPRMetadata, fetchPRMetadataBatch } from "../../utils/github-metadata";
import { Sentry } from "../../utils/sentry";

const queryRoutes = new Hono();

// ==================== REVIEWS LIST & DETAIL ENDPOINTS ====================

// Get paginated reviews for org
queryRoutes.get("/reviews", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  const page = Math.max(1, Number.parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query("limit") || "20")));
  const repoFilter = c.req.query("repo");

  // Build where clause - filter by repositorySettings relation
  const where: Record<string, unknown> = { organizationId: orgId };
  if (repoFilter) {
    if (repoFilter.includes("/")) {
      const [ownerPart, repoPart] = repoFilter.split("/", 2);
      where.repositorySettings = {
        owner: { contains: ownerPart, mode: "insensitive" },
        ...(repoPart ? { repo: { contains: repoPart, mode: "insensitive" } } : {}),
      };
    } else {
      where.repositorySettings = {
        repo: { contains: repoFilter, mode: "insensitive" },
      };
    }
  }

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        repositorySettings: true,
        comments: {
          include: { fix: true },
        },
      },
    }),
    prisma.review.count({ where }),
  ]);

  // Batch fetch PR metadata from GitHub
  const prRequests = reviews
    .filter((r) => r.repositorySettings)
    .map((r) => ({
      owner: r.repositorySettings?.owner ?? "",
      repo: r.repositorySettings?.repo ?? "",
      pullNumber: r.pullNumber,
    }));

  const prMetaMap = await fetchPRMetadataBatch(prRequests);

  const items = reviews.map((r) => {
    const commentCount = r.comments.length;
    const fixCount = r.comments.filter((c) => c.fix).length;
    const acceptedCount = r.comments.filter((c) => c.fix?.status === "ACCEPTED").length;
    const rejectedCount = r.comments.filter((c) => c.fix?.status === "REJECTED").length;
    const pendingCount = r.comments.filter(
      (c) => c.fix?.status === "PENDING" || (c.fix?.status as string) === "WAITING_FOR_USER"
    ).length;

    const owner = r.repositorySettings?.owner ?? null;
    const repo = r.repositorySettings?.repo ?? null;
    const prKey = owner && repo ? `${owner}/${repo}#${r.pullNumber}` : null;
    const prMeta = prKey ? prMetaMap.get(prKey) : null;

    return {
      id: r.id,
      owner,
      repo,
      pullNumber: r.pullNumber,
      pullTitle: prMeta?.title ?? `PR #${r.pullNumber}`,
      pullUrl:
        prMeta?.htmlUrl ??
        (owner && repo ? `https://github.com/${owner}/${repo}/pull/${r.pullNumber}` : null),
      pullAuthor: prMeta?.author ?? null,
      reviewType: r.reviewType,
      commentCount,
      fixCount,
      acceptedCount,
      rejectedCount,
      pendingCount,
      createdAt: r.createdAt,
    };
  });

  return c.json({
    reviews: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get single review with comments and fixes
queryRoutes.get("/reviews/:id", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  const { id } = c.req.param();

  const review = await prisma.review.findUnique({
    where: { id },
    include: {
      repositorySettings: true,
      comments: {
        include: { fix: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!review) {
    return c.json({ error: "Review not found" }, 404);
  }

  if (review.organizationId !== orgId) {
    return c.json({ error: "Review not found" }, 404);
  }

  // Get owner/repo from repositorySettings
  const owner = review.repositorySettings?.owner;
  const repo = review.repositorySettings?.repo;

  // Fetch PR metadata from GitHub (with graceful degradation)
  let prMeta = null;
  if (owner && repo) {
    try {
      prMeta = await fetchPRMetadata(owner, repo, review.pullNumber);
    } catch (err) {
      console.warn(`Failed to fetch PR metadata for review ${id}:`, err);
    }
  }

  // Trigger AI summary generation (fire-and-forget, atomic guard prevents duplicates)
  let triggeredSummary = false;
  if (
    review.summaryStatus === 0 &&
    owner &&
    repo &&
    prMeta?.headBranch &&
    review.comments.length > 0
  ) {
    const updated = await prisma.review.updateMany({
      where: { id, summaryStatus: 0 },
      data: { summaryStatus: 1, fileTitlesStatus: 1 },
    });

    if (updated.count > 0) {
      triggeredSummary = true;
      generateReviewSummary({
        orgId,
        owner,
        repo,
        pullNumber: review.pullNumber,
        headBranch: prMeta.headBranch,
        pullTitle: prMeta.title ?? null,
        pullBody: prMeta.body ?? null,
        pullAuthor: prMeta.author ?? null,
        baseBranch: prMeta.baseBranch ?? null,
        comments: review.comments.map((c) => ({
          body: c.body,
          path: c.path,
          line: c.line,
          fixStatus: c.fix?.status ?? null,
        })),
      })
        .then(async (result) => {
          await prisma.review.update({
            where: { id },
            data: { summary: result.summary, fileTitles: result.fileTitles },
          });
        })
        .catch(async (err) => {
          Sentry.captureException(err);
          console.error(`Failed to generate summary for review ${id}:`, err);
          await prisma.review.update({
            where: { id },
            data: { summaryStatus: 0, fileTitlesStatus: 0 },
          });
        });
    }
  }

  // Build response with GitHub data merged in (fallback values if unavailable)
  const response = {
    id: review.id,
    owner: owner ?? null,
    repo: repo ?? null,
    pullNumber: review.pullNumber,
    reviewType: review.reviewType,
    reviewId: review.reviewId,
    commentId: review.commentId,
    organizationId: review.organizationId,
    repositorySettingsId: review.repositorySettingsId,
    comments: review.comments,
    createdAt: review.createdAt,
    summary: review.summary,
    summaryStatus: triggeredSummary ? 1 : review.summaryStatus,
    fileTitles: (review.fileTitles as Record<string, string>) ?? null,
    fileTitlesStatus: triggeredSummary ? 1 : review.fileTitlesStatus,
    // GitHub data (fetched on-demand)
    pullTitle: prMeta?.title ?? null,
    pullBody: prMeta?.body ?? null,
    pullAuthor: prMeta?.author ?? null,
    pullUrl:
      prMeta?.htmlUrl ??
      (owner && repo ? `https://github.com/${owner}/${repo}/pull/${review.pullNumber}` : null),
    headBranch: prMeta?.headBranch ?? null,
    baseBranch: prMeta?.baseBranch ?? null,
    pullStatus: prMeta?.merged ? "merged" : (prMeta?.state ?? null),
    assignees: prMeta?.assignees ?? [],
    labels: prMeta?.labels ?? [],
    reviewers: prMeta?.reviewers ?? [],
  };

  return c.json({ review: response });
});

// Update review metadata (assignees, labels) -- syncs directly to GitHub
queryRoutes.patch("/reviews/:id", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const token = getAuthToken(c);

  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  const { id } = c.req.param();
  const body = await c.req.json();

  const review = await prisma.review.findUnique({
    where: { id },
    include: { repositorySettings: true },
  });
  if (!review || review.organizationId !== orgId) {
    return c.json({ error: "Review not found" }, 404);
  }

  const ghPayload: Record<string, unknown> = {};
  if (Array.isArray(body.assignees)) {
    ghPayload.assignees = body.assignees;
  }
  if (Array.isArray(body.labels)) {
    ghPayload.labels = body.labels;
  }

  if (Object.keys(ghPayload).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const owner = review.repositorySettings?.owner;
  const repo = review.repositorySettings?.repo;

  if (!owner || !repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  // Resolve GitHub token
  const isGitHubToken = /^(gho_|ghu_|ghp_|github_pat_)/.test(token);
  const githubToken: string | null = isGitHubToken ? token : user.githubAccessToken || null;

  if (!githubToken) {
    return c.json({ error: "GitHub access required" }, 403);
  }

  // Sync to GitHub
  try {
    const ghResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${review.pullNumber}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(ghPayload),
      }
    );
    if (!ghResponse.ok) {
      const errorText = await ghResponse.text();
      console.warn(`GitHub sync failed (${ghResponse.status}) for review ${id}: ${errorText}`);
      return c.json(
        { error: "Failed to update on GitHub" },
        ghResponse.status as 400 | 401 | 403 | 404 | 500
      );
    }
  } catch (err) {
    console.warn(`GitHub sync error for review ${id}:`, err);
    return c.json({ error: "Failed to connect to GitHub" }, 500);
  }

  return c.json({ success: true });
});

// ==================== FIX ACCEPT/REJECT ENDPOINTS ====================

// Accept a fix
queryRoutes.post("/reviews/:reviewId/fixes/:fixId/accept", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  const { reviewId, fixId } = c.req.param();

  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { repositorySettings: true },
  });
  if (!review || review.organizationId !== orgId) {
    return c.json({ error: "Review not found" }, 404);
  }

  const fix = await prisma.reviewFix.findUnique({
    where: { id: fixId },
    include: { comment: true },
  });

  if (!fix || fix.comment.reviewId !== reviewId) {
    return c.json({ error: "Fix not found" }, 404);
  }

  if (fix.status !== "PENDING") {
    return c.json({ error: "Fix is not pending" }, 400);
  }

  const owner = review.repositorySettings?.owner;
  const repo = review.repositorySettings?.repo;

  if (!owner || !repo) {
    return c.json({ error: "Repository not found" }, 404);
  }

  // Notify agent to apply the fix -- only mark as ACCEPTED if the agent succeeds
  try {
    const { notifyAgentFixAccepted } = await import("../../utils/agent-callback");
    await notifyAgentFixAccepted({
      fixId: fix.id,
      owner,
      repo,
      pullNumber: review.pullNumber,
      diff: fix.diff,
      summary: fix.summary,
      commentBody: fix.comment.body,
      githubCommentId: fix.comment.githubCommentId ? Number(fix.comment.githubCommentId) : null,
      path: fix.comment.path,
      line: fix.comment.line,
    });
  } catch (err) {
    Sentry.captureException(err);
    console.error("Failed to notify agent of fix acceptance:", err);
    return c.json(
      { error: "Failed to apply fix — the review agent is unreachable. Try again later." },
      502
    );
  }

  const updated = await prisma.reviewFix.update({
    where: { id: fixId },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });

  return c.json({ success: true, fix: updated });
});

// Reject a fix
queryRoutes.post("/reviews/:reviewId/fixes/:fixId/reject", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  const { reviewId, fixId } = c.req.param();

  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review || review.organizationId !== orgId) {
    return c.json({ error: "Review not found" }, 404);
  }

  const fix = await prisma.reviewFix.findUnique({
    where: { id: fixId },
    include: { comment: true },
  });

  if (!fix || fix.comment.reviewId !== reviewId) {
    return c.json({ error: "Fix not found" }, 404);
  }

  if (fix.status !== "PENDING") {
    return c.json({ error: "Fix is not pending" }, 400);
  }

  const updated = await prisma.reviewFix.update({
    where: { id: fixId },
    data: { status: "REJECTED", rejectedAt: new Date() },
  });

  return c.json({ success: true, fix: updated });
});

export { queryRoutes };
