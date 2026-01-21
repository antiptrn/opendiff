import { Polar } from "@polar-sh/sdk";

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
});

// Product ID to Tier mapping
export const PRODUCT_ID_TO_TIER: Record<string, "CODE_REVIEW" | "TRIAGE" | "BYOK"> = {
  [process.env.POLAR_CODE_REVIEW_MONTHLY_PRODUCT_ID ?? ""]: "CODE_REVIEW",
  [process.env.POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID ?? ""]: "CODE_REVIEW",
  [process.env.POLAR_TRIAGE_MONTHLY_PRODUCT_ID ?? ""]: "TRIAGE",
  [process.env.POLAR_TRIAGE_YEARLY_PRODUCT_ID ?? ""]: "TRIAGE",
  [process.env.POLAR_BYOK_MONTHLY_PRODUCT_ID ?? ""]: "BYOK",
  [process.env.POLAR_BYOK_YEARLY_PRODUCT_ID ?? ""]: "BYOK",
};

export const TIER_HIERARCHY: Record<string, number> = {
  FREE: 0,
  BYOK: 1,      // BYOK is cheaper but requires own API key
  CODE_REVIEW: 2,
  TRIAGE: 3,
};

// Monthly review quota per tier (-1 = unlimited)
export const TIER_MONTHLY_REVIEW_QUOTA: Record<string, number> = {
  FREE: 0,
  BYOK: -1,     // Unlimited (user pays Anthropic directly)
  CODE_REVIEW: 100,
  TRIAGE: 250,
};

export function isYearlyProduct(productId: string | null | undefined): boolean {
  if (!productId) return false;
  return (
    productId === process.env.POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_TRIAGE_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_BYOK_YEARLY_PRODUCT_ID
  );
}

export function getReviewQuota(tier: string, productId?: string | null): number {
  const monthlyQuota = TIER_MONTHLY_REVIEW_QUOTA[tier] ?? 0;
  // Unlimited quota
  if (monthlyQuota === -1) return -1;
  // Yearly plans get 12x the monthly quota
  if (isYearlyProduct(productId)) {
    return monthlyQuota * 12;
  }
  return monthlyQuota;
}

export function getTierFromProductId(productId: string): "CODE_REVIEW" | "TRIAGE" | "BYOK" | "FREE" {
  return PRODUCT_ID_TO_TIER[productId] ?? "FREE";
}
