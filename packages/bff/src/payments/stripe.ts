/**
 * Stripe payment provider implementation
 */

import Stripe from "stripe";
import type {
  CreateCheckoutParams,
  CreateCheckoutResult,
  NormalizedSubscription,
  PaymentProviderInterface,
  PreviewSubscriptionChangeParams,
  SubscriptionChangePreview,
  SubscriptionStatus,
  UpdateSubscriptionParams,
  WebhookEvent,
  WebhookEventType,
} from "./types";

// Lazy initialization to avoid errors when Stripe is not configured
let _stripe: Stripe | null = null;
export function getStripe(): Stripe {
  if (!_stripe) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(secretKey);
  }
  return _stripe;
}

// Product ID to Tier mapping (Stripe uses price IDs)
const PRICE_ID_TO_TIER: Record<string, "PRO" | "ULTRA" | "SELF_SUFFICIENT"> = {
  [process.env.STRIPE_PRO_MONTHLY_PRICE_ID ?? ""]: "PRO",
  [process.env.STRIPE_PRO_YEARLY_PRICE_ID ?? ""]: "PRO",
  [process.env.STRIPE_ULTRA_MONTHLY_PRICE_ID ?? ""]: "ULTRA",
  [process.env.STRIPE_ULTRA_YEARLY_PRICE_ID ?? ""]: "ULTRA",
  [process.env.STRIPE_SELF_SUFFICIENT_MONTHLY_PRICE_ID ?? ""]: "SELF_SUFFICIENT",
  [process.env.STRIPE_SELF_SUFFICIENT_YEARLY_PRICE_ID ?? ""]: "SELF_SUFFICIENT",
};

function getPriceIdForTier(
  tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA",
  billing: "monthly" | "yearly"
): string {
  const envKey = `STRIPE_${tier}_${billing.toUpperCase()}_PRICE_ID`;
  return process.env[envKey] ?? "";
}

function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    case "trialing":
      return "trialing";
    case "paused":
      return "paused";
    case "unpaid":
      return "unpaid";
    default:
      return "incomplete";
  }
}

function mapStripeEventType(eventType: string): WebhookEventType {
  switch (eventType) {
    case "customer.subscription.created":
      return "subscription.created";
    case "customer.subscription.updated":
      return "subscription.updated";
    case "customer.subscription.deleted":
      return "subscription.canceled";
    case "checkout.session.completed":
      return "checkout.completed";
    default:
      return "unknown";
  }
}

function normalizeStripeSubscription(sub: Stripe.Subscription): NormalizedSubscription {
  const item = sub.items.data[0];
  const priceId = typeof item?.price === "string" ? item.price : (item?.price?.id ?? "");
  const _productId =
    typeof item?.price === "object" && item.price?.product
      ? typeof item.price.product === "string"
        ? item.price.product
        : item.price.product.id
      : priceId;

  // In Stripe API 2025+, current_period_end is on the item, not the subscription
  const currentPeriodEnd = item?.current_period_end
    ? new Date(item.current_period_end * 1000)
    : null;

  return {
    id: sub.id,
    productId: priceId, // Use price ID for consistency with our tier mapping
    quantity: item?.quantity ?? 1,
    status: mapStripeStatus(sub.status),
    currentPeriodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    metadata: (sub.metadata as Record<string, string>) ?? {},
  };
}

