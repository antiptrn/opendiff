import { Hono } from "hono";
import { getOrgIdFromHeader } from "../auth";
import { prisma } from "../db";
import { getAuthUser, requireAuth, requireOrgAccess } from "../middleware/auth";
import { canManageBilling } from "../middleware/organization";
import { logAudit } from "../services/audit";
import { getSupportedProviderModels } from "../utils/opencode-models";

const settingsRoutes = new Hono();

settingsRoutes.use(requireAuth());

// ==================== BYOK AI CONFIG ENDPOINTS ====================

type AiAuthMethod = "API_KEY" | "OAUTH_TOKEN";
type AiProvider = "anthropic" | "openai";

const DEFAULT_PROVIDER: AiProvider = "openai";
const DEFAULT_AUTH_METHOD: AiAuthMethod = "OAUTH_TOKEN";
const DEFAULT_MODEL = "openai/gpt-5.2-codex";

function requiresOAuth(model: string): boolean {
  return model.startsWith("openai/gpt-5.3-codex");
}

function providerFromModel(model: string | null | undefined): AiProvider {
  if (model?.startsWith("openai/")) {
    return "openai";
  }
  return "anthropic";
}

function maskCredential(method: AiAuthMethod | null, value: string | null): string | null {
  if (!method || !value) {
    return null;
  }

  if (method === "API_KEY") {
    if (value.startsWith("sk-ant-")) {
      return `sk-ant-...${value.slice(-4)}`;
    }
    if (value.startsWith("sk-")) {
      return `sk-...${value.slice(-4)}`;
    }
    return `...${value.slice(-4)}`;
  }

  return `oauth-...${value.slice(-4)}`;
}

// Get AI config status (never returns the actual credential)
settingsRoutes.get("/ai-config", async (c) => {
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

  const authMethod =
    (org.aiAuthMethod as AiAuthMethod | null) ?? (org.anthropicApiKey ? "API_KEY" : null);
  const storedCredential =
    authMethod === "OAUTH_TOKEN"
      ? org.aiOauthToken
      : authMethod === "API_KEY"
        ? org.aiApiKey || org.anthropicApiKey
        : null;

  const hasCredential = !!storedCredential;
  const maskedCredential = maskCredential(authMethod, storedCredential);

  return c.json({
    hasCredential,
    authMethod: authMethod || DEFAULT_AUTH_METHOD,
    provider: org.aiModel ? providerFromModel(org.aiModel) : DEFAULT_PROVIDER,
    model: org.aiModel || DEFAULT_MODEL,
    maskedCredential,
    tier: org.subscriptionTier,
    hasRefreshToken: !!org.aiOauthRefreshToken,
    hasAccountId: !!org.aiOauthAccountId,
  });
});

settingsRoutes.get("/ai-models", async (c) => {
  const provider = (c.req.query("provider") || "") as AiProvider | "";
  const modelsByProvider = await getSupportedProviderModels();

  if (provider === "anthropic" || provider === "openai") {
    return c.json({
      provider,
      models: modelsByProvider[provider],
    });
  }

  return c.json({
    providers: ["anthropic", "openai"],
    modelsByProvider,
  });
});

// Set AI config (BYOK organizations only — owners only)
settingsRoutes.put("/ai-config", async (c) => {
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
  const { provider, authMethod, model, credential, refreshToken, accountId } = body as {
    provider?: AiProvider;
    authMethod?: AiAuthMethod;
    model?: string;
    credential?: string;
    refreshToken?: string;
    accountId?: string;
  };

  if (!provider || (provider !== "anthropic" && provider !== "openai")) {
    return c.json({ error: "provider must be anthropic or openai" }, 400);
  }

  if (!authMethod || (authMethod !== "API_KEY" && authMethod !== "OAUTH_TOKEN")) {
    return c.json({ error: "authMethod must be API_KEY or OAUTH_TOKEN" }, 400);
  }

  if (!model || !model.startsWith(`${provider}/`)) {
    return c.json({ error: "Invalid model selection" }, 400);
  }

  const supportedModels = await getSupportedProviderModels();
  if (!supportedModels[provider].some((m) => m.id === model)) {
    return c.json({ error: "Selected model is not supported" }, 400);
  }

  if (!credential || typeof credential !== "string") {
    return c.json({ error: "Credential is required" }, 400);
  }

  if (authMethod === "API_KEY" && requiresOAuth(model)) {
    return c.json({ error: "Codex 5.3 requires OAuth token authentication" }, 400);
  }

  if (authMethod === "API_KEY") {
    if (provider === "anthropic" && !credential.startsWith("sk-ant-")) {
      return c.json({ error: "Invalid Anthropic API key format" }, 400);
    }

    if (provider === "openai" && !credential.startsWith("sk-")) {
      return c.json({ error: "Invalid OpenAI API key format" }, 400);
    }
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: {
      aiAuthMethod: authMethod,
      aiModel: model,
      aiApiKey: authMethod === "API_KEY" ? credential : null,
      aiOauthToken: authMethod === "OAUTH_TOKEN" ? credential : null,
      aiOauthRefreshToken: authMethod === "OAUTH_TOKEN" ? (refreshToken || null) : null,
      aiOauthAccountId: authMethod === "OAUTH_TOKEN" ? (accountId || null) : null,
      anthropicApiKey:
        authMethod === "API_KEY" && model.startsWith("anthropic/") ? credential : null,
    },
  });

  await logAudit({
    organizationId: org.id,
    userId: user.id,
    action: "api_key.updated",
    metadata: { provider, authMethod, model },
    c,
  });

  return c.json({
    success: true,
    provider,
    authMethod,
    model,
    maskedCredential: maskCredential(authMethod, credential),
  });
});

// Delete AI config (owners only)
settingsRoutes.delete("/ai-config", async (c) => {
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
    data: {
      aiAuthMethod: null,
      aiModel: null,
      aiApiKey: null,
      aiOauthToken: null,
      aiOauthRefreshToken: null,
      aiOauthAccountId: null,
      anthropicApiKey: null,
    },
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
