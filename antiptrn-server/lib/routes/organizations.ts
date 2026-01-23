import { Hono } from "hono";
import { PrismaClient, OrganizationRole } from "@prisma/client";
import { logAudit } from "../audit";
import { sendInviteEmail } from "../email";
import {
  canManageMembers,
  canManageBilling,
  canDeleteOrg,
  canUpdateOrg,
  getUserOrganizations,
  getOrgQuotaPool,
  getAvailableSeats,
  getAssignedSeatCount,
} from "../middleware/organization";
import { paymentProvider, getPaymentProviderName, SEAT_PRICING, isYearlyProduct } from "../payments";
import { uploadFile, isStorageConfigured, getKeyFromUrl, deleteFile } from "../storage";

const prisma = new PrismaClient();

// Helper to get user from DB by OAuth token (supports both GitHub and Google)
async function getUserFromToken(token: string) {
  // Try GitHub first
  const githubResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (githubResponse.ok) {
    const githubUser = await githubResponse.json();
    const user = await prisma.user.findUnique({
      where: { githubId: githubUser.id },
    });
    if (user) return user;
  }

  // Try Google
  const googleResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (googleResponse.ok) {
    const googleUser = await googleResponse.json();
    const user = await prisma.user.findUnique({
      where: { googleId: googleUser.id },
    });
    if (user) return user;
  }

  return null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const organizationRoutes = new Hono();

// ==================== ORGANIZATION CRUD ====================

// List user's organizations
organizationRoutes.get("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const organizations = await getUserOrganizations(user.id);
  return c.json(organizations);
});

// Create organization
organizationRoutes.post("/", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const body = await c.req.json();
  const { name, isPersonal } = body;

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    return c.json({ error: "Organization name must be at least 2 characters" }, 400);
  }

  // Generate unique slug
  let baseSlug = slugify(name.trim());
  if (!baseSlug) baseSlug = "org";
  let slug = baseSlug;
  let counter = 1;

  while (await prisma.organization.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  // Create organization
  const organization = await prisma.organization.create({
    data: {
      name: name.trim(),
      slug,
      isPersonal: isPersonal === true,
    },
  });

  // Make user the owner
  await prisma.organizationMember.create({
    data: {
      organizationId: organization.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  await logAudit({
    organizationId: organization.id,
    userId: user.id,
    action: "org.created",
    target: organization.slug,
    c,
  });

  return c.json({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    role: "OWNER",
  }, 201);
});

// Get organization details
organizationRoutes.get("/:orgId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership
  let membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    include: {
      organization: {
        include: {
          _count: { select: { members: true } },
        },
      },
    },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  const org = membership.organization;

  // Auto-assign seat for solo users who should have one
  // Solo users with active subscription and available seats get auto-assigned
  if (
    user.accountType === "SOLO" &&
    !membership.hasSeat &&
    org.subscriptionStatus === "ACTIVE" &&
    org.seatCount > 0
  ) {
    // Check if there are available seats
    const assignedCount = await prisma.organizationMember.count({
      where: { organizationId: orgId, hasSeat: true },
    });

    if (assignedCount < org.seatCount) {
      // Auto-assign seat to solo user
      membership = await prisma.organizationMember.update({
        where: {
          organizationId_userId: { organizationId: orgId, userId: user.id },
        },
        data: { hasSeat: true },
        include: {
          organization: {
            include: {
              _count: { select: { members: true } },
            },
          },
        },
      });
      console.log(`Auto-assigned seat to solo user ${user.login} in org ${org.slug}`);
    }
  }

  const quotaPool = await getOrgQuotaPool(orgId);
  const seats = await getAvailableSeats(orgId);

  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    avatarUrl: org.avatarUrl,
    membersCount: org._count.members,
    role: membership.role,
    hasSeat: membership.hasSeat,
    createdAt: org.createdAt,
    // Org-level subscription
    subscription: org.subscriptionTier ? {
      tier: org.subscriptionTier,
      status: org.subscriptionStatus,
      seatCount: org.seatCount,
      expiresAt: org.subscriptionExpiresAt,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    } : null,
    // Seat allocation
    seats: {
      total: seats.total,
      assigned: seats.assigned,
      available: seats.available,
    },
    // Organization quota pool
    quotaPool: {
      total: quotaPool.total,
      used: quotaPool.used,
      hasUnlimited: quotaPool.hasUnlimited,
    },
  });
});

