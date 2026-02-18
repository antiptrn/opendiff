import { prisma } from "../db";

export type AiAuthMethod = "API_KEY" | "OAUTH_TOKEN";

export interface AiRuntimeConfig {
  authMethod: AiAuthMethod;
  model: string;
  credential: string;
}

export async function getOrgAiRuntimeConfig(orgId: string): Promise<AiRuntimeConfig | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      aiAuthMethod: true,
      aiModel: true,
      aiApiKey: true,
      aiOauthToken: true,
      anthropicApiKey: true,
    },
  });

  if (!org) {
    return null;
  }

  const authMethod = org.aiAuthMethod as AiAuthMethod | null;
  if (authMethod === "OAUTH_TOKEN") {
    if (!org.aiOauthToken || !org.aiModel) {
      return null;
    }
    return {
      authMethod,
      model: org.aiModel,
      credential: org.aiOauthToken,
    };
  }

  if (authMethod === "API_KEY") {
    const credential = org.aiApiKey || org.anthropicApiKey;
    if (!credential || !org.aiModel) {
      return null;
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

  return null;
}
