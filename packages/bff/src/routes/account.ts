import { Hono } from "hono";
import { getOrgIdFromHeader } from "../auth";
import { prisma } from "../db";
import { getAuthUser, requireAuth } from "../middleware/auth";
import { paymentProvider } from "../payments";
import { Sentry } from "../utils/sentry";
import { logAudit } from "../services/audit";

const accountRoutes = new Hono();

// All account routes require authentication
accountRoutes.use(requireAuth());

// ==================== ACCOUNT MANAGEMENT ENDPOINTS ====================

// Export all user data (GDPR compliance)
accountRoutes.get("/account/export", async (c) => {
  const user = getAuthUser(c);

  // Re-fetch with includes needed
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
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

  if (!fullUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get all repo settings from user's organizations
  const allRepoSettings = fullUser.memberships.flatMap((m) => m.organization.repositorySettings);

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
      id: fullUser.id,
      githubId: fullUser.githubId,
      login: fullUser.login,
      name: fullUser.name,
      email: fullUser.email,
      avatarUrl: fullUser.avatarUrl,
      createdAt: fullUser.createdAt,
      updatedAt: fullUser.updatedAt,
    },
    organizations: fullUser.memberships.map((m) => ({
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
        createdAt: Date;
        updatedAt: Date;
      }) => ({
        owner: r.owner,
        repo: r.repo,
        enabled: r.enabled,
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
    auditLogs: fullUser.auditLogs.map((log) => ({
      action: log.action,
      target: log.target,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
  };

  await logAudit({
    organizationId: getOrgIdFromHeader(c),
    userId: fullUser.id,
    action: "user.data_export",
    c,
  });

  return c.json(exportData);
});

// Delete user account (GDPR compliance)
accountRoutes.delete("/account", async (c) => {
  try {
    const user = getAuthUser(c);

    // Re-fetch with includes needed
    const fullUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          where: { role: "OWNER" },
          include: { organization: true },
        },
      },
    });

    if (!fullUser) {
      return c.json({ error: "User not found" }, 404);
    }

    // Cancel subscriptions and delete all organizations the user owns
    const ownedOrgIds: string[] = [];
    for (const membership of fullUser.memberships) {
      const org = membership.organization;
      ownedOrgIds.push(org.id);

      if (org.subscriptionId && org.subscriptionStatus === "ACTIVE") {
        try {
          await paymentProvider.cancelSubscription(org.subscriptionId);
          console.log(`Cancelled subscription for org ${org.slug} during account deletion`);
        } catch (error) {
          Sentry.captureException(error);
          console.error(`Failed to cancel subscription for org ${org.slug}:`, error);
          // Continue with deletion even if subscription cancellation fails
        }
      }
    }

    // Legacy: Cancel user-level subscription if active (for older accounts)
    if (fullUser.subscriptionId && fullUser.subscriptionStatus === "ACTIVE") {
      try {
        await paymentProvider.cancelSubscription(fullUser.subscriptionId);
      } catch (error) {
        Sentry.captureException(error);
        console.error("Failed to cancel legacy user subscription:", error);
      }
    }

    // Delete reviews linked to owned organizations (onDelete: SetNull would orphan them)
    if (ownedOrgIds.length > 0) {
      await prisma.review.deleteMany({
        where: { organizationId: { in: ownedOrgIds } },
      });
    }

    // Delete all organizations the user owns (cascades to members, invites, repo settings, notifications)
    if (ownedOrgIds.length > 0) {
      await prisma.organization.deleteMany({
        where: { id: { in: ownedOrgIds } },
      });
      console.log(`Deleted ${ownedOrgIds.length} owned organizations during account deletion`);
    }

    // Delete remaining user-specific data
    await prisma.auditLog.deleteMany({
      where: { userId: fullUser.id },
    });

    await prisma.feedback.deleteMany({
      where: { userId: fullUser.id },
    });

    // Clear invites sent by this user to non-owned orgs (no onDelete on invitedById)
    await prisma.organizationInvite.deleteMany({
      where: { invitedById: fullUser.id },
    });

    await prisma.repositorySettings.deleteMany({
      where: { enabledById: fullUser.id },
    });

    await prisma.user.delete({
      where: { id: fullUser.id },
    });

    console.log(`Account deleted for user ${fullUser.login} (${fullUser.id})`);

    return c.json({ success: true, message: "Account deleted successfully" });
  } catch (error) {
    Sentry.captureException(error);
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
  const user = getAuthUser(c);

  const body = await c.req.json();
  const { accountType, personalOrgId } = body;

  if (!accountType || (accountType !== "SOLO" && accountType !== "TEAM")) {
    return c.json({ error: "accountType must be SOLO or TEAM" }, 400);
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

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: updateData,
  });

  await logAudit({
    userId: updatedUser.id,
    action: "user.onboarding_completed",
    metadata: { accountType, personalOrgId },
    c,
  });

  return c.json({
    success: true,
    accountType: updatedUser.accountType,
    onboardingCompletedAt: updatedUser.onboardingCompletedAt,
    personalOrgId: updatedUser.personalOrgId,
  });
});

// Update account type
accountRoutes.put("/account/type", async (c) => {
  const user = getAuthUser(c);

  const body = await c.req.json();
  const { accountType } = body;

  if (!accountType || (accountType !== "SOLO" && accountType !== "TEAM")) {
    return c.json({ error: "accountType must be SOLO or TEAM" }, 400);
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: {
      accountType: accountType,
    },
  });

  await logAudit({
    userId: updatedUser.id,
    action: "user.account_type_changed",
    metadata: { accountType },
    c,
  });

  return c.json({
    success: true,
    accountType: updatedUser.accountType,
  });
});

export { accountRoutes };
