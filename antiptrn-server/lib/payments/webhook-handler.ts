/**
 * Unified webhook handler for both Stripe and Polar
 */

import { PrismaClient, SubscriptionStatus as PrismaSubscriptionStatus, SubscriptionTier } from "@prisma/client";
import { paymentProvider, getPaymentProviderName } from "./index";
import type { WebhookEvent, NormalizedSubscription, NormalizedCheckout } from "./types";

const prisma = new PrismaClient();

function mapToPrismaStatus(status: string): PrismaSubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "canceled":
      return "CANCELLED";
    case "past_due":
      return "PAST_DUE";
    default:
      return "INACTIVE";
  }
}

/**
 * Handle checkout completion - creates or updates subscription
 */
async function handleCheckoutCompleted(checkout: NormalizedCheckout) {
  const { metadata, subscriptionId, productId, quantity, customerEmail } = checkout;

  // Handle org subscription checkout
  if (metadata?.type === "org_subscription" && metadata.orgId && subscriptionId) {
    // For org subscriptions, subscription.created webhook already handles the update
    // with correct product/quantity info. Only update here if org doesn't have subscription yet.
    const org = await prisma.organization.findUnique({
      where: { id: metadata.orgId },
      select: { subscriptionId: true, subscriptionStatus: true },
    });

    // If subscription is already set up (by subscription.created event), skip to avoid overwriting
    if (org?.subscriptionId === subscriptionId && org?.subscriptionStatus === "ACTIVE") {
      console.log(`[${getPaymentProviderName()}] Checkout completed for org ${metadata.orgId} - subscription already configured, skipping`);
      return;
    }

    // Fallback: get subscription details from provider if productId is missing
    let tier: string = paymentProvider.getTierFromProductId(productId);
    let seatCount = parseInt(metadata.seatCount ?? String(quantity), 10) || 1;

    if (tier === "FREE" && subscriptionId) {
      // productId wasn't in checkout, fetch from subscription
      try {
        const sub = await paymentProvider.getSubscription(subscriptionId);
        tier = paymentProvider.getTierFromProductId(sub.productId);
        seatCount = sub.quantity;
      } catch (e) {
        console.error(`[${getPaymentProviderName()}] Failed to fetch subscription details:`, e);
      }
    }

    await prisma.organization.update({
      where: { id: metadata.orgId },
      data: {
        subscriptionTier: tier as SubscriptionTier,
        subscriptionStatus: "ACTIVE",
        subscriptionId: subscriptionId,
        productId: productId || undefined,
        seatCount,
        cancelAtPeriodEnd: false,
      },
    });

    console.log(`[${getPaymentProviderName()}] Checkout completed for org ${metadata.orgId}: ${tier}, ${seatCount} seats`);
    return;
  }

  // Legacy user subscription
  if (customerEmail && subscriptionId) {
    const user = await prisma.user.findFirst({
      where: { email: customerEmail },
    });

    if (user) {
      const tier = paymentProvider.getTierFromProductId(productId);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: tier as SubscriptionTier,
          subscriptionStatus: "ACTIVE",
          subscriptionId: subscriptionId,
          productId: productId,
          cancelAtPeriodEnd: false,
          reviewsUsedThisCycle: 0,
        },
      });
      console.log(`[${getPaymentProviderName()}] Activated legacy subscription for user ${user.login}: ${tier}`);
    }
  }
}

/**
 * Handle subscription created or updated
 */
async function handleSubscriptionUpdated(subscription: NormalizedSubscription) {
  const { id: subscriptionId, productId, status, quantity, metadata, currentPeriodEnd, cancelAtPeriodEnd } = subscription;

  const tier = paymentProvider.getTierFromProductId(productId);
  const mappedStatus = mapToPrismaStatus(status);

  // Handle org subscription (metadata-based routing)
  if (metadata?.type === "org_subscription" && metadata.orgId) {
    // Check if this is a new subscription (org doesn't have one yet)
    const existingOrg = await prisma.organization.findUnique({
      where: { id: metadata.orgId },
      select: { subscriptionId: true },
    });
    const isNewSubscription = !existingOrg?.subscriptionId;

    await prisma.organization.update({
      where: { id: metadata.orgId },
      data: {
        subscriptionTier: mappedStatus === "ACTIVE" ? (tier as SubscriptionTier) : undefined,
        subscriptionStatus: mappedStatus,
        subscriptionId: subscriptionId,
        productId: productId,
        seatCount: quantity,
        cancelAtPeriodEnd,
        subscriptionExpiresAt: currentPeriodEnd,
      },
    });

    // Auto-assign seats for new subscriptions
    if (isNewSubscription && mappedStatus === "ACTIVE" && quantity > 0) {
      // Get members without seats
      const membersWithoutSeats = await prisma.organizationMember.findMany({
        where: {
          organizationId: metadata.orgId,
          hasSeat: false,
        },
      });

      // Sort with OWNER first, then ADMIN, then MEMBER
      const roleOrder = { OWNER: 0, ADMIN: 1, MEMBER: 2 };
      membersWithoutSeats.sort((a, b) => roleOrder[a.role] - roleOrder[b.role]);

      // Take up to `quantity` members
      const membersToAssign = membersWithoutSeats.slice(0, quantity);

      if (membersToAssign.length > 0) {
        await prisma.organizationMember.updateMany({
          where: {
            id: { in: membersToAssign.map(m => m.id) },
          },
          data: { hasSeat: true },
        });
        console.log(`[${getPaymentProviderName()}] Auto-assigned ${membersToAssign.length} seat(s) for new subscription`);
      }
    }

    console.log(`[${getPaymentProviderName()}] Updated org subscription for ${metadata.orgId}: ${tier}, ${quantity} seats, status: ${mappedStatus}`);
    return;
  }

  // Lookup org by subscription ID
  const org = await prisma.organization.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (org) {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        subscriptionTier: mappedStatus === "ACTIVE" ? (tier as SubscriptionTier) : org.subscriptionTier,
        subscriptionStatus: mappedStatus,
        productId: productId,
        seatCount: quantity,
        cancelAtPeriodEnd,
        subscriptionExpiresAt: currentPeriodEnd,
      },
    });
    console.log(`[${getPaymentProviderName()}] Updated org subscription by ID lookup: ${tier}, ${quantity} seats`);
    return;
  }

  // Legacy user subscription
  let user = await prisma.user.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: mappedStatus === "ACTIVE" ? (tier as SubscriptionTier) : user.subscriptionTier,
        subscriptionStatus: mappedStatus,
        subscriptionId: subscriptionId,
        productId: productId,
        cancelAtPeriodEnd,
        subscriptionExpiresAt: currentPeriodEnd,
      },
    });
    console.log(`[${getPaymentProviderName()}] Updated legacy user subscription: ${tier}, status: ${mappedStatus}`);
  }
}

