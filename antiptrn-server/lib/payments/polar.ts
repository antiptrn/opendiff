/**
 * Polar payment provider implementation
 */

import { Polar } from "@polar-sh/sdk";
import type {
  PaymentProviderInterface,
  CreateCheckoutParams,
  CreateCheckoutResult,
  UpdateSubscriptionParams,
  PreviewSubscriptionChangeParams,
  SubscriptionChangePreview,
  NormalizedSubscription,
  WebhookEvent,
  WebhookEventType,
  SubscriptionStatus,
} from "./types";

const polar = new Polar({
  accessToken: process.env.POLAR_ACCESS_TOKEN ?? "",
  server: (process.env.POLAR_SERVER as "sandbox" | "production") ?? "sandbox",
});

// Product ID to Tier mapping
const PRODUCT_ID_TO_TIER: Record<string, "CODE_REVIEW" | "TRIAGE" | "BYOK"> = {
  [process.env.POLAR_CODE_REVIEW_MONTHLY_PRODUCT_ID ?? ""]: "CODE_REVIEW",
  [process.env.POLAR_CODE_REVIEW_YEARLY_PRODUCT_ID ?? ""]: "CODE_REVIEW",
  [process.env.POLAR_TRIAGE_MONTHLY_PRODUCT_ID ?? ""]: "TRIAGE",
  [process.env.POLAR_TRIAGE_YEARLY_PRODUCT_ID ?? ""]: "TRIAGE",
  [process.env.POLAR_BYOK_MONTHLY_PRODUCT_ID ?? ""]: "BYOK",
  [process.env.POLAR_BYOK_YEARLY_PRODUCT_ID ?? ""]: "BYOK",
};

function getProductIdForTier(tier: "BYOK" | "CODE_REVIEW" | "TRIAGE", billing: "monthly" | "yearly"): string {
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

  async previewSubscriptionChange(_params: PreviewSubscriptionChangeParams): Promise<SubscriptionChangePreview> {
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

  async parseWebhook(body: string | Buffer, headers: Record<string, string>): Promise<WebhookEvent> {
    // Polar webhook verification would go here if needed
    // For now, we just parse the JSON
    const payload = typeof body === "string" ? JSON.parse(body) : JSON.parse(body.toString());
    const eventType = payload.type as string;
    const mappedType = mapPolarEventType(eventType);

    const event: WebhookEvent = {
      type: mappedType,
      provider: "polar",
      rawPayload: payload,
    };

    // Handle subscription events
    if (eventType.startsWith("subscription.")) {
      const sub = payload.data;
      event.subscription = {
        id: sub.id,
        productId: sub.product_id ?? "",
        quantity: sub.quantity ?? 1,
        status: mapPolarStatus(sub.status),
        currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
        metadata: sub.metadata ?? {},
      };
    }

    // Handle checkout events
    if (eventType === "checkout.updated" && payload.data.status === "succeeded") {
      const checkout = payload.data;
      event.checkout = {
        id: checkout.id,
        status: "complete",
        subscriptionId: checkout.subscription_id ?? null,
        productId: checkout.product_id ?? "",
        quantity: checkout.product_price?.quantity ?? 1,
        customerEmail: checkout.customer_email ?? null,
        metadata: checkout.metadata ?? {},
      };
    }

    return event;
  },

  getProductId(tier: "BYOK" | "CODE_REVIEW" | "TRIAGE", billing: "monthly" | "yearly"): string {
    return getProductIdForTier(tier, billing);
  },

  getTierFromProductId(productId: string): "BYOK" | "CODE_REVIEW" | "TRIAGE" | "FREE" {
    return PRODUCT_ID_TO_TIER[productId] ?? "FREE";
  },
};
