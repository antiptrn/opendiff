// ==================== SHARED TIER CONSTANTS ====================

export const TIER_HIERARCHY: Record<string, number> = {
  FREE: 0,
  SELF_SUFFICIENT: 1,
  PRO: 2,
  ULTRA: 3,
};

// Monthly token quota per seat tier (-1 = unlimited)
export const TIER_MONTHLY_TOKEN_QUOTA: Record<string, number> = {
  FREE: 0,
  SELF_SUFFICIENT: -1, // Unlimited (user pays Anthropic directly)
  PRO: 2_500_000,
  ULTRA: 8_000_000,
};

// Seat pricing in cents (for display purposes)
export const SEAT_PRICING = {
  SELF_SUFFICIENT: { monthly: 900, yearly: 9000 },
  PRO: { monthly: 1900, yearly: 19000 },
  ULTRA: { monthly: 4900, yearly: 49000 },
} as const;

export function isYearlyProduct(productId: string | null | undefined): boolean {
  if (!productId) return false;

  // Check both Polar and Stripe yearly product IDs
  return (
    productId === process.env.POLAR_PRO_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_ULTRA_YEARLY_PRODUCT_ID ||
    productId === process.env.POLAR_SELF_SUFFICIENT_YEARLY_PRODUCT_ID ||
    productId === process.env.STRIPE_PRO_YEARLY_PRICE_ID ||
    productId === process.env.STRIPE_ULTRA_YEARLY_PRICE_ID ||
    productId === process.env.STRIPE_SELF_SUFFICIENT_YEARLY_PRICE_ID
  );
}

export function getTokenQuotaPerSeat(tier: string, productId?: string | null): number {
  const monthlyQuota = TIER_MONTHLY_TOKEN_QUOTA[tier] ?? 0;
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
export function getOrgTokenQuota(
  tier: string,
  seatCount: number,
  productId?: string | null
): number {
  const perSeatQuota = getTokenQuotaPerSeat(tier, productId);
  // Unlimited quota
  if (perSeatQuota === -1) return -1;
  return perSeatQuota * seatCount;
}