// Update organization
organizationRoutes.put("/:orgId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership and permissions
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canUpdateOrg(membership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const body = await c.req.json();
  const { name, slug: newSlug } = body;

  const updateData: { name?: string; slug?: string } = {};

  if (name && typeof name === "string" && name.trim().length >= 2) {
    updateData.name = name.trim();
  }

  if (newSlug && typeof newSlug === "string") {
    const cleanSlug = slugify(newSlug);
    if (cleanSlug.length >= 2) {
      // Check if slug is taken by another org
      const existing = await prisma.organization.findUnique({
        where: { slug: cleanSlug },
      });
      if (existing && existing.id !== orgId) {
        return c.json({ error: "This URL is already taken" }, 400);
      }
      updateData.slug = cleanSlug;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: "No valid fields to update" }, 400);
  }

  const organization = await prisma.organization.update({
    where: { id: orgId },
    data: updateData,
  });

  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "org.updated",
    metadata: updateData,
    c,
  });

  return c.json({
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
  });
});

// Delete organization
organizationRoutes.delete("/:orgId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership and permissions
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canDeleteOrg(membership.role)) {
    return c.json({ error: "Only the owner can delete an organization" }, 403);
  }

  // Get org name for logging
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  // Delete organization (cascades to members, invites, settings)
  await prisma.organization.delete({
    where: { id: orgId },
  });

  await logAudit({
    userId: user.id,
    action: "org.deleted",
    target: org?.slug,
    c,
  });

  return c.json({ success: true });
});

// Upload organization avatar
organizationRoutes.post("/:orgId/avatar", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership and permissions
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canUpdateOrg(membership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  if (!isStorageConfigured()) {
    return c.json({ error: "File storage is not configured" }, 500);
  }

  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return c.json({ error: "No file provided" }, 400);
    }

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return c.json({ error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF" }, 400);
    }

    // Validate file size (max 2MB)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json({ error: "File too large. Maximum size is 2MB" }, 400);
    }

    // Delete old avatar if exists
    const oldAvatarUrl = membership.organization.avatarUrl;
    if (oldAvatarUrl) {
      const oldKey = getKeyFromUrl(oldAvatarUrl);
      if (oldKey) {
        try {
          await deleteFile(oldKey);
        } catch (e) {
          console.error("Failed to delete old avatar:", e);
        }
      }
    }

    // Upload new avatar
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.type.split("/")[1];
    const key = `org_avatars/${orgId}.${extension}`;
    const baseUrl = await uploadFile(key, buffer, file.type);

    // Add cache-busting timestamp to URL
    const avatarUrl = `${baseUrl}?v=${Date.now()}`;

    // Update organization
    await prisma.organization.update({
      where: { id: orgId },
      data: { avatarUrl },
    });

    await logAudit({
      organizationId: orgId,
      userId: user.id,
      action: "org.avatar.updated",
      c,
    });

    return c.json({ avatarUrl });
  } catch (error) {
    console.error("Error uploading avatar:", error);
    return c.json({ error: "Failed to upload avatar" }, 500);
  }
});

