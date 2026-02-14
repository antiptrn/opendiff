// BYOK API key types
export interface ApiKeyStatus {
  hasKey: boolean;
  maskedKey: string | null;
  tier: string;
}

// Custom review rules types
export interface ReviewRulesStatus {
  rules: string;
}
