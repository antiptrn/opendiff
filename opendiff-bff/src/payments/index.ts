/**
 * Payment provider factory
 * Returns the configured payment provider based on PAYMENT_PROVIDER env variable
 */

import { polarProvider } from "./polar";
import { stripeProvider } from "./stripe";
import type { PaymentProvider, PaymentProviderInterface } from "./types";

export * from "./types";

const PAYMENT_PROVIDER = (process.env.PAYMENT_PROVIDER ?? "polar") as PaymentProvider;

console.log(`[Payments] Using payment provider: ${PAYMENT_PROVIDER}`);

export function getPaymentProvider(): PaymentProviderInterface {
  switch (PAYMENT_PROVIDER) {
    case "stripe":
      return stripeProvider;
    default:
      return polarProvider;
  }
}

export function getPaymentProviderName(): PaymentProvider {
  return PAYMENT_PROVIDER;
}

// Export the active provider as default for convenience
export const paymentProvider = getPaymentProvider();

// Re-export individual providers for direct access if needed
export { polarProvider } from "./polar";
export { stripeProvider } from "./stripe";

// ==================== HELPER FUNCTIONS ====================

// Monthly review quota per seat tier (-1 = unlimited)
export const TIER_MONTHLY_REVIEW_QUOTA: Record<string, number> = {
  FREE: 0,
  BYOK: -1, // Unlimited (user pays Anthropic directly)
  CODE_REVIEW: 100,
  TRIAGE: 250,
};

// Seat pricing in cents (for display purposes)
export const SEAT_PRICING = {
  BYOK: { monthly: 900, yearly: 9000 },
  CODE_REVIEW: { monthly: 1900, yearly: 19000 },
  TRIAGE: { monthly: 4900, yearly: 49000 },
} as const;

export function isYearlyProduct(productId: string | null | undefined): boolean {
  if (!productId) return false;

  // Check both Polar and Stripe yearly product IDs
  return (
    productId === process.env.POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_TRIAGE_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_BYOK_YEARLY_PRODUCT_ID ||
    productId === process.env.STRIPE_CODE_REVIEW_YEARLY_PRICE_ID ||
    productId === process.env.STRIPE_TRIAGE_YEARLY_PRICE_ID ||
    productId === process.env.STRIPE_BYOK_YEARLY_PRICE_ID
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
export function getOrgReviewQuota(
  tier: string,
  seatCount: number,
  productId?: string | null
): number {
  const perSeatQuota = getReviewQuotaPerSeat(tier, productId);
  // Unlimited quota
  if (perSeatQuota === -1) return -1;
  return perSeatQuota * seatCount;
}