export const stripeProvider: PaymentProviderInterface = {
  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: params.productId, // In Stripe, this is the price ID
          quantity: params.quantity,
        },
      ],
      success_url: params.successUrl,
      cancel_url: params.cancelUrl ?? params.successUrl,
      customer_email: params.customerEmail,
      metadata: params.metadata,
      subscription_data: {
        metadata: params.metadata,
      },
    });

    return {
      checkoutId: session.id,
      checkoutUrl: session.url ?? "",
    };
  },

  async updateSubscription(params: UpdateSubscriptionParams): Promise<void> {
    const subscription = await getStripe().subscriptions.retrieve(params.subscriptionId);
    const itemId = subscription.items.data[0]?.id;

    if (!itemId) {
      throw new Error("Subscription has no items");
    }

    const updateParams: Stripe.SubscriptionUpdateParams = {
      items: [
        {
          id: itemId,
          ...(params.productId && { price: params.productId }),
          ...(params.quantity && { quantity: params.quantity }),
        },
      ],
      proration_behavior: "create_prorations",
    };

    await getStripe().subscriptions.update(params.subscriptionId, updateParams);
  },

  async previewSubscriptionChange(
    params: PreviewSubscriptionChangeParams
  ): Promise<SubscriptionChangePreview> {
    const subscription = await getStripe().subscriptions.retrieve(params.subscriptionId);
    const item = subscription.items.data[0];

    if (!item) {
      throw new Error("Subscription has no items");
    }

    const currentQuantity = item.quantity ?? 1;
    const priceId = typeof item.price === "string" ? item.price : item.price.id;

    // Use Stripe's upcoming invoice API to preview the proration
    const upcomingInvoice = await getStripe().invoices.createPreview({
      subscription: params.subscriptionId,
      subscription_details: {
        items: [
          {
            id: item.id,
            quantity: params.quantity,
          },
        ],
        proration_behavior: "create_prorations",
      },
    });

    // Calculate prorated amount by summing proration line items
    // Stripe returns proration line items - they may have proration: true OR
    // be identified by descriptions containing "Unused time" or "Remaining time"
    let proratedCharge = 0;

    for (const line of upcomingInvoice.lines.data) {
      const isProrationFlag = (line as unknown as Record<string, unknown>).proration === true;
      const description = line.description?.toLowerCase() ?? "";
      // Detect proration line items by description patterns
      const isProrationByDescription =
        description.includes("unused time") || description.includes("remaining time");
      const isProration = isProrationFlag || isProrationByDescription;

      // Sum proration line items (exclude regular subscription charges)
      if (isProration && !description.includes("(at $")) {
        proratedCharge += line.amount;
      }
    }

    // If we still got 0, try calculating manually based on the difference
    // This can happen if Stripe doesn't create proration line items for some reason
    if (proratedCharge === 0 && currentQuantity !== params.quantity) {
      const price = await getStripe().prices.retrieve(priceId);
      const unitAmount = price.unit_amount ?? 0;

      // Calculate remaining time in current period
      // In Stripe API 2025+, current_period_end might be on the item, not the subscription
      const now = Math.floor(Date.now() / 1000);

      // Try to get period end from item first (newer API), then subscription (older API)
      const sub = subscription as unknown as Record<string, unknown>;
      const periodEnd =
        (item.current_period_end as number | undefined) ??
        (sub.current_period_end as number | undefined);
      // Period start should be on subscription, but check item as fallback
      const periodStart =
        (sub.current_period_start as number | undefined) ??
        (item.current_period_start as number | undefined);

      if (
        !periodEnd ||
        !periodStart ||
        typeof periodEnd !== "number" ||
        typeof periodStart !== "number"
      ) {
        // Fallback: assume 30 days remaining for monthly, 365 for yearly
        const isYearly = price.recurring?.interval === "year";
        const daysInPeriod = isYearly ? 365 : 30;
        const daysRemaining = daysInPeriod; // Conservative estimate
        const prorationRatio = daysRemaining / daysInPeriod;
        const seatDifference = params.quantity - currentQuantity;
        proratedCharge = Math.round(seatDifference * unitAmount * prorationRatio);
      } else {
        const totalPeriod = periodEnd - periodStart;
        const remainingPeriod = periodEnd - now;

        if (totalPeriod > 0 && remainingPeriod > 0) {
          const prorationRatio = remainingPeriod / totalPeriod;
          const seatDifference = params.quantity - currentQuantity;
          proratedCharge = Math.round(seatDifference * unitAmount * prorationRatio);
        }
      }
    }

    // Get the price to calculate the next full billing amount
    const price = await getStripe().prices.retrieve(priceId);
    const unitAmount = price.unit_amount ?? 0;
    const nextBillingAmount = unitAmount * params.quantity;

    return {
      currentSeats: currentQuantity,
      newSeats: params.quantity,
      proratedCharge,
      nextBillingAmount,
      effectiveNow: true,
    };
  },

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });
  },

  async reactivateSubscription(subscriptionId: string): Promise<void> {
    await getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: false,
    });
  },

  async getSubscription(subscriptionId: string): Promise<NormalizedSubscription> {
    const sub = await getStripe().subscriptions.retrieve(subscriptionId);
    return normalizeStripeSubscription(sub);
  },

  async parseWebhook(
    body: string | Buffer,
    headers: Record<string, string>
  ): Promise<WebhookEvent> {
    const sig = headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

    let stripeEvent: Stripe.Event;
    try {
      // Use async version for Bun compatibility
      stripeEvent = await getStripe().webhooks.constructEventAsync(body, sig, webhookSecret);
    } catch (err) {
      throw new Error(`Webhook signature verification failed: ${err}`);
    }

    const eventType = stripeEvent.type;
    const mappedType = mapStripeEventType(eventType);

    const event: WebhookEvent = {
      type: mappedType,
      provider: "stripe",
      rawPayload: stripeEvent,
    };

    // Handle subscription events
    if (eventType.startsWith("customer.subscription.")) {
      const sub = stripeEvent.data.object as Stripe.Subscription;
      event.subscription = normalizeStripeSubscription(sub);
    }

    // Handle checkout events
    if (eventType === "checkout.session.completed") {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      event.checkout = {
        id: session.id,
        status: "complete",
        subscriptionId:
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null),
        productId: "", // Will be populated from subscription
        quantity: 1,
        customerEmail: session.customer_email ?? null,
        metadata: (session.metadata as Record<string, string>) ?? {},
      };
    }

    return event;
  },

  getProductId(tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA", billing: "monthly" | "yearly"): string {
    return getPriceIdForTier(tier, billing);
  },

  getTierFromProductId(productId: string): "SELF_SUFFICIENT" | "PRO" | "ULTRA" | "FREE" {
    return PRICE_ID_TO_TIER[productId] ?? "FREE";
  },
};
