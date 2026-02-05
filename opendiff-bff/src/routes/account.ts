import { Hono } from "hono";
import { logAudit } from "../audit";
import { findDbUser, getDbUserWhere, getOrgIdFromHeader, getUserFromToken } from "../auth";
import { prisma } from "../db";
import { paymentProvider } from "../payments";

const accountRoutes = new Hono();

// ==================== ACCOUNT MANAGEMENT ENDPOINTS ====================

// Export all user data (GDPR compliance)
accountRoutes.get("/account/export", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const userWhere = getDbUserWhere(githubUser);
  if (!userWhere) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: userWhere,
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              repositorySettings: true,
            },
          },
        },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 1000,
      },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get all repo settings from user's organizations
  const allRepoSettings = user.memberships.flatMap((m) => m.organization.repositorySettings);

  // Get reviews for org's repos
  const repoSettingsIds = allRepoSettings.map((r: { id: string }) => r.id);

  const reviews =
    repoSettingsIds.length > 0
      ? await prisma.review.findMany({
          where: {
            repositorySettingsId: { in: repoSettingsIds },
          },
          include: { repositorySettings: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

  // Build export data
  const exportData = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      githubId: user.githubId,
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    organizations: user.memberships.map((m) => ({
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      hasSeat: m.hasSeat,
      subscription: m.organization.subscriptionTier
        ? {
            tier: m.organization.subscriptionTier,
            status: m.organization.subscriptionStatus,
            seatCount: m.organization.seatCount,
            expiresAt: m.organization.subscriptionExpiresAt,
            cancelAtPeriodEnd: m.organization.cancelAtPeriodEnd,
          }
        : null,
    })),
    repositorySettings: allRepoSettings.map(
      (r: {
        owner: string;
        repo: string;
        enabled: boolean;
        triageEnabled: boolean;
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        owner: r.owner,
        repo: r.repo,
        enabled: r.enabled,
        triageEnabled: r.triageEnabled,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })
    ),
    reviews: reviews.map((r) => ({
      owner: r.repositorySettings?.owner ?? null,
      repo: r.repositorySettings?.repo ?? null,
      pullNumber: r.pullNumber,
      reviewType: r.reviewType,
      createdAt: r.createdAt,
    })),
    auditLogs: user.auditLogs.map((log) => ({
      action: log.action,
      target: log.target,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
  };

  await logAudit({
    organizationId: getOrgIdFromHeader(c),
    userId: user.id,
    action: "user.data_export",
    c,
  });

  return c.json(exportData);
});

// Delete user account (GDPR compliance)
accountRoutes.delete("/account", async (c) => {
  try {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);
    const providerUser = await getUserFromToken(token);

    if (!providerUser) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const userWhere = getDbUserWhere(providerUser);
    if (!userWhere) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const user = await prisma.user.findUnique({
      where: userWhere,
      include: {
        memberships: {
          where: { role: "OWNER" },
          include: { organization: true },
        },
      },
    });

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Cancel subscriptions and delete all organizations the user owns
    const ownedOrgIds: string[] = [];
    for (const membership of user.memberships) {
      const org = membership.organization;
      ownedOrgIds.push(org.id);

      if (org.subscriptionId && org.subscriptionStatus === "ACTIVE") {
        try {
          await paymentProvider.cancelSubscription(org.subscriptionId);
          console.log(`Cancelled subscription for org ${org.slug} during account deletion`);
        } catch (error) {
          console.error(`Failed to cancel subscription for org ${org.slug}:`, error);
          // Continue with deletion even if subscription cancellation fails
        }
      }
    }

    // Legacy: Cancel user-level subscription if active (for older accounts)
    if (user.subscriptionId && user.subscriptionStatus === "ACTIVE") {
      try {
        await paymentProvider.cancelSubscription(user.subscriptionId);
      } catch (error) {
        console.error("Failed to cancel legacy user subscription:", error);
      }
    }

    // Delete all organizations the user owns (cascades to members, invites, repo settings, audit logs)
    if (ownedOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: ownedOrgIds } },
      });
      console.log(`Deleted ${ownedOrgIds.length} owned organizations during account deletion`);
    }

    // Delete remaining user-specific data
    await prisma.auditLog.deleteMany({
      where: { userId: user.id },
    });

    await prisma.repositorySettings.deleteMany({
      where: { enabledById: user.id },
    });

    await prisma.user.delete({
      where: { id: user.id },
    });

    console.log(`Account deleted for user ${user.login} (${user.id})`);

    return c.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    console.error("Failed to delete account:", error);
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to delete account" },
      500
    );
  }
});

// ==================== ONBOARDING ENDPOINTS ====================

// Complete onboarding
accountRoutes.post("/onboarding/complete", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const body = await c.req.json();
  const { accountType, personalOrgId } = body;

  if (!accountType || (accountType !== "SOLO" && accountType !== "TEAM")) {
    return c.json({ error: "accountType must be SOLO or TEAM" }, 400);
  }

  // Find the user first
  const existingUser = await findDbUser(githubUser);
  if (!existingUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // For SOLO users, we store the personal org ID so we can filter it out later
  const updateData: {
    accountType: "SOLO" | "TEAM";
    onboardingCompletedAt: Date;
    personalOrgId?: string;
  } = {
    accountType: accountType,
    onboardingCompletedAt: new Date(),
  };

  if (accountType === "SOLO" && personalOrgId) {
    updateData.personalOrgId = personalOrgId;
  }

  const user = await prisma.user.update({
    where: { id: existingUser.id },
    data: updateData,
  });

  await logAudit({
    userId: user.id,
    action: "user.onboarding_completed",
    metadata: { accountType, personalOrgId },
    c,
  });

  return c.json({
    success: true,
    accountType: user.accountType,
    onboardingCompletedAt: user.onboardingCompletedAt,
    personalOrgId: user.personalOrgId,
  });
});

// Update account type
accountRoutes.put("/account/type", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const body = await c.req.json();
  const { accountType } = body;

  if (!accountType || (accountType !== "SOLO" && accountType !== "TEAM")) {
    return c.json({ error: "accountType must be SOLO or TEAM" }, 400);
  }

  // Find the user first
  const existingUser = await findDbUser(githubUser);
  if (!existingUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const user = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      accountType: accountType,
    },
  });

  await logAudit({
    userId: user.id,
    action: "user.account_type_changed",
    metadata: { accountType },
    c,
  });

  return c.json({
    success: true,
    accountType: user.accountType,
  });
});

export { accountRoutes };
