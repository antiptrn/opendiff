import { Polar } from "@polar-sh/sdk";
import { SubscriptionTier } from "@prisma/client";
import { Hono } from "hono";
import { findDbUser, getOrgIdFromHeader, getUserFromToken } from "../auth";
import { prisma } from "../db";
import { Sentry } from "../utils/sentry";
import { getAuthUser, requireAuth } from "../middleware/auth";
import {
  TIER_HIERARCHY,
  getPaymentProviderName,
  getTokenQuotaPerSeat,
  paymentProvider,
} from "../payments";
import { logAudit } from "../services/audit";

// Direct Polar SDK client for customer-facing operations not covered by payment abstraction
const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

export const subscriptionRoutes = new Hono();

// Get user subscription status
subscriptionRoutes.get("/subscription/status", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  return c.json({
    subscriptionTier: user.subscriptionTier ?? "FREE",
    subscriptionStatus: user.subscriptionStatus ?? "INACTIVE",
    subscriptionId: user.subscriptionId,
    productId: user.productId,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    tokensUsed: Number(user.tokensUsedThisCycle ?? 0),
    tokensQuota: getTokenQuotaPerSeat(user.subscriptionTier ?? "FREE", user.productId),
  });
});

// Sync subscription status from Polar (for local dev without webhooks)
subscriptionRoutes.post("/subscription/sync", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  if (!user.email) {
    return c.json({ error: "User not found or no email" }, 404);
  }

  try {
    // Find customer by email first
    const customers = await polar.customers.list({
      email: user.email,
      limit: 1,
    });

    if (!customers.result.items.length) {
      return c.json({
        synced: true,
        subscriptionTier: "FREE",
        subscriptionStatus: "INACTIVE",
        message: "No Polar customer found",
      });
    }

    const customer = customers.result.items[0];

    // Find subscriptions for this customer
    const subscriptions = await polar.subscriptions.list({
      customerId: customer.id,
      active: true,
    });

    const activeSubscription = subscriptions.result.items[0];

    if (activeSubscription) {
      const tier = paymentProvider.getTierFromProductId(activeSubscription.productId);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: tier as SubscriptionTier,
          subscriptionStatus: "ACTIVE",
          subscriptionId: activeSubscription.id,
          productId: activeSubscription.productId,
          subscriptionExpiresAt: activeSubscription.currentPeriodEnd
            ? new Date(activeSubscription.currentPeriodEnd)
            : null,
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd ?? false,
        },
      });

      return c.json({
        synced: true,
        subscriptionTier: tier,
        subscriptionStatus: "ACTIVE",
        productId: activeSubscription.productId,
      });
    }
    return c.json({
      synced: true,
      subscriptionTier: "FREE",
      subscriptionStatus: "INACTIVE",
      message: "No active subscription found",
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error syncing subscription:", error);
    return c.json({ error: "Failed to sync subscription" }, 500);
  }
});

// Debug: Get actual subscription status from Polar
subscriptionRoutes.get("/subscription/debug", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  const result: Record<string, unknown> = {
    database: {
      subscriptionId: user.subscriptionId,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    },
    polar: null as unknown,
  };

  if (user.subscriptionId) {
    try {
      const subscription = await polar.subscriptions.get({
        id: user.subscriptionId,
      });
      result.polar = {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
        productId: subscription.productId,
      };
    } catch (error) {
      result.polar = { error: String(error) };
    }
  }

  return c.json(result);
});

