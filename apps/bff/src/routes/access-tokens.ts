/** Personal access tokens: list, create and revoke the signed-in user's tokens for an organization. */
import { Hono } from "hono";
import { createAccessToken } from "../access-tokens";
import { prisma } from "../db";
import { getAuthUser, requireAuth, requireOrgAccess } from "../middleware/auth";
import { logAudit } from "../services/audit";

const accessTokenRoutes = new Hono();

const TOKEN_FIELDS = { id: true, name: true, tokenPrefix: true, createdAt: true, lastUsedAt: true };

accessTokenRoutes.get("/access-tokens", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) return c.json({ error: "Organization ID required" }, 400);
  const user = getAuthUser(c);

  const tokens = await prisma.accessToken.findMany({
    where: { userId: user.id, organizationId: orgId },
    orderBy: { createdAt: "desc" },
    select: TOKEN_FIELDS,
  });
  return c.json({ tokens });
});

accessTokenRoutes.post("/access-tokens", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) return c.json({ error: "Organization ID required" }, 400);
  const user = getAuthUser(c);

  const body = (await c.req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) return c.json({ error: "Give the token a name" }, 400);

  const { token, record } = await createAccessToken({
    userId: user.id,
    organizationId: orgId,
    name,
  });
  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "access_token.created",
    target: name,
  }).catch(() => {});

  // The raw token is returned this once and never stored
  return c.json({ token, accessToken: record }, 201);
});

accessTokenRoutes.delete("/access-tokens/:id", requireAuth(), async (c) => {
  const orgId = await requireOrgAccess(c);
  if (!orgId) return c.json({ error: "Organization ID required" }, 400);
  const user = getAuthUser(c);

  const deleted = await prisma.accessToken.deleteMany({
    where: { id: c.req.param("id"), userId: user.id, organizationId: orgId },
  });
  if (deleted.count === 0) return c.json({ error: "Token not found" }, 404);

  await logAudit({
    organizationId: orgId,
    userId: user.id,
    action: "access_token.revoked",
    target: c.req.param("id"),
  }).catch(() => {});
  return c.json({ revoked: true });
});

export { accessTokenRoutes };
