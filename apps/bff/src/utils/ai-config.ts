import { prisma } from "../db";

export type AiAuthMethod = "API_KEY";

export interface AiRuntimeConfig {
  authMethod: AiAuthMethod;
  model: string;
  credential: string;
  refreshToken?: string;
  accountId?: string;
}

export async function getOrgAiRuntimeConfig(orgId: string): Promise<AiRuntimeConfig | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      aiAuthMethod: true,
      aiModel: true,
      aiApiKey: true,
      anthropicApiKey: true,
      subscriptionTier: true,
      subscriptionStatus: true,
      grantedTokens: true,
    },
  });

  if (!org) {
    return null;
  }

  const hasActiveSubscription = org.subscriptionStatus === "ACTIVE";
  const hasOpenDiffPaidTier =
    (org.subscriptionTier === "PRO" || org.subscriptionTier === "ULTRA") && hasActiveSubscription;

  // Granted tokens run on OpenDiff's own AI too, with or without a plan
  if (hasOpenDiffPaidTier || Number(org.grantedTokens) > 0) {
    return null;
  }

  if (org.subscriptionTier !== "SELF_SUFFICIENT" || !hasActiveSubscription) {
    throw new Error("Organization does not have an active paid AI plan");
  }

  const authMethod = org.aiAuthMethod as AiAuthMethod | null;
  if (authMethod === "API_KEY") {
    const credential = org.aiApiKey || org.anthropicApiKey;
    if (!credential || !org.aiModel) {
      throw new Error("No BYOK API key configured for Self-sufficient organization");
    }
    return {
      authMethod,
      model: org.aiModel,
      credential,
    };
  }

  if (org.anthropicApiKey) {
    return {
      authMethod: "API_KEY",
      model: "anthropic/claude-sonnet-4-5",
      credential: org.anthropicApiKey,
    };
  }

  throw new Error("No BYOK API key configured for Self-sufficient organization");
}
