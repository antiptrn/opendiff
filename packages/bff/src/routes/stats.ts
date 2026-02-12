import { Hono } from "hono";
import { getAuthToken, getAuthUser, requireAuth, requireOrgAccess } from "../middleware/auth";
import { prisma } from "../db";

const statsRoutes = new Hono();

// Get dashboard stats for authenticated user
statsRoutes.get("/", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const token = getAuthToken(c);
  const orgId = await requireOrgAccess(c);

  // Check if user has GitHub access
  const isGitHubToken = /^(gho_|ghu_|ghp_|github_pat_)/.test(token);
  let hasGithubAccess = isGitHubToken;
  let githubToken = isGitHubToken ? token : null;

  if (!isGitHubToken && user.githubAccessToken) {
    hasGithubAccess = true;
    githubToken = user.githubAccessToken;
  }

  try {
    // If user has org context and no GitHub access, use org repos from database
    if (orgId && !hasGithubAccess) {
      // Get org repos from database
      const orgRepos = await prisma.repositorySettings.findMany({
        where: {
          organizationId: orgId,
          enabled: true,
        },
      });

      const repoSettingsIds = orgRepos.map((r) => r.id);

      // Local review filter (reviews from VSCode extension, no repo attached)
      const localReviewFilter = { organizationId: orgId, repositorySettingsId: null as string | null };

      // Count reviews for org's repos + local reviews
      const reviewCount = await prisma.review.count({
        where: {
          OR: [
            ...(repoSettingsIds.length > 0
              ? [{ repositorySettingsId: { in: repoSettingsIds } }]
              : []),
            localReviewFilter,
          ],
        },
      });

      // Count issues found (review comments)
      const issuesFound = await prisma.reviewComment.count({
        where: {
          review: {
            OR: [
              ...(repoSettingsIds.length > 0
                ? [{ repositorySettingsId: { in: repoSettingsIds } }]
                : []),
              localReviewFilter,
            ],
          },
        },
      });

      // Count issues fixed (accepted fixes)
      const issuesFixed = await prisma.reviewFix.count({
        where: {
          status: "ACCEPTED",
          comment: {
            review: {
              OR: [
                ...(repoSettingsIds.length > 0
                  ? [{ repositorySettingsId: { in: repoSettingsIds } }]
                  : []),
                localReviewFilter,
              ],
            },
          },
        },
      });

      return c.json({
        reviewCount,
        connectedRepos: orgRepos.length,
        totalRepos: orgRepos.length, // For users without GitHub access, total = connected
        issuesFound,
        issuesFixed,
      });
    }

    // User has GitHub access - use GitHub API
    const reposResponse = await fetch(
      "https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member",
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, 500);
    }

    const repos = await reposResponse.json();
    const repoNames = repos.map((r: { owner: { login: string }; name: string }) => ({
      owner: r.owner.login,
      repo: r.name,
    }));

    // Scope all DB queries to the current org so we don't pick up orphaned data
    const repoOrgFilter = orgId ? { organizationId: orgId } : {};

    // Count connected repos (repos with enabled=true)
    const connectedRepos =
      repoNames.length > 0
        ? await prisma.repositorySettings.count({
            where: {
              ...repoOrgFilter,
              OR: repoNames.map((r: { owner: string; repo: string }) => ({
                owner: r.owner,
                repo: r.repo,
                enabled: true,
              })),
            },
          })
        : 0;

    // Build review filter: repo-based reviews + local reviews (no repo attached)
    const reviewOrConditions: Record<string, unknown>[] = [];

    if (repoNames.length > 0) {
      reviewOrConditions.push({
        ...(orgId ? { organizationId: orgId } : {}),
        repositorySettings: {
          OR: repoNames.map((r: { owner: string; repo: string }) => ({
            owner: r.owner,
            repo: r.repo,
          })),
        },
      });
    }

    // Include local reviews (from VSCode extension, no repo attached)
    if (orgId) {
      reviewOrConditions.push({ organizationId: orgId, repositorySettingsId: null });
    }

    // Count reviews for user's repos + local reviews
    const reviewCount =
      reviewOrConditions.length > 0
        ? await prisma.review.count({ where: { OR: reviewOrConditions } })
        : 0;

    // Count issues found (review comments)
    const issuesFound =
      reviewOrConditions.length > 0
        ? await prisma.reviewComment.count({
            where: { review: { OR: reviewOrConditions } },
          })
        : 0;

    // Count issues fixed (accepted fixes)
    const issuesFixed =
      reviewOrConditions.length > 0
        ? await prisma.reviewFix.count({
            where: {
              status: "ACCEPTED",
              comment: { review: { OR: reviewOrConditions } },
            },
          })
        : 0;

    return c.json({
      reviewCount,
      connectedRepos,
      totalRepos: repos.length,
      issuesFound,
      issuesFixed,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

// Get review time series data
statsRoutes.get("/reviews-over-time", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  const interval = c.req.query("interval") || "day"; // hour, day, week, month, year
  const metric = c.req.query("metric") || "reviews"; // reviews, issues, fixes

  try {
    // Determine current and previous period boundaries for comparison
    const now = new Date();
    let currentStart: Date;
    let previousStart: Date;
    let previousEnd: Date;

    type SubInterval = { key: string; label: string };
    let subIntervals: SubInterval[];

    switch (interval) {
      case "hour": {
        currentStart = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate(),
          now.getHours(),
          0,
          0,
          0
        );
        previousEnd = new Date(currentStart);
        previousStart = new Date(currentStart.getTime() - 60 * 60 * 1000);
        // 13 points (maxIndex=12, divisible by 2,3,4,6)
        subIntervals = Array.from({ length: 13 }, (_, i) => {
          const min = i * 5;
          return { key: String(min), label: `:${String(min).padStart(2, "0")}` };
        });
        break;
      }
      case "week": {
        const dayOfWeek = now.getDay();
        const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysFromMon);
        previousEnd = new Date(currentStart);
        previousStart = new Date(currentStart.getTime() - 7 * 24 * 60 * 60 * 1000);
        const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
        subIntervals = dayNames.map((name, i) => ({ key: String(i), label: name }));
        break;
      }
      case "month": {
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        previousStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        previousEnd = new Date(currentStart);
        // Always 31 points (maxIndex=30, divisible by 2,3,5,6)
        subIntervals = Array.from({ length: 31 }, (_, i) => ({
          key: String(i + 1),
          label: String(i + 1),
        }));
        break;
      }
      case "year": {
        currentStart = new Date(now.getFullYear(), 0, 1);
        previousStart = new Date(now.getFullYear() - 1, 0, 1);
        previousEnd = new Date(currentStart);
        // 13 points (maxIndex=12, divisible by 2,3,4,6)
        const monthNames = [
          "Jan",
          "Feb",
          "Mar",
          "Apr",
          "May",
          "Jun",
          "Jul",
          "Aug",
          "Sep",
          "Oct",
          "Nov",
          "Dec",
          "Jan",
        ];
        subIntervals = monthNames.map((name, i) => ({ key: String(i), label: name }));
        break;
      }
      default: {
        // day
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        previousEnd = new Date(currentStart);
        previousStart = new Date(currentStart.getTime() - 24 * 60 * 60 * 1000);
        // 25 points (maxIndex=24, divisible by 2,3,4,6,8)
        subIntervals = Array.from({ length: 25 }, (_, i) => {
          const h = i % 12 || 12;
          const ampm = i < 12 || i === 24 ? "AM" : "PM";
          return { key: String(i), label: `${h} ${ampm}` };
        });
      }
    }

    // Build the repository filter
    let repoFilter: { repositorySettingsId?: { in: string[] }; organizationId?: string } = {};

    if (orgId) {
      repoFilter = { organizationId: orgId };
    }

    // Build review filter that includes both repo-based and local reviews
    const timeSeriesOrgId = repoFilter.organizationId;
    const timeSeriesReviewFilter = timeSeriesOrgId
      ? {
          OR: [
            { repositorySettings: { organizationId: timeSeriesOrgId } },
            { organizationId: timeSeriesOrgId, repositorySettingsId: null as string | null },
          ],
        }
      : {};

    // Fetch records for current and previous periods in parallel
    const fetchPeriodData = (gte: Date, lt: Date) => {
      switch (metric) {
        case "issues":
          return prisma.reviewComment.findMany({
            where: {
              createdAt: { gte, lt },
              review: timeSeriesReviewFilter,
            },
            select: { createdAt: true },
          });
        case "fixes":
          return prisma.reviewFix.findMany({
            where: {
              status: "ACCEPTED",
              createdAt: { gte, lt },
              comment: { review: timeSeriesReviewFilter },
            },
            select: { createdAt: true },
          });
        default: // reviews
          return prisma.review.findMany({
            where: {
              createdAt: { gte, lt },
              ...timeSeriesReviewFilter,
            },
            select: { createdAt: true },
          });
      }
    };

    const [currentReviews, previousReviews] = await Promise.all([
      fetchPeriodData(currentStart, now),
      fetchPeriodData(previousStart, previousEnd),
    ]);

    // Group by sub-interval
    const currentCounts = new Map<string, number>();
    const previousCounts = new Map<string, number>();
    for (const sub of subIntervals) {
      currentCounts.set(sub.key, 0);
      previousCounts.set(sub.key, 0);
    }

    for (const review of currentReviews) {
      const key = getSubIntervalKey(review.createdAt, interval);
      currentCounts.set(key, (currentCounts.get(key) || 0) + 1);
    }
    for (const review of previousReviews) {
      const key = getSubIntervalKey(review.createdAt, interval);
      previousCounts.set(key, (previousCounts.get(key) || 0) + 1);
    }

    const data = subIntervals.map((sub) => ({
      label: sub.label,
      current: currentCounts.get(sub.key) || 0,
      previous: previousCounts.get(sub.key) || 0,
    }));

    return c.json({
      data,
      interval,
      currentStart: currentStart.toISOString(),
      currentEnd: now.toISOString(),
      previousStart: previousStart.toISOString(),
      previousEnd: previousEnd.toISOString(),
    });
  } catch (error) {
    console.error("Error fetching review time series:", error);
    return c.json({ error: "Failed to fetch data" }, 500);
  }
});

function getSubIntervalKey(date: Date, interval: string): string {
  switch (interval) {
    case "hour":
      return String(Math.floor(date.getMinutes() / 5) * 5);
    case "week": {
      const day = date.getDay();
      return String(day === 0 ? 6 : day - 1);
    }
    case "month":
      return String(date.getDate());
    case "year":
      return String(date.getMonth());
    default: // day
      return String(date.getHours());
  }
}

export { statsRoutes };
