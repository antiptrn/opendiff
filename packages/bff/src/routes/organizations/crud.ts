/** Organization CRUD operations: list, create, get, update, delete, and avatar management. */
import { Hono } from "hono";
import { logAudit } from "../../services/audit";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import {
  canDeleteOrg,
  canUpdateOrg,
  getAvailableSeats,
  getOrgQuotaPool,
  getUserOrganizations,
} from "../../middleware/organization";
import { deleteFile, getKeyFromUrl, isStorageConfigured, uploadFile } from "../../services/storage";

/** Convert a text string into a URL-friendly slug. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const crudRoutes = new Hono();

// List user's organizations
crudRoutes.get("/", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  const organizations = await getUserOrganizations(user.id);
  return c.json(organizations);
});

// Create organization
crudRoutes.post("/", requireAuth(), async (c) => {
  const user = getAuthUser(c);

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

  return c.json(
    {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: "OWNER",
    },
    201
  );
});

// Get organization details
crudRoutes.get("/:orgId", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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

  const [quotaPool, seats] = await Promise.all([
    getOrgQuotaPool(orgId),
    getAvailableSeats(orgId),
  ]);

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
    subscription: org.subscriptionTier
      ? {
          tier: org.subscriptionTier,
          status: org.subscriptionStatus,
          seatCount: org.seatCount,
          expiresAt: org.subscriptionExpiresAt,
          cancelAtPeriodEnd: org.cancelAtPeriodEnd,
        }
      : null,
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
    // Business info
    isRegisteredBusiness: org.isRegisteredBusiness,
    businessName: org.businessName,
    taxVatId: org.taxVatId,
  });
});

// Update organization
crudRoutes.put("/:orgId", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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
  const { name, slug: newSlug, isRegisteredBusiness, businessName, taxVatId } = body;

  const updateData: {
    name?: string;
    slug?: string;
    isRegisteredBusiness?: boolean;
    businessName?: string | null;
    taxVatId?: string | null;
  } = {};

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

  // Business info fields (owner only)
  if (membership.role === "OWNER") {
    if (typeof isRegisteredBusiness === "boolean") {
      updateData.isRegisteredBusiness = isRegisteredBusiness;
      // Clear business fields if not a registered business
      if (!isRegisteredBusiness) {
        updateData.businessName = null;
        updateData.taxVatId = null;
      }
    }
    if (typeof businessName === "string") {
      updateData.businessName = businessName.trim() || null;
    }
    if (typeof taxVatId === "string") {
      updateData.taxVatId = taxVatId.trim() || null;
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
crudRoutes.delete("/:orgId", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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
crudRoutes.post("/:orgId/avatar", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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
crudRoutes.delete("/:orgId/avatar", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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

export { crudRoutes };
