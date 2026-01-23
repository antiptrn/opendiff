/**
 * Payment provider abstraction layer
 * Supports both Stripe and Polar with a unified interface
 */

export type PaymentProvider = "stripe" | "polar";

export type SubscriptionStatus = "active" | "canceled" | "past_due" | "incomplete" | "trialing" | "paused" | "unpaid";

export interface NormalizedSubscription {
  id: string;
  productId: string;
  quantity: number;
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  metadata: Record<string, string>;
}

export interface NormalizedCheckout {
  id: string;
  status: "open" | "complete" | "expired";
  subscriptionId: string | null;
  productId: string;
  quantity: number;
  customerEmail: string | null;
  metadata: Record<string, string>;
}

export interface WebhookEvent {
  type: WebhookEventType;
  provider: PaymentProvider;
  subscription?: NormalizedSubscription;
  checkout?: NormalizedCheckout;
  rawPayload: unknown;
}

export type WebhookEventType =
  | "subscription.created"
  | "subscription.updated"
  | "subscription.canceled"
  | "subscription.revoked"
  | "subscription.uncanceled"
  | "checkout.completed"
  | "unknown";

export interface CreateCheckoutParams {
  productId: string;
  quantity: number;
  successUrl: string;
  cancelUrl?: string;
  customerEmail?: string;
  customerName?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutResult {
  checkoutId: string;
  checkoutUrl: string;
}

export interface UpdateSubscriptionParams {
  subscriptionId: string;
  productId?: string;
  quantity?: number;
}

export interface PreviewSubscriptionChangeParams {
  subscriptionId: string;
  quantity: number;
}

export interface SubscriptionChangePreview {
  currentSeats: number;
  newSeats: number;
  proratedCharge: number; // cents - amount charged/credited today
  nextBillingAmount: number; // cents - amount on next renewal
  effectiveNow: boolean;
}

export interface PaymentProviderInterface {
  /**
   * Create a checkout session for a new subscription
   */
  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;

  /**
   * Update an existing subscription (change product or quantity)
   */
  updateSubscription(params: UpdateSubscriptionParams): Promise<void>;

  /**
   * Preview what a subscription change would cost (proration)
   */
  previewSubscriptionChange(params: PreviewSubscriptionChangeParams): Promise<SubscriptionChangePreview>;

  /**
   * Cancel a subscription at period end
   */
  cancelSubscription(subscriptionId: string): Promise<void>;

  /**
   * Reactivate a subscription that was set to cancel
   */
  reactivateSubscription(subscriptionId: string): Promise<void>;

  /**
   * Get subscription details
   */
  getSubscription(subscriptionId: string): Promise<NormalizedSubscription>;

  /**
   * Parse and normalize a webhook payload
   */
  parseWebhook(body: string | Buffer, headers: Record<string, string>): Promise<WebhookEvent>;

  /**
   * Get the product ID for a given tier and billing cycle
   */
  getProductId(tier: "BYOK" | "CODE_REVIEW" | "TRIAGE", billing: "monthly" | "yearly"): string;

  /**
   * Get the tier from a product ID
   */
  getTierFromProductId(productId: string): "BYOK" | "CODE_REVIEW" | "TRIAGE" | "FREE";
}
