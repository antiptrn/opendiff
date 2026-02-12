import { Hono } from "hono";
import { logAudit } from "../services/audit";
import { getOrgIdFromHeader } from "../auth";
import { prisma } from "../db";
import { getAuthUser, requireAuth, requireOrgAccess } from "../middleware/auth";
import { canManageBilling } from "../middleware/organization";

const settingsRoutes = new Hono();

settingsRoutes.use(requireAuth());

// ==================== BYOK API KEY ENDPOINTS ====================

// Get API key status (never returns the actual key)
settingsRoutes.get("/api-key", async (c) => {
  const user = getAuthUser(c);

  const orgId = getOrgIdFromHeader(c);
  if (!orgId) {
    return c.json({ error: "Organization ID is required" }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { members: true },
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  if (!org.members.some((m) => m.userId === user.id)) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  // Only return whether a key is set and a masked version
  const hasKey = !!org.anthropicApiKey;
  const maskedKey = hasKey ? `sk-ant-...${org.anthropicApiKey?.slice(-4)}` : null;

  return c.json({
    hasKey,
    maskedKey,
    tier: org.subscriptionTier,
  });
});

// Set API key (BYOK organizations only — owners only)
settingsRoutes.put("/api-key", async (c) => {
  const user = getAuthUser(c);

  const orgId = getOrgIdFromHeader(c);
  if (!orgId) {
    return c.json({ error: "Organization ID is required" }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { members: true },
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const membership = org.members.find((m) => m.userId === user.id);
  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage API keys" }, 403);
  }

  if (org.subscriptionTier !== "SELF_SUFFICIENT") {
    return c.json({ error: "API key is only available for Self-sufficient plan" }, 403);
  }

  const body = await c.req.json();
  const { apiKey } = body;

  if (!apiKey || typeof apiKey !== "string") {
    return c.json({ error: "API key is required" }, 400);
  }

  // Basic validation for Anthropic API key format
  if (!apiKey.startsWith("sk-ant-")) {
    return c.json({ error: "Invalid Anthropic API key format" }, 400);
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { anthropicApiKey: apiKey },
  });

  await logAudit({
    organizationId: org.id,
    userId: user.id,
    action: "api_key.updated",
    c,
  });

  return c.json({
    success: true,
    maskedKey: `sk-ant-...${apiKey.slice(-4)}`,
  });
});

// Delete API key (owners only)
settingsRoutes.delete("/api-key", async (c) => {
  const user = getAuthUser(c);

  const orgId = getOrgIdFromHeader(c);
  if (!orgId) {
    return c.json({ error: "Organization ID is required" }, 400);
  }

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: { members: true },
  });

  if (!org) {
    return c.json({ error: "Organization not found" }, 404);
  }

  const membership = org.members.find((m) => m.userId === user.id);
  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage API keys" }, 403);
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { anthropicApiKey: null },
  });

  await logAudit({
    organizationId: org.id,
    userId: user.id,
    action: "api_key.deleted",
    c,
  });

  return c.json({ success: true });
});

// ==================== CUSTOM REVIEW RULES ENDPOINTS ====================

// Get custom review rules
settingsRoutes.get("/review-rules", async (c) => {
  const user = getAuthUser(c);

  return c.json({
    rules: user.customReviewRules || "",
  });
});

// Update custom review rules
settingsRoutes.put("/review-rules", async (c) => {
  const user = getAuthUser(c);

  const body = await c.req.json();
  const { rules } = body;

  if (typeof rules !== "string") {
    return c.json({ error: "Rules must be a string" }, 400);
  }

  // Limit rules to 5000 characters
  if (rules.length > 5000) {
    return c.json({ error: "Rules must be 5000 characters or less" }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { customReviewRules: rules || null },
  });

  await logAudit({
    organizationId: (await requireOrgAccess(c)) ?? undefined,
    userId: user.id,
    action: "review_rules.updated",
    metadata: { rulesLength: rules.length },
    c,
  });

  return c.json({ success: true, rules });
});

export { settingsRoutes };
