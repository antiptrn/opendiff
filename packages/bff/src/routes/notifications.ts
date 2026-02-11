import { Hono } from "hono";
import { requireAuth, requireOrgAccess } from "../middleware/auth";
import { prisma } from "../db";

const notificationRoutes = new Hono();

notificationRoutes.use(requireAuth());

// Get paginated notifications for org
notificationRoutes.get("/notifications", async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  const page = Math.max(1, Number.parseInt(c.req.query("page") || "1"));
  const limit = Math.min(50, Math.max(1, Number.parseInt(c.req.query("limit") || "20")));

  const where = { organizationId: orgId };

  const [notifications, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { ...where, readAt: null } }),
  ]);

  return c.json({
    notifications,
    unreadCount,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Mark all notifications as read for org
notificationRoutes.post("/notifications/read-all", async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  await prisma.notification.updateMany({
    where: { organizationId: orgId, readAt: null },
    data: { readAt: new Date() },
  });

  return c.json({ success: true });
});

// Mark single notification as read
notificationRoutes.post("/notifications/:id/read", async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  const { id } = c.req.param();

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification || notification.organizationId !== orgId) {
    return c.json({ error: "Notification not found" }, 404);
  }

  await prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  });

  return c.json({ success: true });
});

export { notificationRoutes };