// Delete organization avatar
organizationRoutes.delete("/:orgId/avatar", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
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

  if (!canUpdateOrg(membership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const avatarUrl = membership.organization.avatarUrl;
  if (!avatarUrl) {
    return c.json({ error: "No avatar to delete" }, 400);
  }

  try {
    const key = getKeyFromUrl(avatarUrl);
    if (key) {
      await deleteFile(key);
    }

    await prisma.organization.update({
      where: { id: orgId },
      data: { avatarUrl: null },
    });

    await logAudit({
      organizationId: orgId,
      userId: user.id,
      action: "org.avatar.deleted",
      c,
    });

    return c.json({ success: true });
  } catch (error) {
    console.error("Error deleting avatar:", error);
    return c.json({ error: "Failed to delete avatar" }, 500);
  }
});

// ==================== MEMBER MANAGEMENT ====================

// List members
organizationRoutes.get("/:orgId/members", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

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
  const quotaPool = await getOrgQuotaPool(orgId);
  const seats = await getAvailableSeats(orgId);
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
    subscription: org.subscriptionTier ? {
      tier: org.subscriptionTier,
      status: org.subscriptionStatus,
      expiresAt: org.subscriptionExpiresAt,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    } : null,
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
organizationRoutes.put("/:orgId/members/:userId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

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
organizationRoutes.delete("/:orgId/members/:userId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

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
    return c.json({ error: "Owners cannot leave the organization. Transfer ownership first." }, 400);
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

// ==================== SUBSCRIPTION MANAGEMENT ====================

// Get subscription details
organizationRoutes.get("/:orgId/subscription", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
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

  const org = membership.organization;
  const seats = await getAvailableSeats(orgId);
  const quotaPool = await getOrgQuotaPool(orgId);

  return c.json({
    subscription: org.subscriptionTier ? {
      tier: org.subscriptionTier,
      status: org.subscriptionStatus,
      seatCount: org.seatCount,
      expiresAt: org.subscriptionExpiresAt,
      cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    } : null,
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

// Create or update subscription (purchase seats)
organizationRoutes.post("/:orgId/subscription", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true, user: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage subscriptions" }, 403);
  }

  const body = await c.req.json();
  const { tier, billing, quantity, seatCount } = body;

  // Validate tier
  if (!["BYOK", "CODE_REVIEW", "TRIAGE"].includes(tier)) {
    return c.json({ error: "Invalid tier. Must be BYOK, CODE_REVIEW, or TRIAGE" }, 400);
  }

  // Validate billing
  if (!["monthly", "yearly"].includes(billing)) {
    return c.json({ error: "Invalid billing cycle. Must be monthly or yearly" }, 400);
  }

  // Validate quantity (accept both quantity and seatCount for compatibility)
  const seatQuantity = parseInt(seatCount ?? quantity) || 1;
  if (seatQuantity < 1 || seatQuantity > 100) {
    return c.json({ error: "Quantity must be between 1 and 100" }, 400);
  }

  const org = membership.organization;

  try {
    // If org already has an active subscription, update it
    if (org.polarSubscriptionId && org.subscriptionStatus === "ACTIVE") {
      const currentProductId = org.polarProductId;
      const newProductId = paymentProvider.getProductId(tier, billing);

      // Check if changing tier/billing or just adding seats
      if (currentProductId === newProductId) {
        // Just updating seat count (Polar doesn't support quantity updates, tracked internally)
        await prisma.organization.update({
          where: { id: orgId },
          data: { seatCount: seatQuantity },
        });

        await logAudit({
          organizationId: orgId,
          userId: currentUser.id,
          action: "subscription.updated",
          metadata: { tier, quantity: seatQuantity, action: "quantity_change" },
          c,
        });

        return c.json({
          success: true,
          message: `Updated to ${seatQuantity} seats`,
          subscription: {
            tier: org.subscriptionTier,
            seatCount: seatQuantity,
          },
        });
      } else {
        // Changing tier/billing - need to update product
        await paymentProvider.updateSubscription({
          subscriptionId: org.polarSubscriptionId,
          productId: newProductId,
          quantity: seatQuantity,
        });

        await prisma.organization.update({
          where: { id: orgId },
          data: {
            subscriptionTier: tier,
            polarProductId: newProductId,
            seatCount: seatQuantity,
          },
        });

        await logAudit({
          organizationId: orgId,
          userId: currentUser.id,
          action: "subscription.updated",
          metadata: { tier, billing, quantity: seatQuantity, action: "tier_change" },
          c,
        });

        return c.json({
          success: true,
          message: `Changed to ${tier} with ${seatQuantity} seats`,
          subscription: {
            tier,
            seatCount: seatQuantity,
          },
        });
      }
    }

    // No existing subscription - create checkout
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";
    const checkout = await paymentProvider.createCheckout({
      productId: paymentProvider.getProductId(tier, billing),
      quantity: seatQuantity,
      successUrl: `${FRONTEND_URL}/console/settings?tab=organization&subscription_success=1`,
      customerEmail: membership.user.email || undefined,
      customerName: membership.user.name || membership.user.login,
      metadata: {
        type: "org_subscription",
        orgId,
        tier,
        seatCount: String(seatQuantity),
      },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.created",
      metadata: { tier, billing, quantity: seatQuantity },
      c,
    });

    return c.json({ checkoutUrl: checkout.checkoutUrl });
  } catch (error) {
    console.error("Error managing subscription:", error);
    return c.json({ error: "Failed to process subscription" }, 500);
  }
});

// Cancel subscription
organizationRoutes.post("/:orgId/subscription/cancel", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can cancel subscriptions" }, 403);
  }

  const org = membership.organization;

  if (!org.polarSubscriptionId) {
    return c.json({ error: "No active subscription" }, 400);
  }

  try {
    await paymentProvider.cancelSubscription(org.polarSubscriptionId);

    await prisma.organization.update({
      where: { id: orgId },
      data: { cancelAtPeriodEnd: true },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.cancelled",
      c,
    });

    return c.json({
      success: true,
      message: "Subscription will be cancelled at the end of the billing period",
    });
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
});

// Reactivate cancelled subscription
organizationRoutes.post("/:orgId/subscription/reactivate", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can reactivate subscriptions" }, 403);
  }

  const org = membership.organization;

  if (!org.polarSubscriptionId) {
    return c.json({ error: "No subscription to reactivate" }, 400);
  }

  if (!org.cancelAtPeriodEnd) {
    return c.json({ error: "Subscription is not scheduled for cancellation" }, 400);
  }

  try {
    await paymentProvider.reactivateSubscription(org.polarSubscriptionId);

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        cancelAtPeriodEnd: false,
        subscriptionStatus: "ACTIVE",
      },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.resubscribed",
      c,
    });

    return c.json({ success: true, message: "Subscription reactivated" });
  } catch (error) {
    console.error("Error reactivating subscription:", error);
    return c.json({ error: "Failed to reactivate subscription" }, 500);
  }
});

