import { Hono } from "hono";
import { PrismaClient, OrganizationRole } from "@prisma/client";
import { logAudit } from "../audit";
import { sendInviteEmail } from "../email";
import {
  canManageMembers,
  canManageBilling,
  canDeleteOrg,
  canUpdateOrg,
  validateSeatAvailability,
  getUserOrganizations,
} from "../middleware/organization";

const prisma = new PrismaClient();

// Helper to get user from DB by GitHub token
async function getUserFromToken(token: string) {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) return null;
  const githubUser = await userResponse.json();

  return prisma.user.findUnique({
    where: { githubId: githubUser.id },
  });
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
  const { name } = body;

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
      seatCount: 1,
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
  const membership = await prisma.organizationMember.findUnique({
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

  return c.json({
    id: org.id,
    name: org.name,
    slug: org.slug,
    avatarUrl: org.avatarUrl,
    subscriptionTier: org.subscriptionTier,
    subscriptionStatus: org.subscriptionStatus,
    seatCount: org.seatCount,
    membersCount: org._count.members,
    role: membership.role,
    createdAt: org.createdAt,
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

  return c.json(
    members.map((m) => ({
      userId: m.user.id,
      login: m.user.login,
      name: m.user.name,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.createdAt,
    }))
  );
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

  // Check seat availability
  const seats = await validateSeatAvailability(orgId);
  if (!seats.available) {
    return c.json({
      error: "No seats available. Upgrade your subscription to add more members.",
      seatsUsed: seats.used,
      seatsTotal: seats.total,
    }, 403);
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

  // Check seat availability
  const seats = await validateSeatAvailability(invite.organizationId);
  if (!seats.available) {
    return c.json({ error: "No seats available in this organization" }, 403);
  }

  // Add user as member
  await prisma.organizationMember.create({
    data: {
      organizationId: invite.organizationId,
      userId: user.id,
      role: invite.role,
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
