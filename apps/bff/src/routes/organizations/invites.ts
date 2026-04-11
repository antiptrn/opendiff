/** Organization invite routes: create, list, revoke invites and public accept/view endpoints. */
import { OrganizationRole } from "@prisma/client";
import { Hono } from "hono";
import { findDbUserFromToken } from "../../auth";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import { canManageMembers } from "../../middleware/organization";
import { logAudit } from "../../services/audit";
import { sendInviteEmail } from "../../services/email";

const inviteRoutes = new Hono();

// ==================== INVITES (scoped to /:orgId) ====================

// List pending invites
inviteRoutes.get("/invites", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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
inviteRoutes.post("/invites", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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

  return c.json(
    {
      id: invite.id,
      token: invite.token,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt,
      inviteUrl: `${process.env.FRONTEND_URL || "http://localhost:5173"}/invite/${invite.token}`,
      emailSent,
    },
    201
  );
});

// Revoke invite
inviteRoutes.delete("/invites/:inviteId", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");
  const inviteId = c.req.param("inviteId");

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

const publicInviteRoutes = new Hono();

// Get invite details (public - for invite accept page)
publicInviteRoutes.get("/:token", async (c) => {
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
    invitedEmail: invite.email,
  });
});

// Accept invite
publicInviteRoutes.post("/:token/accept", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized. Please log in first." }, 401);
  }

  const token = authHeader.slice(7);
  const user = await findDbUserFromToken(token);
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

export { inviteRoutes, publicInviteRoutes };
