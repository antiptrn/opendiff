/** Organization member management: list members, update roles, and remove members. */
import { OrganizationRole } from "@prisma/client";
import { Hono } from "hono";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import {
  canManageMembers,
  getAvailableSeats,
  getOrgQuotaPool,
} from "../../middleware/organization";
import { logAudit } from "../../services/audit";

const memberRoutes = new Hono();

// List members
memberRoutes.get("/members", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

  // Check membership
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: orgId },
    include: {
      user: {
        select: {
          id: true,
          login: true,
          name: true,
          email: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: [
      { role: "asc" }, // OWNER first, then ADMIN, then MEMBER
      { createdAt: "asc" },
    ],
  });

  // Get quota pool and seat info
  const [quotaPool, seats] = await Promise.all([getOrgQuotaPool(orgId), getAvailableSeats(orgId)]);
  const org = membership.organization;

  return c.json({
    members: members.map((m) => ({
      userId: m.user.id,
      login: m.user.login,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      hasSeat: m.hasSeat,
      joinedAt: m.createdAt,
    })),
    // Org-level subscription info
    subscription: org.subscriptionTier
      ? {
          tier: org.subscriptionTier,
          status: org.subscriptionStatus,
          expiresAt: org.subscriptionExpiresAt,
          cancelAtPeriodEnd: org.cancelAtPeriodEnd,
        }
      : null,
    seats: {
      total: seats.total,
      assigned: seats.assigned,
      available: seats.available,
    },
    quotaPool: {
      total: quotaPool.total,
      used: quotaPool.used,
      hasUnlimited: quotaPool.hasUnlimited,
    },
  });
});

// Update member role
memberRoutes.put("/members/:userId", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  // Check current user's membership
  const currentMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
  });

  if (!currentMembership || !canManageMembers(currentMembership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Get target membership
  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
  });

  if (!targetMembership) {
    return c.json({ error: "User is not a member of this organization" }, 404);
  }

  const body = await c.req.json();
  const { role } = body;

  if (!role || !["OWNER", "ADMIN", "MEMBER"].includes(role)) {
    return c.json({ error: "Invalid role" }, 400);
  }

  // Only owners can change someone to/from owner
  if (
    (targetMembership.role === "OWNER" || role === "OWNER") &&
    currentMembership.role !== "OWNER"
  ) {
    return c.json({ error: "Only owners can transfer ownership" }, 403);
  }

  // Can't change your own role (unless transferring ownership)
  if (currentUser.id === targetUserId && role !== "OWNER") {
    return c.json({ error: "Cannot change your own role" }, 400);
  }

  await prisma.organizationMember.update({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    data: { role: role as OrganizationRole },
  });

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "org.member.updated",
    target: targetUserId,
    metadata: { role },
    c,
  });

  return c.json({ success: true, role });
});

// Remove member
memberRoutes.delete("/members/:userId", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  // Check current user's membership
  const currentMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
  });

  if (!currentMembership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  // Users can remove themselves, or admins/owners can remove others
  const isSelf = currentUser.id === targetUserId;
  if (!isSelf && !canManageMembers(currentMembership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Owners cannot leave the organization - they must transfer ownership first
  if (isSelf && currentMembership.role === "OWNER") {
    return c.json(
      { error: "Owners cannot leave the organization. Transfer ownership first." },
      400
    );
  }

  // Get target membership
  const targetMembership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
  });

  if (!targetMembership) {
    return c.json({ error: "User is not a member of this organization" }, 404);
  }

  // Can't remove the only owner
  if (targetMembership.role === "OWNER") {
    const ownerCount = await prisma.organizationMember.count({
      where: { organizationId: orgId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      return c.json({ error: "Cannot remove the only owner. Transfer ownership first." }, 400);
    }
  }

  await prisma.organizationMember.delete({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
  });

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "org.member.removed",
    target: targetUserId,
    c,
  });

  return c.json({ success: true });
});

export { memberRoutes };