/**
 * Handle subscription canceled (scheduled for end of period)
 */
async function handleSubscriptionCanceled(subscription: NormalizedSubscription) {
  const { id: subscriptionId, currentPeriodEnd, status } = subscription;

  // Check if this is an org subscription
  const org = await prisma.organization.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (org) {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        subscriptionStatus: status === "active" ? "ACTIVE" : "CANCELLED",
        cancelAtPeriodEnd: true,
        subscriptionExpiresAt: currentPeriodEnd,
      },
    });
    console.log(`[${getPaymentProviderName()}] Org subscription scheduled for cancellation: ${org.slug}`);
    return;
  }

  // Legacy user subscription
  const user = await prisma.user.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: status === "active" ? "ACTIVE" : "CANCELLED",
        cancelAtPeriodEnd: true,
        subscriptionExpiresAt: currentPeriodEnd,
      },
    });
    console.log(`[${getPaymentProviderName()}] Legacy subscription scheduled for cancellation: ${user.login}`);
  }
}

/**
 * Handle subscription revoked (immediate cancellation)
 */
async function handleSubscriptionRevoked(subscription: NormalizedSubscription) {
  const { id: subscriptionId } = subscription;

  // Check if this is an org subscription
  const org = await prisma.organization.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (org) {
    // Clear subscription data and unassign all seats
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: org.id },
        data: {
          subscriptionTier: null,
          subscriptionStatus: null,
          subscriptionId: null,
          productId: null,
          seatCount: 0,
          subscriptionExpiresAt: null,
          cancelAtPeriodEnd: false,
        },
      }),
      prisma.organizationMember.updateMany({
        where: { organizationId: org.id },
        data: { hasSeat: false },
      }),
    ]);
    console.log(`[${getPaymentProviderName()}] Org subscription revoked, all seats unassigned: ${org.slug}`);
    return;
  }

  // Legacy user subscription
  const user = await prisma.user.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionTier: "FREE",
        subscriptionStatus: "CANCELLED",
        subscriptionId: null,
        cancelAtPeriodEnd: false,
      },
    });
    console.log(`[${getPaymentProviderName()}] Legacy subscription revoked: ${user.login}`);
  }
}

/**
 * Handle subscription uncanceled (reactivated)
 */
async function handleSubscriptionUncanceled(subscription: NormalizedSubscription) {
  const { id: subscriptionId } = subscription;

  // Check if this is an org subscription
  const org = await prisma.organization.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (org) {
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        subscriptionStatus: "ACTIVE",
        cancelAtPeriodEnd: false,
      },
    });
    console.log(`[${getPaymentProviderName()}] Org subscription uncanceled: ${org.slug}`);
    return;
  }

  // Legacy user subscription
  const user = await prisma.user.findFirst({
    where: { subscriptionId: subscriptionId },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "ACTIVE",
        cancelAtPeriodEnd: false,
      },
    });
    console.log(`[${getPaymentProviderName()}] Legacy subscription uncanceled: ${user.login}`);
  }
}

/**
 * Main webhook handler - processes events from either provider
 */
export async function handleWebhookEvent(event: WebhookEvent): Promise<void> {
  console.log(`[${event.provider}] Received webhook: ${event.type}`);

  switch (event.type) {
    case "checkout.completed":
      if (event.checkout) {
        await handleCheckoutCompleted(event.checkout);
      }
      break;

    case "subscription.created":
    case "subscription.updated":
      if (event.subscription) {
        await handleSubscriptionUpdated(event.subscription);
      }
      break;

    case "subscription.canceled":
      if (event.subscription) {
        await handleSubscriptionCanceled(event.subscription);
      }
      break;

    case "subscription.revoked":
      if (event.subscription) {
        await handleSubscriptionRevoked(event.subscription);
      }
      break;

    case "subscription.uncanceled":
      if (event.subscription) {
        await handleSubscriptionUncanceled(event.subscription);
      }
      break;

    case "unknown":
    default:
      console.log(`[${event.provider}] Unhandled event type: ${event.type}`);
      break;
  }
}

/**
 * Parse and handle a webhook request
 */
export async function processWebhook(
  body: string | Buffer,
  headers: Record<string, string>
): Promise<{ success: boolean; message: string }> {
  try {
    const event = await paymentProvider.parseWebhook(body, headers);
    await handleWebhookEvent(event);
    return { success: true, message: "Webhook processed" };
  } catch (error) {
    console.error(`Webhook processing error:`, error);
    throw error;
  }
}
