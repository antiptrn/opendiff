import { Polar } from "@polar-sh/sdk";

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
});

// Product ID to Tier mapping
export const PRODUCT_ID_TO_TIER: Record<string, "CODE_REVIEW" | "TRIAGE"> = {
  [process.env.POLAR_CODE_REVIEW_MONTHLY_PRODUCT_ID ?? ""]: "CODE_REVIEW",
  [process.env.POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID ?? ""]: "CODE_REVIEW",
  [process.env.POLAR_TRIAGE_MONTHLY_PRODUCT_ID ?? ""]: "TRIAGE",
  [process.env.POLAR_TRIAGE_YEARLY_PRODUCT_ID ?? ""]: "TRIAGE",
};

export const TIER_HIERARCHY: Record<string, number> = {
  FREE: 0,
  CODE_REVIEW: 1,
  TRIAGE: 2,
};

export function getTierFromProductId(productId: string): "CODE_REVIEW" | "TRIAGE" | "FREE" {
  return PRODUCT_ID_TO_TIER[productId] ?? "FREE";
}

export function isYearlyProduct(productId: string): boolean {
  return (
    productId === process.env.POLAR_PRO_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_TEAM_YEARLY_PRODUCT_ID
  );
}
