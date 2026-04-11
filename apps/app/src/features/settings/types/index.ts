export type AiAuthMethod = "API_KEY" | "OAUTH_TOKEN";
export type AiProvider = "anthropic" | "openai";

export interface AiModelOption {
  id: string;
  name: string;
}

// BYOK AI config types
export interface AiConfigStatus {
  hasCredential: boolean;
  provider: AiProvider;
  authMethod: AiAuthMethod | null;
  model: string;
  maskedCredential: string | null;
  tier: string;
  hasRefreshToken: boolean;
  hasAccountId: boolean;
}

// Custom review rules types
export interface ReviewRulesStatus {
  rules: string;
}
