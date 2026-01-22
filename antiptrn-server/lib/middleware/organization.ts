import type { Context, Next } from "hono";
import { PrismaClient, OrganizationRole } from "@prisma/client";
import type { Organization, OrganizationMember } from "@prisma/client";

const prisma = new PrismaClient();

// Extend Hono's context to include our custom properties
declare module "hono" {
  interface ContextVariableMap {
    user: { id: string; githubId: number; login: string } | null;
    organization: Organization | null;
    membership: OrganizationMember | null;
  }
}

type RoleRequirement = OrganizationRole | OrganizationRole[];

/**
 * Middleware to verify organization membership and optionally check role
 */
export function requireOrgMembership(roles?: RoleRequirement) {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    const orgId = c.req.param("orgId");

    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!orgId) {
      return c.json({ error: "Organization ID required" }, 400);
    }

    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return c.json({ error: "Not a member of this organization" }, 403);
    }

    // Check role if specified
    if (roles) {
      const allowedRoles = Array.isArray(roles) ? roles : [roles];
      if (!allowedRoles.includes(membership.role)) {
        return c.json({ error: "Insufficient permissions" }, 403);
      }
    }

    // Attach org and membership to context
    c.set("organization", membership.organization);
    c.set("membership", membership);

    await next();
  };
}

/**
 * Check if a role can manage members (invite, update roles, remove)
 */
export function canManageMembers(role: OrganizationRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Check if a role can manage billing
 */
export function canManageBilling(role: OrganizationRole): boolean {
  return role === "OWNER";
}

/**
 * Check if a role can manage repositories
 */
export function canManageRepos(role: OrganizationRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Check if a role can delete the organization
 */
export function canDeleteOrg(role: OrganizationRole): boolean {
  return role === "OWNER";
}

/**
 * Check if a role can update organization settings
 */
export function canUpdateOrg(role: OrganizationRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

/**
 * Validate that adding a member won't exceed seat limit
 */
export async function validateSeatAvailability(orgId: string): Promise<{
  available: boolean;
  used: number;
  total: number;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { _count: { select: { members: true } } },
  });

  if (!org) {
    return { available: false, used: 0, total: 0 };
  }

  return {
    available: org._count.members < org.seatCount,
    used: org._count.members,
    total: org.seatCount,
  };
}

/**
 * Get user's membership in an organization
 */
export async function getUserMembership(userId: string, orgId: string) {
  return prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: {
        organizationId: orgId,
        userId: userId,
      },
    },
    include: { organization: true },
  });
}

/**
 * Get all organizations a user belongs to
 */
export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          avatarUrl: true,
          subscriptionTier: true,
          subscriptionStatus: true,
        },
      },
    },
  });

  return memberships.map((m) => ({
    ...m.organization,
    role: m.role,
  }));
}