// ==================== SEAT COUNT MANAGEMENT ====================

// Update seat count (add/remove seats with Stripe)
organizationRoutes.post("/:orgId/subscription/seats", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage seat count" }, 403);
  }

  const org = membership.organization;

  if (!org.polarSubscriptionId || org.subscriptionStatus !== "ACTIVE") {
    return c.json({ error: "No active subscription" }, 400);
  }

  const body = await c.req.json();
  const { count } = body;

  // Validate seat count
  const newSeatCount = parseInt(count);
  if (isNaN(newSeatCount) || newSeatCount < 1 || newSeatCount > 100) {
    return c.json({ error: "Seat count must be between 1 and 100" }, 400);
  }

  // Can't reduce below currently assigned seats
  const assignedSeats = await getAssignedSeatCount(orgId);
  if (newSeatCount < assignedSeats) {
    return c.json({
      error: `Cannot reduce seats below currently assigned count (${assignedSeats})`,
      assignedSeats,
    }, 400);
  }

  if (newSeatCount === org.seatCount) {
    return c.json({ error: "No change in seat count" }, 400);
  }

  try {
    // Check subscription status in Stripe before attempting update
    // This catches cases where our DB says ACTIVE but Stripe has it as incomplete_expired
    if (getPaymentProviderName() === "stripe") {
      const subscription = await paymentProvider.getSubscription(org.polarSubscriptionId);
      if (subscription.status !== "active") {
        if (subscription.status === "incomplete" || subscription.status === "incomplete_expired") {
          return c.json({
            error: "Your subscription payment is incomplete. Please complete your subscription setup before updating seats.",
            requiresCheckout: true,
            subscriptionStatus: subscription.status,
          }, 400);
        }
        return c.json({
          error: `Cannot update seats: subscription is ${subscription.status}`,
          subscriptionStatus: subscription.status,
        }, 400);
      }
    }

    // Update Stripe subscription quantity
    await paymentProvider.updateSubscription({
      subscriptionId: org.polarSubscriptionId,
      quantity: newSeatCount,
    });

    // Update database
    await prisma.organization.update({
      where: { id: orgId },
      data: { seatCount: newSeatCount },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.seats.updated",
      metadata: {
        previousCount: org.seatCount,
        newCount: newSeatCount,
      },
      c,
    });

    return c.json({
      success: true,
      seatCount: newSeatCount,
      previousCount: org.seatCount,
    });
  } catch (error) {
    console.error("Error updating seat count:", error);
    
    // Handle Stripe-specific errors
    const errorObj = error as { type?: string; message?: string };
    if (errorObj?.type === "StripeInvalidRequestError") {
      const errorMessage = errorObj.message || "";
      
      // Check for incomplete_expired subscription error
      if (errorMessage.includes("incomplete_expired") || errorMessage.includes("incomplete")) {
        return c.json({
          error: "Your subscription payment is incomplete. Please complete your subscription setup before updating seats.",
          requiresCheckout: true,
        }, 400);
      }
      
      // Return Stripe's error message if available
      if (errorMessage) {
        return c.json({ error: errorMessage }, 400);
      }
    }
    
    return c.json({ error: "Failed to update seat count" }, 500);
  }
});

