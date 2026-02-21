/** Subscription management: create, update, cancel, and reactivate organization subscriptions. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { Sentry } from "../../utils/sentry";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import {
  canManageBilling,
  getAvailableSeats,
  getOrgQuotaPool,
} from "../../middleware/organization";
import { paymentProvider } from "../../payments";
import { logAudit } from "../../services/audit";

const subscriptionRoutes = new Hono();

// Get subscription details
subscriptionRoutes.get("/subscription", requireAuth(), async (c) => {
  const user = getAuthUser(c);
  const orgId = c.req.param("orgId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  const org = membership.organization;
  const [seats, quotaPool] = await Promise.all([getAvailableSeats(orgId), getOrgQuotaPool(orgId)]);

  return c.json({
    subscription: org.subscriptionTier
      ? {
          tier: org.subscriptionTier,
          status: org.subscriptionStatus,
          seatCount: org.seatCount,
          expiresAt: org.subscriptionExpiresAt,
          cancelAtPeriodEnd: org.cancelAtPeriodEnd,
        }
      : null,
    seats: {
      total: seats.total,
      assigned: seats.assigned,
      available: seats.available,
    },
    quotaPool: {
      total: quotaPool.total,
      used: quotaPool.used,
      hasUnlimited: quotaPool.hasUnlimited,
    },
  });
});

// Create or update subscription (purchase seats)
subscriptionRoutes.post("/subscription", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true, user: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can manage subscriptions" }, 403);
  }

  const body = await c.req.json();
  const { tier, billing, quantity, seatCount } = body;

  // Validate tier
  if (!["SELF_SUFFICIENT", "PRO", "ULTRA"].includes(tier)) {
    return c.json({ error: "Invalid tier. Must be SELF_SUFFICIENT, PRO, or ULTRA" }, 400);
  }

  // Validate billing
  if (!["monthly", "yearly"].includes(billing)) {
    return c.json({ error: "Invalid billing cycle. Must be monthly or yearly" }, 400);
  }

  // Validate quantity (accept both quantity and seatCount for compatibility)
  const seatQuantity = Number.parseInt(seatCount ?? quantity) || 1;
  if (seatQuantity < 1 || seatQuantity > 100) {
    return c.json({ error: "Quantity must be between 1 and 100" }, 400);
  }

  const org = membership.organization;

  try {
    // If org already has an active subscription, update it
    if (org.subscriptionId && org.subscriptionStatus === "ACTIVE") {
      const currentProductId = org.productId;
      const newProductId = paymentProvider.getProductId(tier, billing);

      if (!newProductId) {
        console.error("Billing misconfiguration: missing productId", { tier, billing });
        return c.json(
          {
            error:
              "Billing is temporarily unavailable for this plan. Please contact support if this persists.",
          },
          500
        );
      }

      // Check if changing tier/billing or just adding seats
      if (currentProductId === newProductId) {
        // Just updating seat count (Polar doesn't support quantity updates, tracked internally)
        await prisma.organization.update({
          where: { id: orgId },
          data: { seatCount: seatQuantity },
        });

        await logAudit({
          organizationId: orgId,
          userId: currentUser.id,
          action: "subscription.updated",
          metadata: { tier, quantity: seatQuantity, action: "quantity_change" },
          c,
        });

        return c.json({
          success: true,
          message: `Updated to ${seatQuantity} seats`,
          subscription: {
            tier: org.subscriptionTier,
            seatCount: seatQuantity,
          },
        });
      }
      // Changing tier/billing - need to update product
      // If subscription is set to cancel, first uncancel it
      if (org.cancelAtPeriodEnd) {
        await paymentProvider.reactivateSubscription(org.subscriptionId);
      }

      await paymentProvider.updateSubscription({
        subscriptionId: org.subscriptionId,
        productId: newProductId,
        quantity: seatQuantity,
      });

      await prisma.organization.update({
        where: { id: orgId },
        data: {
          subscriptionTier: tier,
          productId: newProductId,
          seatCount: seatQuantity,
          cancelAtPeriodEnd: false,
        },
      });

      await logAudit({
        organizationId: orgId,
        userId: currentUser.id,
        action: "subscription.updated",
        metadata: { tier, billing, quantity: seatQuantity, action: "tier_change" },
        c,
      });

      return c.json({
        success: true,
        message: `Changed to ${tier} with ${seatQuantity} seats`,
        subscription: {
          tier,
          seatCount: seatQuantity,
        },
      });
    }

    // No existing subscription - create checkout
    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

    const productId = paymentProvider.getProductId(tier, billing);
    if (!productId) {
      console.error("Billing misconfiguration: missing productId", { tier, billing });
      return c.json(
        {
          error:
            "Billing is temporarily unavailable for this plan. Please contact support if this persists.",
        },
        500
      );
    }

    const checkout = await paymentProvider.createCheckout({
      productId,
      quantity: seatQuantity,
      successUrl: `${FRONTEND_URL}/console/settings/billing?subscription_success=1`,
      customerEmail: membership.user.email || undefined,
      customerName: membership.user.name || membership.user.login,
      metadata: {
        type: "org_subscription",
        orgId,
        tier,
        seatCount: String(seatQuantity),
      },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.created",
      metadata: { tier, billing, quantity: seatQuantity },
      c,
    });

    return c.json({ checkoutUrl: checkout.checkoutUrl });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error managing subscription:", error);
    return c.json({ error: "Failed to process subscription" }, 500);
  }
});

// Cancel subscription
subscriptionRoutes.post("/subscription/cancel", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can cancel subscriptions" }, 403);
  }

  const org = membership.organization;

  if (!org.subscriptionId) {
    return c.json({ error: "No active subscription" }, 400);
  }

  try {
    await paymentProvider.cancelSubscription(org.subscriptionId);

    await prisma.organization.update({
      where: { id: orgId },
      data: { cancelAtPeriodEnd: true },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.cancelled",
      c,
    });

    return c.json({
      success: true,
      message: "Subscription will be cancelled at the end of the billing period",
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error cancelling subscription:", error);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
});

// Reactivate cancelled subscription
subscriptionRoutes.post("/subscription/reactivate", requireAuth(), async (c) => {
  const currentUser = getAuthUser(c);
  const orgId = c.req.param("orgId");

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: currentUser.id },
    },
    include: { organization: true },
  });

  if (!membership) {
    return c.json({ error: "Not a member of this organization" }, 403);
  }

  if (!canManageBilling(membership.role)) {
    return c.json({ error: "Only owners can reactivate subscriptions" }, 403);
  }

  const org = membership.organization;

  if (!org.subscriptionId) {
    return c.json({ error: "No subscription to reactivate" }, 400);
  }

  if (!org.cancelAtPeriodEnd) {
    return c.json({ error: "Subscription is not scheduled for cancellation" }, 400);
  }

  try {
    await paymentProvider.reactivateSubscription(org.subscriptionId);

    await prisma.organization.update({
      where: { id: orgId },
      data: {
        cancelAtPeriodEnd: false,
        subscriptionStatus: "ACTIVE",
      },
    });

    await logAudit({
      organizationId: orgId,
      userId: currentUser.id,
      action: "subscription.resubscribed",
      c,
    });

    return c.json({ success: true, message: "Subscription reactivated" });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error reactivating subscription:", error);
    return c.json({ error: "Failed to reactivate subscription" }, 500);
  }
});

export { subscriptionRoutes };
