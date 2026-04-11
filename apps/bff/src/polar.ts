import { Polar } from "@polar-sh/sdk";

export const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
});

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";

// Product ID to Tier mapping
export const PRODUCT_ID_TO_TIER: Record<string, "PRO" | "ULTRA" | "SELF_SUFFICIENT"> = {
  [process.env.POLAR_PRO_MONTHLY_PRODUCT_ID ?? ""]: "PRO",
  [process.env.POLAR_PRO_YEARLY_PRODUCT_ID ?? ""]: "PRO",
  [process.env.POLAR_ULTRA_MONTHLY_PRODUCT_ID ?? ""]: "ULTRA",
  [process.env.POLAR_ULTRA_YEARLY_PRODUCT_ID ?? ""]: "ULTRA",
  [process.env.POLAR_SELF_SUFFICIENT_MONTHLY_PRODUCT_ID ?? ""]: "SELF_SUFFICIENT",
  [process.env.POLAR_SELF_SUFFICIENT_YEARLY_PRODUCT_ID ?? ""]: "SELF_SUFFICIENT",
};

export {
  TIER_HIERARCHY,
  TIER_MONTHLY_TOKEN_QUOTA,
  SEAT_PRICING,
  isYearlyProduct,
  getTokenQuotaPerSeat,
  getOrgTokenQuota,
} from "./payments";

export function getTierFromProductId(
  productId: string
): "PRO" | "ULTRA" | "SELF_SUFFICIENT" | "FREE" {
  return PRODUCT_ID_TO_TIER[productId] ?? "FREE";
}

export function getProductIdForTier(
  tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA",
  billing: "monthly" | "yearly"
): string {
  const envKey = `POLAR_${tier}_${billing.toUpperCase()}_PRODUCT_ID`;
  return process.env[envKey] ?? "";
}

export interface CreateSubscriptionCheckoutParams {
  orgId: string;
  tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA";
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
export async function cancelSubscription(subscriptionId: string) {
  await polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      cancelAtPeriodEnd: true,
    },
  });
}

/**
 * Reactivate a subscription that was set to cancel
 */
export async function reactivateSubscription(subscriptionId: string) {
  await polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      cancelAtPeriodEnd: false,
    },
  });
}

/**
 * Change subscription tier (e.g., upgrade from CODE_REVIEW to TRIAGE)
 */
export async function changeSubscriptionTier(
  subscriptionId: string,
  newTier: "SELF_SUFFICIENT" | "PRO" | "ULTRA",
  billing: "monthly" | "yearly"
) {
  const newProductId = getProductIdForTier(newTier, billing);
  if (!newProductId) {
    throw new Error(`No product ID configured for ${newTier} ${billing}`);
  }

  await polar.subscriptions.update({
    id: subscriptionId,
    subscriptionUpdate: {
      productId: newProductId,
    },
  });
}
