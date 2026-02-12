/** Audit log routes: paginated retrieval of organization audit events. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import { canManageMembers } from "../../middleware/organization";

const auditRoutes = new Hono();

// Get audit logs for organization (OWNER and ADMIN only)
auditRoutes.get("/audit-logs", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

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
  const page = Number.parseInt(c.req.query("page") || "1");
  const limit = Math.min(Number.parseInt(c.req.query("limit") || "50"), 100);
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
      user?: {
        OR: Array<
          | { login: { contains: string; mode: "insensitive" } }
          | { name: { contains: string; mode: "insensitive" } }
        >;
      };
    }>;
  } = { organizationId: orgId };

  if (action) {
    where.action = { contains: action, mode: "insensitive" };
  }

  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { target: { contains: search, mode: "insensitive" } },
      {
        user: {
          OR: [
            { login: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        },
      },
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
      user: log.user
        ? {
            id: log.user.id,
            login: log.user.login,
            name: log.user.name,
            avatarUrl: log.user.avatarUrl,
          }
        : null,
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

export { auditRoutes };
