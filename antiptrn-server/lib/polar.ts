import { Polar } from "@polar-sh/sdk";

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

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

// Monthly review quota per seat tier (-1 = unlimited)
export const TIER_MONTHLY_REVIEW_QUOTA: Record<string, number> = {
  FREE: 0,
  BYOK: -1,     // Unlimited (user pays Anthropic directly)
  CODE_REVIEW: 100,
  TRIAGE: 250,
};

// Seat pricing in cents
export const SEAT_PRICING = {
  BYOK: { monthly: 900, yearly: 9000 },
  CODE_REVIEW: { monthly: 1900, yearly: 19000 },
  TRIAGE: { monthly: 4900, yearly: 49000 },
} as const;

export function isYearlyProduct(productId: string | null | undefined): boolean {
  if (!productId) return false;
  return (
    productId === process.env.POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_TRIAGE_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_BYOK_YEARLY_PRODUCT_ID
  );
}

export function getReviewQuotaPerSeat(tier: string, productId?: string | null): number {
  const monthlyQuota = TIER_MONTHLY_REVIEW_QUOTA[tier] ?? 0;
  // Unlimited quota
  if (monthlyQuota === -1) return -1;
  // Yearly plans get 12x the monthly quota
  if (isYearlyProduct(productId)) {
    return monthlyQuota * 12;
  }
  return monthlyQuota;
}

/**
 * Calculate total org quota based on tier and seat count
 */
export function getOrgReviewQuota(tier: string, seatCount: number, productId?: string | null): number {
  const perSeatQuota = getReviewQuotaPerSeat(tier, productId);
  // Unlimited quota
  if (perSeatQuota === -1) return -1;
  return perSeatQuota * seatCount;
}

export function getTierFromProductId(productId: string): "CODE_REVIEW" | "TRIAGE" | "BYOK" | "FREE" {
  return PRODUCT_ID_TO_TIER[productId] ?? "FREE";
}

export function getProductIdForTier(tier: "BYOK" | "CODE_REVIEW" | "TRIAGE", billing: "monthly" | "yearly"): string {
  const envKey = `POLAR_${tier}_${billing.toUpperCase()}_PRODUCT_ID`;
  return process.env[envKey] ?? "";
}

export interface CreateSubscriptionCheckoutParams {
  orgId: string;
  tier: "BYOK" | "CODE_REVIEW" | "TRIAGE";
  billing: "monthly" | "yearly";
  seatCount: number;
  customerEmail?: string;
  customerName?: string;
}

/**
 * Create a checkout for a new org subscription.
 * Note: Polar doesn't support quantity-based subscriptions via SDK,
 * so seatCount is stored in metadata and tracked internally.
 */
export async function createSubscriptionCheckout(params: CreateSubscriptionCheckoutParams) {
  const { orgId, tier, billing, seatCount, customerEmail, customerName } = params;

  const productId = getProductIdForTier(tier, billing);
  if (!productId) {
    throw new Error(`No product ID configured for ${tier} ${billing}`);
  }

  const checkout = await polar.checkouts.create({
    products: [productId],
    successUrl: `${FRONTEND_URL}/console/settings?tab=organization&subscription_success=1`,
    customerEmail,
    customerName,
    metadata: {
      type: "org_subscription",
      orgId,
      tier,
      seatCount: String(seatCount),
    },
  });

  return checkout;
}

/**
 * Note: Polar SDK doesn't support updating subscription quantity.
 * Seat count changes are tracked internally in our database only.
 * For billing changes, use changeSubscriptionTier or handle via Polar dashboard.
 */

/**
 * Cancel the org subscription at period end
 */
export async function cancelSubscription(polarSubscriptionId: string) {
  await polar.subscriptions.update({
    id: polarSubscriptionId,
    subscriptionUpdate: {
      cancelAtPeriodEnd: true,
    },
  });
}

/**
 * Reactivate a subscription that was set to cancel
 */
export async function reactivateSubscription(polarSubscriptionId: string) {
  await polar.subscriptions.update({
    id: polarSubscriptionId,
    subscriptionUpdate: {
      cancelAtPeriodEnd: false,
    },
  });
}

/**
 * Change subscription tier (e.g., upgrade from CODE_REVIEW to TRIAGE)
 */
export async function changeSubscriptionTier(
  polarSubscriptionId: string,
  newTier: "BYOK" | "CODE_REVIEW" | "TRIAGE",
  billing: "monthly" | "yearly"
) {
  const newProductId = getProductIdForTier(newTier, billing);
  if (!newProductId) {
    throw new Error(`No product ID configured for ${newTier} ${billing}`);
  }

  await polar.subscriptions.update({
    id: polarSubscriptionId,
    subscriptionUpdate: {
      productId: newProductId,
    },
  });
}