// Preview seat change proration
organizationRoutes.get("/:orgId/subscription/seats/preview", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can preview seat changes" }, 403);
  }

  const org = membership.organization;

  if (!org.polarSubscriptionId || org.subscriptionStatus !== "ACTIVE") {
    return c.json({ error: "No active subscription" }, 400);
  }

  const countParam = c.req.query("count");
  const newSeatCount = parseInt(countParam || "");

  if (isNaN(newSeatCount) || newSeatCount < 1 || newSeatCount > 100) {
    return c.json({ error: "count query parameter must be between 1 and 100" }, 400);
  }

  try {
    const preview = await paymentProvider.previewSubscriptionChange({
      subscriptionId: org.polarSubscriptionId,
      quantity: newSeatCount,
    });

    return c.json(preview);
  } catch (error) {
    // If preview fails (e.g., Polar doesn't support it), calculate manually
    
    const currentSeatCount = org.seatCount ?? 0;
    const tier = org.subscriptionTier;
    
    if (!tier || currentSeatCount === 0 || tier === "FREE") {
      return c.json({ error: "Invalid subscription state for preview" }, 400);
    }

    // Get price per seat based on tier and billing cycle
    const isYearly = isYearlyProduct(org.polarProductId);
    const tierKey = tier as keyof typeof SEAT_PRICING;
    const pricePerSeatCents = SEAT_PRICING[tierKey]?.[isYearly ? "yearly" : "monthly"] ?? 0;
    
    if (pricePerSeatCents === 0) {
      return c.json({ error: "Unable to determine price for tier" }, 400);
    }

    // Calculate proration
    let proratedCharge = 0;
    const seatDifference = newSeatCount - currentSeatCount;
    
    if (seatDifference !== 0) {
      // Try to get subscription details for accurate period calculation
      let periodEnd: Date | null = null;
      let periodStart: Date | null = null;
      
      try {
        if (!org.polarSubscriptionId) {
          throw new Error("No subscription ID");
        }
        const subscription = await paymentProvider.getSubscription(org.polarSubscriptionId);
        periodEnd = subscription.currentPeriodEnd;
        // Estimate period start (1 month or 1 year before end)
        if (periodEnd) {
          periodStart = new Date(periodEnd);
          if (isYearly) {
            periodStart.setFullYear(periodStart.getFullYear() - 1);
          } else {
            periodStart.setMonth(periodStart.getMonth() - 1);
          }
        }
      } catch (subError) {
        // Fall back to using org.subscriptionExpiresAt
        console.log("Could not fetch subscription details, using org data:", subError);
        if (org.subscriptionExpiresAt) {
          periodEnd = new Date(org.subscriptionExpiresAt);
          periodStart = new Date(periodEnd);
          if (isYearly) {
            periodStart.setFullYear(periodStart.getFullYear() - 1);
          } else {
            periodStart.setMonth(periodStart.getMonth() - 1);
          }
        }
      }
      
      if (periodEnd && periodStart) {
        const now = new Date();
        const totalPeriodMs = periodEnd.getTime() - periodStart.getTime();
        const remainingPeriodMs = periodEnd.getTime() - now.getTime();
        
        if (totalPeriodMs > 0 && remainingPeriodMs > 0) {
          const prorationRatio = remainingPeriodMs / totalPeriodMs;
          
          // Prorated amount = (seat difference) * (price per seat) * (time remaining / total period)
          proratedCharge = Math.round(seatDifference * pricePerSeatCents * prorationRatio);
        }
      }
    }

    // Calculate next billing amount
    const nextBillingAmount = newSeatCount * pricePerSeatCents;

    return c.json({
      currentSeats: currentSeatCount,
      newSeats: newSeatCount,
      proratedCharge,
      nextBillingAmount,
      effectiveNow: true,
    });
  }
});

