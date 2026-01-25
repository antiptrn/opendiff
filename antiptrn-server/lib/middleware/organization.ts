import type { Context, Next } from "hono";
import { PrismaClient, OrganizationRole } from "@prisma/client";
import type { Organization, OrganizationMember } from "@prisma/client";
import { getOrgReviewQuota } from "../polar";

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
 * Check if a member has a seat assigned and org has active subscription
 */
export function hasSeat(membership: OrganizationMember, org: Organization): boolean {
  return (
    membership.hasSeat &&
    org.subscriptionStatus === "ACTIVE" &&
    org.subscriptionTier !== null
  );
}

/**
 * Check if a member can use reviews (has seat with review capability)
 */
export function canUseReviews(membership: OrganizationMember, org: Organization): boolean {
  if (!hasSeat(membership, org)) return false;
  const tier = org.subscriptionTier;
  return tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
}

/**
 * Check if a member can use triage mode
 */
export function canUseTriage(membership: OrganizationMember, org: Organization): boolean {
  if (!hasSeat(membership, org)) return false;
  const tier = org.subscriptionTier;
  return tier === "TRIAGE" || tier === "BYOK";
}

/**
 * Get count of assigned seats in an organization
 */
export async function getAssignedSeatCount(orgId: string): Promise<number> {
  return prisma.organizationMember.count({
    where: {
      organizationId: orgId,
      hasSeat: true,
    },
  });
}

/**
 * Calculate the quota pool for an organization based on tier and seat count
 */
export async function getOrgQuotaPool(orgId: string): Promise<{
  total: number;
  used: number;
  hasUnlimited: boolean;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org || !org.subscriptionTier || org.subscriptionStatus !== "ACTIVE") {
    return { total: 0, used: 0, hasUnlimited: false };
  }

  const quota = getOrgReviewQuota(org.subscriptionTier, org.seatCount, org.productId);
  const hasUnlimited = quota === -1;

  return {
    total: hasUnlimited ? -1 : quota,
    used: org.reviewsUsedThisCycle,
    hasUnlimited,
  };
}

/**
 * Check if there are available seats to assign
 */
export async function getAvailableSeats(orgId: string): Promise<{
  available: number;
  assigned: number;
  total: number;
}> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    return { available: 0, assigned: 0, total: 0 };
  }

  const assignedCount = await getAssignedSeatCount(orgId);

  return {
    available: Math.max(0, org.seatCount - assignedCount),
    assigned: assignedCount,
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
 * Get all organizations a user belongs to (with subscription info)
 */
export async function getUserOrganizations(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId },
    include: {
      organization: true,
    },
  });

  return memberships.map((m) => ({
    id: m.organization.id,
    name: m.organization.name,
    slug: m.organization.slug,
    avatarUrl: m.organization.avatarUrl,
    role: m.role,
    hasSeat: m.hasSeat,
    isPersonal: m.organization.isPersonal,
    // Org-level subscription info
    subscription: m.organization.subscriptionTier ? {
      tier: m.organization.subscriptionTier,
      status: m.organization.subscriptionStatus,
      seatCount: m.organization.seatCount,
      expiresAt: m.organization.subscriptionExpiresAt,
      cancelAtPeriodEnd: m.organization.cancelAtPeriodEnd,
    } : null,
  }));
}