// Create checkout session for subscription
subscriptionRoutes.post("/subscription/create", async (c) => {
  const authHeader = c.req.header("Authorization");
  const body = await c.req.json();
  const { productId } = body;

  if (!productId) {
    return c.json({ error: "productId is required" }, 400);
  }

  // Check if user is authenticated
  let user = null;
  let githubUser = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    githubUser = await getUserFromToken(token);

    if (githubUser) {
      user = await findDbUser(githubUser);
    }
  }

  // If user has active subscription, handle upgrade/downgrade/billing switch
  if (user?.subscriptionId && user.subscriptionStatus === "ACTIVE") {
    // Check if trying to switch to the exact same product (same tier AND billing interval)
    if (user.productId === productId) {
      return c.json({ error: "Already on this plan" }, 400);
    }

    const newTier = paymentProvider.getTierFromProductId(productId);
    const currentTierLevel = TIER_HIERARCHY[user.subscriptionTier ?? "FREE"];
    const newTierLevel = TIER_HIERARCHY[newTier];

    try {
      // If subscription is set to cancel, first uncancel it
      if (user.cancelAtPeriodEnd) {
        await polar.subscriptions.update({
          id: user.subscriptionId,
          subscriptionUpdate: {
            cancelAtPeriodEnd: false,
          },
        });
      }

      // Update existing subscription to new product
      await polar.subscriptions.update({
        id: user.subscriptionId,
        subscriptionUpdate: {
          productId: productId,
        },
      });

      // Update user in database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: newTier as SubscriptionTier,
          productId: productId,
          cancelAtPeriodEnd: false,
        },
      });

      const changeType = newTierLevel > currentTierLevel ? "upgrade" : "downgrade";
      await logAudit({
        organizationId: getOrgIdFromHeader(c),
        userId: user.id,
        action: "subscription.updated",
        metadata: { fromTier: user.subscriptionTier, toTier: newTier, changeType },
        c,
      });

      return c.json({
        subscriptionUpdated: true,
        productId: productId,
        type: changeType,
      });
    } catch (error: unknown) {
      // If subscription is already cancelled on Polar's side, fall through to create new checkout
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("AlreadyCanceledSubscription")) {
        console.log("Subscription already cancelled on Polar, creating new checkout");
        // Clear the old subscription ID since it's cancelled
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionId: null,
            subscriptionStatus: "CANCELLED",
            cancelAtPeriodEnd: false,
          },
        });
        // Fall through to create new checkout below
      } else {
        Sentry.captureException(error);
        console.error("Error updating subscription:", error);
        return c.json({ error: "Failed to update subscription" }, 500);
      }
    }
  }

  // Create new checkout
  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${FRONTEND_URL}/subscription/success?checkout_id={CHECKOUT_ID}`,
      customerEmail: user?.email || githubUser?.email || undefined,
      customerName: user?.name || githubUser?.name || undefined,
      metadata: {
        userId: user?.id || "",
        githubId: String(githubUser?.id || ""),
      },
    });

    return c.json({
      checkoutUrl: checkout.url,
      requiresAuth: !user,
    });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error creating checkout:", error);
    return c.json({ error: "Failed to create checkout" }, 500);
  }
});

// Get all billing data (subscription + orders) in one call
subscriptionRoutes.get("/billing", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  // Build subscription info from database
  const subscription = {
    tier: user.subscriptionTier,
    status: user.subscriptionStatus,
    expiresAt: user.subscriptionExpiresAt,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
  };

  // If no email, can't fetch orders
  if (!user.email) {
    return c.json({ subscription, orders: [] });
  }

  try {
    const providerName = getPaymentProviderName();
    let formattedOrders: Array<{
      id: string;
      createdAt: string;
      amount: number;
      currency: string;
      status: string;
      productName: string;
    }> = [];

    if (providerName === "stripe") {
      // Fetch invoices from Stripe
      const { getStripe } = await import("../payments/stripe");
      const stripe = getStripe();

      // Find customer by email
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        const customer = customers.data[0];

        // Fetch invoices for this customer
        const invoices = await stripe.invoices.list({
          customer: customer.id,
          limit: 50,
        });

        formattedOrders = invoices.data.map((invoice) => ({
          id: invoice.id,
          createdAt: new Date(invoice.created * 1000).toISOString(),
          amount: invoice.amount_paid || 0,
          currency: invoice.currency || "usd",
          status: invoice.status || "paid",
          productName: invoice.lines.data[0]?.description || "Subscription",
        }));
      }
    } else {
      // Use Polar (default)
      // Get user's Polar customer ID by looking up by email
      const customers = await polar.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.result.items.length > 0) {
        const customer = customers.result.items[0];

        // Fetch orders for this customer
        const orders = await polar.orders.list({
          customerId: customer.id,
          limit: 50,
        });

        // Map orders to a simpler format
        formattedOrders = orders.result.items.map((order) => ({
          id: order.id,
          createdAt: String(order.createdAt),
          amount: order.totalAmount,
          currency: order.currency,
          status: String(order.billingReason),
          productName: order.product.name,
        }));
      }
    }

    return c.json({ subscription, orders: formattedOrders });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error fetching billing data:", error);
    // Still return subscription info even if orders fail
    return c.json({ subscription, orders: [] });
  }
});

// Get invoice URL for an order
subscriptionRoutes.get("/billing/invoice/:orderId", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  if (!user?.email) {
    return c.json({ error: "User not found" }, 404);
  }

  const orderId = c.req.param("orderId");

  try {
    const providerName = getPaymentProviderName();
    let invoiceUrl: string | null = null;

    if (providerName === "stripe") {
      // Fetch invoice from Stripe
      const { getStripe } = await import("../payments/stripe");
      const stripe = getStripe();

      const invoice = await stripe.invoices.retrieve(orderId);

      // Verify this invoice belongs to the user by checking customer email
      if (invoice.customer_email !== user.email) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      invoiceUrl = invoice.hosted_invoice_url || invoice.invoice_pdf || null;
    } else {
      // Use Polar (default)
      // Verify this order belongs to the user by checking customer email
      const order = await polar.orders.get({ id: orderId });

      if (order.customer.email !== user.email) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Get the invoice URL
      const invoice = await polar.orders.invoice({ id: orderId });
      invoiceUrl = invoice.url;
    }

    if (!invoiceUrl) {
      return c.json({ error: "Invoice URL not available" }, 404);
    }

    return c.json({ invoiceUrl });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error fetching invoice:", error);
    return c.json({ error: "Failed to fetch invoice" }, 500);
  }
});

// Cancel subscription
subscriptionRoutes.post("/subscription/cancel", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  if (!user?.subscriptionId) {
    return c.json({ error: "No active subscription" }, 400);
  }

  try {
    // Cancel at period end
    await polar.subscriptions.update({
      id: user.subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { cancelAtPeriodEnd: true },
    });

    await logAudit({
      organizationId: getOrgIdFromHeader(c),
      userId: user.id,
      action: "subscription.cancelled",
      metadata: { tier: user.subscriptionTier },
      c,
    });

    return c.json({ success: true, message: "Subscription will cancel at period end" });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If already cancelled, update our database to match
    if (errorMessage.includes("AlreadyCanceledSubscription")) {
      await prisma.user.update({
        where: { id: user.id },
        data: { cancelAtPeriodEnd: true },
      });
      return c.json({ success: true, message: "Subscription is already set to cancel" });
    }

    Sentry.captureException(error);
    console.error("Error canceling subscription:", error);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
});

// Resubscribe (uncancel) subscription
subscriptionRoutes.post("/subscription/resubscribe", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  if (!user?.subscriptionId) {
    return c.json({ error: "No subscription to reactivate" }, 400);
  }

  if (!user.cancelAtPeriodEnd) {
    return c.json({ error: "Subscription is not scheduled for cancellation" }, 400);
  }

  try {
    // Uncancel by setting cancelAtPeriodEnd to false
    await polar.subscriptions.update({
      id: user.subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: false,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        cancelAtPeriodEnd: false,
        subscriptionStatus: "ACTIVE",
      },
    });

    await logAudit({
      organizationId: getOrgIdFromHeader(c),
      userId: user.id,
      action: "subscription.resubscribed",
      metadata: { tier: user.subscriptionTier },
      c,
    });

    return c.json({ success: true, message: "Subscription reactivated" });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Error resubscribing:", error);
    return c.json({ error: "Failed to reactivate subscription" }, 500);
  }
});