// ==================== SEAT ASSIGNMENT ====================

// Assign a seat to a member
organizationRoutes.post("/:orgId/seats/:userId/assign", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can assign seats" }, 403);
  }

  // Check if org has a subscription
  const org = membership.organization;
  if (!org.subscriptionTier || org.subscriptionStatus !== "ACTIVE") {
    return c.json({ error: "Organization has no active subscription" }, 400);
  }

  // Check seat availability
  const seats = await getAvailableSeats(orgId);
  if (seats.available <= 0) {
    return c.json({
      error: "No seats available. Purchase more seats to assign.",
      seats,
    }, 400);
  }

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    include: { user: true },
  });

  if (!targetMember) {
    return c.json({ error: "User is not a member of this organization" }, 404);
  }

  if (targetMember.hasSeat) {
    return c.json({ error: "User already has a seat assigned" }, 400);
  }

  // Assign seat
  await prisma.organizationMember.update({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    data: { hasSeat: true },
  });

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "org.member.updated",
    target: targetUserId,
    metadata: { action: "seat_assigned", userLogin: targetMember.user.login },
    c,
  });

  return c.json({
    success: true,
    message: `Seat assigned to ${targetMember.user.login}`,
  });
});

// Unassign a seat from a member
organizationRoutes.post("/:orgId/seats/:userId/unassign", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can unassign seats" }, 403);
  }

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    include: { user: true },
  });

  if (!targetMember) {
    return c.json({ error: "User is not a member of this organization" }, 404);
  }

  if (!targetMember.hasSeat) {
    return c.json({ error: "User does not have a seat assigned" }, 400);
  }

  // Unassign seat
  await prisma.organizationMember.update({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    data: { hasSeat: false },
  });

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "org.member.updated",
    target: targetUserId,
    metadata: { action: "seat_unassigned", userLogin: targetMember.user.login },
    c,
  });

  return c.json({
    success: true,
    message: `Seat unassigned from ${targetMember.user.login}`,
  });
});

// Reassign a seat from one member to another
organizationRoutes.post("/:orgId/seats/:userId/reassign", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const currentUser = await getUserFromToken(token);
  const orgId = c.req.param("orgId");
  const sourceUserId = c.req.param("userId");

  if (!currentUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageMembers(membership.role)) {
    return c.json({ error: "Only owners and admins can reassign seats" }, 403);
  }

  const body = await c.req.json<{ targetUserId: string }>();
  const { targetUserId } = body;

  if (!targetUserId) {
    return c.json({ error: "targetUserId is required" }, 400);
  }

  if (sourceUserId === targetUserId) {
    return c.json({ error: "Cannot reassign seat to the same user" }, 400);
  }

  // Get source member
  const sourceMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: sourceUserId },
    },
    include: { user: true },
  });

  if (!sourceMember) {
    return c.json({ error: "Source user is not a member of this organization" }, 404);
  }

  if (!sourceMember.hasSeat) {
    return c.json({ error: "Source user does not have a seat" }, 400);
  }

  // Get target member
  const targetMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: targetUserId },
    },
    include: { user: true },
  });

  if (!targetMember) {
    return c.json({ error: "Target user is not a member of this organization" }, 404);
  }

  if (targetMember.hasSeat) {
    return c.json({ error: "Target user already has a seat" }, 400);
  }

  // Reassign seat
  await prisma.$transaction([
    prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: orgId, userId: sourceUserId },
      },
      data: { hasSeat: false },
    }),
    prisma.organizationMember.update({
      where: {
        organizationId_userId: { organizationId: orgId, userId: targetUserId },
      },
      data: { hasSeat: true },
    }),
  ]);

  await logAudit({
    organizationId: orgId,
    userId: currentUser.id,
    action: "seat.reassigned",
    target: targetUserId,
    metadata: {
      fromUserId: sourceUserId,
      fromUserLogin: sourceMember.user.login,
      toUserId: targetUserId,
      toUserLogin: targetMember.user.login,
    },
    c,
  });

  return c.json({
    success: true,
    message: `Seat reassigned from ${sourceMember.user.login} to ${targetMember.user.login}`,
  });
});

