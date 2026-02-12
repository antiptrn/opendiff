/**
 * Polar payment provider implementation
 */

import { Polar } from "@polar-sh/sdk";
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

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
});

// Product ID to Tier mapping
const PRODUCT_ID_TO_TIER: Record<string, "PRO" | "ULTRA" | "SELF_SUFFICIENT"> = {
  [process.env.POLAR_PRO_MONTHLY_PRODUCT_ID ?? ""]: "PRO",
  [process.env.POLAR_PRO_YEARLY_PRODUCT_ID ?? ""]: "PRO",
  [process.env.POLAR_ULTRA_MONTHLY_PRODUCT_ID ?? ""]: "ULTRA",
  [process.env.POLAR_ULTRA_YEARLY_PRODUCT_ID ?? ""]: "ULTRA",
  [process.env.POLAR_SELF_SUFFICIENT_MONTHLY_PRODUCT_ID ?? ""]: "SELF_SUFFICIENT",
  [process.env.POLAR_SELF_SUFFICIENT_YEARLY_PRODUCT_ID ?? ""]: "SELF_SUFFICIENT",
};

function getProductIdForTier(
  tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA",
  billing: "monthly" | "yearly"
): string {
  const envKey = `POLAR_${tier}_${billing.toUpperCase()}_PRODUCT_ID`;
  return process.env[envKey] ?? "";
}

function mapPolarStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "past_due":
      return "past_due";
    case "incomplete":
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

function mapPolarEventType(eventType: string): WebhookEventType {
  switch (eventType) {
    case "subscription.created":
      return "subscription.created";
    case "subscription.updated":
    case "subscription.active":
      return "subscription.updated";
    case "subscription.canceled":
      return "subscription.canceled";
    case "subscription.revoked":
      return "subscription.revoked";
    case "subscription.uncanceled":
      return "subscription.uncanceled";
    case "checkout.updated":
      return "checkout.completed";
    default:
      return "unknown";
  }
}

export const polarProvider: PaymentProviderInterface = {
  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const checkout = await polar.checkouts.create({
      products: [params.productId],
      successUrl: params.successUrl,
      customerEmail: params.customerEmail,
      customerName: params.customerName,
      metadata: params.metadata,
    });

    return {
      checkoutId: checkout.id,
      checkoutUrl: checkout.url,
    };
  },

  async updateSubscription(params: UpdateSubscriptionParams): Promise<void> {
    // Polar SDK doesn't support quantity updates
    // Only product changes are supported
    if (params.productId) {
      await polar.subscriptions.update({
        id: params.subscriptionId,
        subscriptionUpdate: {
          productId: params.productId,
        },
      });
    }
    // Note: quantity changes need to be tracked internally for Polar
    // unless seat-based pricing beta is enabled
  },

  async previewSubscriptionChange(
    _params: PreviewSubscriptionChangeParams
  ): Promise<SubscriptionChangePreview> {
    // Polar doesn't support seat-based billing previews
    // Return a basic estimate without proration details
    throw new Error("Seat-based billing preview is not supported with Polar. Please use Stripe.");
  },

  async cancelSubscription(subscriptionId: string): Promise<void> {
    await polar.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });
  },

  async reactivateSubscription(subscriptionId: string): Promise<void> {
    await polar.subscriptions.update({
      id: subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: false,
      },
    });
  },

  async getSubscription(subscriptionId: string): Promise<NormalizedSubscription> {
    const sub = await polar.subscriptions.get({ id: subscriptionId });
    // Cast to any to access quantity - Polar SDK types may not include it yet
    const subAny = sub as unknown as { quantity?: number };

    return {
      id: sub.id,
      productId: sub.productId ?? "",
      quantity: subAny.quantity ?? 1,
      status: mapPolarStatus(sub.status),
      currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd ?? false,
      metadata: (sub.metadata as Record<string, string>) ?? {},
    };
  },

  async parseWebhook(
    body: string | Buffer,
    headers: Record<string, string>
  ): Promise<WebhookEvent> {
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
    let payload: Record<string, unknown>;

    if (!webhookSecret) {
      throw new Error("POLAR_WEBHOOK_SECRET is not configured — cannot verify webhook signatures");
    }

    // Verify webhook signature using Polar SDK
    const { validateEvent } = await import("@polar-sh/sdk/webhooks");
    const bodyStr = typeof body === "string" ? body : body.toString();
    try {
      const verified = validateEvent(bodyStr, headers, webhookSecret);
      payload = verified as unknown as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Polar webhook signature verification failed: ${err}`);
    }
    const eventType = payload.type as string;
    const mappedType = mapPolarEventType(eventType);

    const event: WebhookEvent = {
      type: mappedType,
      provider: "polar",
      rawPayload: payload,
    };

    // Handle subscription events
    if (eventType.startsWith("subscription.")) {
      const sub = payload.data as Record<string, unknown>;
      event.subscription = {
        id: sub.id as string,
        productId: (sub.product_id as string) ?? "",
        quantity: (sub.quantity as number) ?? 1,
        status: mapPolarStatus(sub.status as string),
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end as string) : null,
        cancelAtPeriodEnd: (sub.cancel_at_period_end as boolean) ?? false,
        metadata: (sub.metadata as Record<string, string>) ?? {},
      };
    }

    // Handle checkout events
    const payloadData = payload.data as Record<string, unknown> | undefined;
    if (eventType === "checkout.updated" && payloadData?.status === "succeeded") {
      const checkout = payloadData;
      const productPrice = checkout.product_price as Record<string, unknown> | undefined;
      event.checkout = {
        id: checkout.id as string,
        status: "complete",
        subscriptionId: (checkout.subscription_id as string) ?? null,
        productId: (checkout.product_id as string) ?? "",
        quantity: (productPrice?.quantity as number) ?? 1,
        customerEmail: (checkout.customer_email as string) ?? null,
        metadata: (checkout.metadata as Record<string, string>) ?? {},
      };
    }

    return event;
  },

  getProductId(tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA", billing: "monthly" | "yearly"): string {
    return getProductIdForTier(tier, billing);
  },

  getTierFromProductId(productId: string): "SELF_SUFFICIENT" | "PRO" | "ULTRA" | "FREE" {
    return PRODUCT_ID_TO_TIER[productId] ?? "FREE";
  },
};