// ==================== AUDIT LOGS ====================

// Get audit logs for organization (OWNER and ADMIN only)
organizationRoutes.get("/:orgId/audit-logs", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership and permissions (only OWNER and ADMIN)
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
  });

  if (!membership || !canManageMembers(membership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  // Parse query params
  const page = parseInt(c.req.query("page") || "1");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100);
  const search = c.req.query("search") || "";
  const action = c.req.query("action") || "";

  const skip = (page - 1) * limit;

  // Build where clause
  const where: {
    organizationId: string;
    action?: { contains: string; mode: "insensitive" };
    OR?: Array<{
      action?: { contains: string; mode: "insensitive" };
      target?: { contains: string; mode: "insensitive" };
      user?: { OR: Array<{ login: { contains: string; mode: "insensitive" } } | { name: { contains: string; mode: "insensitive" } }> };
    }>;
  } = { organizationId: orgId };

  if (action) {
    where.action = { contains: action, mode: "insensitive" };
  }

  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { target: { contains: search, mode: "insensitive" } },
      { user: { OR: [
        { login: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ] } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            login: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return c.json({
    logs: logs.map((log) => ({
      id: log.id,
      action: log.action,
      target: log.target,
      metadata: log.metadata,
      user: log.user ? {
        id: log.user.id,
        login: log.user.login,
        name: log.user.name,
        avatarUrl: log.user.avatarUrl,
      } : null,
      ipAddress: log.ipAddress,
      createdAt: log.createdAt,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// ==================== INVITES ====================

// List pending invites
organizationRoutes.get("/:orgId/invites", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
  });

  if (!membership || !canManageMembers(membership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const invites = await prisma.organizationInvite.findMany({
    where: {
      organizationId: orgId,
      status: "PENDING",
    },
    include: {
      invitedBy: {
        select: { login: true, name: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json(
    invites.map((inv) => ({
      id: inv.id,
      email: inv.email,
      token: inv.token,
      role: inv.role,
      invitedBy: inv.invitedBy.name || inv.invitedBy.login,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }))
  );
});

// Create invite
organizationRoutes.post("/:orgId/invites", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    include: { organization: true },
  });

  if (!membership || !canManageMembers(membership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const body = await c.req.json();
  const { email, role = "MEMBER" } = body;

  if (!["ADMIN", "MEMBER"].includes(role)) {
    return c.json({ error: "Invalid role. Can only invite as ADMIN or MEMBER" }, 400);
  }

  // If email provided, check if user is already a member
  if (email) {
    const existingUser = await prisma.user.findFirst({
      where: { email },
    });

    if (existingUser) {
      const existingMember = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: { organizationId: orgId, userId: existingUser.id },
        },
      });

      if (existingMember) {
        return c.json({ error: "User is already a member of this organization" }, 400);
      }
    }

    // Check for existing pending invite
    const existingInvite = await prisma.organizationInvite.findFirst({
      where: {
        organizationId: orgId,
        email,
        status: "PENDING",
      },
    });

    if (existingInvite) {
      return c.json({ error: "An invite has already been sent to this email" }, 400);
    }
  }

  // Create invite (expires in 7 days)
  const invite = await prisma.organizationInvite.create({
    data: {
      organizationId: orgId,
      email: email || null,
      role: role as OrganizationRole,
      invitedById: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "org.invite.created",
    target: email || invite.token,
    metadata: { role },
    c,
  });

  // Send email if email is provided
  let emailSent = false;
  if (email) {
    const emailResult = await sendInviteEmail({
      to: email,
      inviterName: user.name || user.login,
      orgName: membership.organization.name,
      token: invite.token,
      role,
    });
    emailSent = emailResult.success;
    if (!emailResult.success) {
      console.error("Failed to send invite email:", emailResult.error);
    }
  }

  return c.json({
    id: invite.id,
    token: invite.token,
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt,
    inviteUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/invite/${invite.token}`,
    emailSent,
  }, 201);
});

// Revoke invite
organizationRoutes.delete("/:orgId/invites/:inviteId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const orgId = c.req.param("orgId");
  const inviteId = c.req.param("inviteId");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Check membership
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
  });

  if (!membership || !canManageMembers(membership.role)) {
    return c.json({ error: "Insufficient permissions" }, 403);
  }

  const invite = await prisma.organizationInvite.findFirst({
    where: {
      id: inviteId,
      organizationId: orgId,
      status: "PENDING",
    },
  });

  if (!invite) {
    return c.json({ error: "Invite not found" }, 404);
  }

  await prisma.organizationInvite.update({
    where: { id: inviteId },
    data: { status: "REVOKED" },
  });

  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "org.invite.revoked",
    target: invite.email || invite.token,
    c,
  });

  return c.json({ success: true });
});

// ==================== PUBLIC INVITE ENDPOINTS ====================

// Get invite details (public - for invite accept page)
organizationRoutes.get("/invites/:token", async (c) => {
  const inviteToken = c.req.param("token");

  const invite = await prisma.organizationInvite.findUnique({
    where: { token: inviteToken },
    include: {
      organization: {
        select: { name: true, slug: true, avatarUrl: true },
      },
      invitedBy: {
        select: { login: true, name: true },
      },
    },
  });

  if (!invite) {
    return c.json({ error: "Invite not found" }, 404);
  }

  if (invite.status !== "PENDING") {
    return c.json({ error: "Invite is no longer valid", status: invite.status }, 400);
  }

  if (new Date() > invite.expiresAt) {
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    return c.json({ error: "Invite has expired" }, 400);
  }

  return c.json({
    organizationName: invite.organization.name,
    organizationSlug: invite.organization.slug,
    organizationAvatar: invite.organization.avatarUrl,
    role: invite.role,
    invitedBy: invite.invitedBy.name || invite.invitedBy.login,
    expiresAt: invite.expiresAt,
  });
});

// Accept invite
organizationRoutes.post("/invites/:token/accept", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized. Please log in first." }, 401);
  }

  const token = authHeader.slice(7);
  const user = await getUserFromToken(token);
  const inviteToken = c.req.param("token");

  if (!user) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const invite = await prisma.organizationInvite.findUnique({
    where: { token: inviteToken },
    include: { organization: true },
  });

  if (!invite) {
    return c.json({ error: "Invite not found" }, 404);
  }

  if (invite.status !== "PENDING") {
    return c.json({ error: "Invite is no longer valid" }, 400);
  }

  if (new Date() > invite.expiresAt) {
    await prisma.organizationInvite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" },
    });
    return c.json({ error: "Invite has expired" }, 400);
  }

  // Check if user is already a member
  const existingMember = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: invite.organizationId,
        userId: user.id,
      },
    },
  });

  if (existingMember) {
    return c.json({ error: "You are already a member of this organization" }, 400);
  }

  // Add user as member (no seat by default)
  await prisma.organizationMember.create({
    data: {
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
      hasSeat: false,
    },
  });

  // Mark invite as accepted
  await prisma.organizationInvite.update({
    where: { id: invite.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date(),
      acceptedById: user.id,
    },
  });

  await logAudit({
    organizationId: invite.organizationId,
    userId: user.id,
    action: "org.invite.accepted",
    target: invite.token,
    c,
  });

  return c.json({
    success: true,
    organization: {
      id: invite.organization.id,
      name: invite.organization.name,
      slug: invite.organization.slug,
    },
    role: invite.role,
  });
});

export { organizationRoutes };
