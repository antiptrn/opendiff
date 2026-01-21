import { Hono } from "hono";
import { cors } from "hono/cors";
import { PrismaClient, SubscriptionTier, SubscriptionStatus } from "@prisma/client";
import { polar, getTierFromProductId, TIER_HIERARCHY } from "./lib/polar";

const prisma = new PrismaClient();
const app = new Hono();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Helper to get user from GitHub token
async function getUserFromToken(token: string) {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) {
    return null;
  }

  return userResponse.json();
}

app.use(
  "*",
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "antiptrn-server running" });
});

app.get("/auth/github", (c) => {
  const redirectUri = `${c.req.url.split("/auth/github")[0]}/auth/github/callback`;
  const scope = "read:user user:email repo";

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", scope);

  return c.redirect(githubAuthUrl.toString());
});

app.get("/auth/github/callback", async (c) => {
  const code = c.req.query("code");

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  try {
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return c.redirect(
        `${FRONTEND_URL}/login?error=${tokenData.error_description || tokenData.error}`
      );
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    const userData = await userResponse.json();

    const emailResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    const emails = await emailResponse.json();
    const primaryEmail = emails.find(
      (e: { primary: boolean }) => e.primary
    )?.email;

    // Upsert user in database
    const user = await prisma.user.upsert({
      where: { githubId: userData.id },
      update: {
        login: userData.login,
        name: userData.name,
        email: primaryEmail || userData.email,
        avatarUrl: userData.avatar_url,
      },
      create: {
        githubId: userData.id,
        login: userData.login,
        name: userData.name,
        email: primaryEmail || userData.email,
        avatarUrl: userData.avatar_url,
      },
    });

    const authData = {
      id: userData.id,
      visitorId: user.id,
      login: userData.login,
      name: userData.name,
      avatar_url: userData.avatar_url,
      email: primaryEmail || userData.email,
      access_token: tokenData.access_token,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
    };

    const encodedUser = encodeURIComponent(JSON.stringify(authData));
    return c.redirect(`${FRONTEND_URL}/auth/callback?user=${encodedUser}`);
  } catch (error) {
    console.error("GitHub OAuth error:", error);
    return c.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
});

app.get("/auth/user", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!userResponse.ok) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const userData = await userResponse.json();
    return c.json(userData);
  } catch {
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

// Fetch user's repositories with optional search
app.get("/api/repos", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const query = c.req.query("q") || "";

  try {
    // Fetch user's repos (includes repos they have access to)
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, reposResponse.status);
    }

    const repos = await reposResponse.json();

    // Filter by search query if provided
    const filteredRepos = query
      ? repos.filter((repo: { full_name: string }) =>
          repo.full_name.toLowerCase().includes(query.toLowerCase())
        )
      : repos;

    // Return simplified repo data
    return c.json(
      filteredRepos.slice(0, 50).map((repo: { full_name: string; owner: { login: string }; name: string; private: boolean }) => ({
        full_name: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        private: repo.private,
      }))
    );
  } catch {
    return c.json({ error: "Failed to fetch repos" }, 500);
  }
});

// Repository settings endpoints

// Get all activated repos for user
app.get("/api/settings", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    // Get repos the user has access to
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, reposResponse.status);
    }

    const repos = await reposResponse.json();
    const repoIdentifiers = repos.map((r: { owner: { login: string }; name: string }) => ({
      owner: r.owner.login,
      repo: r.name,
    }));

    // Get the current user's subscription info
    const githubUser = await getUserFromToken(token);
    const user = githubUser ? await prisma.user.findUnique({
      where: { githubId: githubUser.id },
    }) : null;

    const tier = user?.subscriptionTier || "FREE";
    const hasActiveSubscription = user?.subscriptionStatus === "ACTIVE";
    const canEnableReviews = hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE");
    const canEnableTriage = hasActiveSubscription && tier === "TRIAGE";

    // Get settings for user's repos that are enabled
    const settings = await prisma.repositorySettings.findMany({
      where: {
        AND: [
          {
            OR: repoIdentifiers.map((r: { owner: string; repo: string }) => ({
              owner: r.owner,
              repo: r.repo,
            })),
          },
          {
            OR: [
              { enabled: true },
              { triageEnabled: true },
            ],
          },
        ],
      },
    });

    return c.json(settings.map((s) => ({
      owner: s.owner,
      repo: s.repo,
      enabled: s.enabled,
      triageEnabled: s.triageEnabled,
      effectiveEnabled: s.enabled && canEnableReviews,
      effectiveTriageEnabled: s.triageEnabled && canEnableTriage,
    })));
  } catch (error) {
    console.error("Error fetching activated repos:", error);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

app.get("/api/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();

  const settings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
    include: { user: true },
  });

  // Return default settings (disabled) if no record exists
  // Features require explicit enabling by a subscriber
  if (!settings) {
    return c.json({
      owner,
      repo,
      enabled: false,
      triageEnabled: false,
      effectiveEnabled: false,
      effectiveTriageEnabled: false,
    });
  }

  // Calculate effective state based on user's subscription
  const tier = settings.user?.subscriptionTier || "FREE";
  const hasActiveSubscription = settings.user?.subscriptionStatus === "ACTIVE";
  const canEnableReviews = hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE");
  const canEnableTriage = hasActiveSubscription && tier === "TRIAGE";

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    // Effective state = stored setting AND user has permission
    effectiveEnabled: settings.enabled && canEnableReviews,
    effectiveTriageEnabled: settings.triageEnabled && canEnableTriage,
  });
});

app.put("/api/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const authHeader = c.req.header("Authorization");
  const body = await c.req.json();

  let { enabled, triageEnabled } = body;
  let userId: string | undefined;
  let canEnableReviews = false;
  let canEnableTriage = false;

  // Validate subscription tier if user is authenticated
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const githubUser = await getUserFromToken(token);

    if (githubUser) {
      const user = await prisma.user.findUnique({
        where: { githubId: githubUser.id },
      });

      if (user) {
        userId = user.id;
        const tier = user.subscriptionTier;
        const hasActiveSubscription = user.subscriptionStatus === "ACTIVE";
        canEnableReviews = hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE");
        canEnableTriage = hasActiveSubscription && tier === "TRIAGE";

        // Enforce subscription limits
        if (enabled && !canEnableReviews) {
          return c.json({
            error: "Reviews require a Code Review or Triage subscription"
          }, 403);
        }

        if (triageEnabled && !canEnableTriage) {
          return c.json({
            error: "Triage mode requires a Triage subscription"
          }, 403);
        }
      }
    }
  }

  const settings = await prisma.repositorySettings.upsert({
    where: { owner_repo: { owner, repo } },
    update: {
      enabled: enabled ?? false,
      triageEnabled: triageEnabled ?? false,
      userId: userId,
    },
    create: {
      owner,
      repo,
      enabled: enabled ?? false,
      triageEnabled: triageEnabled ?? false,
      userId: userId,
    },
  });

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    effectiveEnabled: settings.enabled && canEnableReviews,
    effectiveTriageEnabled: settings.triageEnabled && canEnableTriage,
  });
});

// ==================== STATS ENDPOINTS ====================

// Get dashboard stats for authenticated user
app.get("/api/stats", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  try {
    // Get repos the user has access to
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, reposResponse.status);
    }

    const repos = await reposResponse.json();
    const repoNames = repos.map((r: { owner: { login: string }; name: string }) => ({
      owner: r.owner.login,
      repo: r.name,
    }));

    // Count connected repos (repos with enabled=true OR triageEnabled=true)
    const connectedRepos = await prisma.repositorySettings.count({
      where: {
        OR: repoNames.map((r: { owner: string; repo: string }) => ({
          owner: r.owner,
          repo: r.repo,
          OR: [
            { enabled: true },
            { triageEnabled: true },
          ],
        })),
      },
    });

    // Count reviews for user's repos
    const reviewCount = await prisma.review.count({
      where: {
        OR: repoNames.map((r: { owner: string; repo: string }) => ({
          owner: r.owner,
          repo: r.repo,
        })),
      },
    });

    return c.json({
      reviewCount,
      connectedRepos,
      totalRepos: repos.length,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

// Record a review (called by review agent)
app.post("/api/reviews", async (c) => {
  const body = await c.req.json();
  const { owner, repo, pullNumber, reviewType, reviewId, commentId, apiKey } = body;

  // Validate API key for review agent
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (expectedApiKey && apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!owner || !repo || !pullNumber || !reviewType) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    const review = await prisma.review.create({
      data: {
        owner,
        repo,
        pullNumber,
        reviewType,
        reviewId: reviewId || null,
        commentId: commentId || null,
      },
    });

    return c.json({ id: review.id, created: true });
  } catch (error) {
    console.error("Error recording review:", error);
    return c.json({ error: "Failed to record review" }, 500);
  }
});

// ==================== SUBSCRIPTION ENDPOINTS ====================

// Get user subscription status
app.get("/api/subscription/status", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { githubId: githubUser.id },
  });

  if (!user) {
    return c.json({
      subscriptionTier: "FREE",
      subscriptionStatus: "INACTIVE",
      polarSubscriptionId: null,
    });
  }

  return c.json({
    subscriptionTier: user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    polarSubscriptionId: user.polarSubscriptionId,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
  });
});

// Sync subscription status from Polar (for local dev without webhooks)
app.post("/api/subscription/sync", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { githubId: githubUser.id },
  });

  if (!user || !user.email) {
    return c.json({ error: "User not found or no email" }, 404);
  }

  try {
    // Find subscriptions for this customer by email
    const subscriptions = await polar.subscriptions.list({
      customerEmail: user.email,
      active: true,
    });

    const activeSubscription = subscriptions.result.items[0];

    if (activeSubscription) {
      const tier = getTierFromProductId(activeSubscription.productId);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: tier as SubscriptionTier,
          subscriptionStatus: "ACTIVE",
          polarSubscriptionId: activeSubscription.id,
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
      });
    } else {
      return c.json({
        synced: true,
        subscriptionTier: "FREE",
        subscriptionStatus: "INACTIVE",
        message: "No active subscription found",
      });
    }
  } catch (error) {
    console.error("Error syncing subscription:", error);
    return c.json({ error: "Failed to sync subscription" }, 500);
  }
});

// Create checkout session for subscription
app.post("/api/subscription/create", async (c) => {
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
      user = await prisma.user.findUnique({
        where: { githubId: githubUser.id },
      });
    }
  }

  // If user has active subscription, handle upgrade/downgrade
  if (user?.polarSubscriptionId && user.subscriptionStatus === "ACTIVE") {
    const newTier = getTierFromProductId(productId);
    const currentTierLevel = TIER_HIERARCHY[user.subscriptionTier];
    const newTierLevel = TIER_HIERARCHY[newTier];

    if (newTierLevel === currentTierLevel) {
      return c.json({ error: "Already on this plan" }, 400);
    }

    try {
      // Update existing subscription
      await polar.subscriptions.update({
        id: user.polarSubscriptionId,
        subscriptionUpdate: {
          productId: productId,
        },
      });

      // Update user in database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: newTier as SubscriptionTier,
          cancelAtPeriodEnd: false,
        },
      });

      return c.json({
        subscriptionUpdated: true,
        type: newTierLevel > currentTierLevel ? "upgrade" : "downgrade",
      });
    } catch (error) {
      console.error("Error updating subscription:", error);
      return c.json({ error: "Failed to update subscription" }, 500);
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
    console.error("Error creating checkout:", error);
    return c.json({ error: "Failed to create checkout" }, 500);
  }
});

// Get all billing data (subscription + orders) in one call
app.get("/api/billing", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { githubId: githubUser.id },
  });

  // Default response for users without subscription
  const defaultResponse = {
    subscription: {
      tier: "FREE" as const,
      status: "INACTIVE" as const,
      expiresAt: null,
      cancelAtPeriodEnd: false,
    },
    orders: [],
  };

  if (!user) {
    return c.json(defaultResponse);
  }

  // Build subscription info from database
  const subscription = {
    tier: user.subscriptionTier,
    status: user.subscriptionStatus,
    expiresAt: user.subscriptionExpiresAt,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
  };

  // If no email, can't fetch orders from Polar
  if (!user.email) {
    return c.json({ subscription, orders: [] });
  }

  try {
    // Get user's Polar customer ID by looking up by email
    const customers = await polar.customers.list({
      email: user.email,
      limit: 1,
    });

    if (!customers.result.items.length) {
      return c.json({ subscription, orders: [] });
    }

    const customer = customers.result.items[0];

    // Fetch orders for this customer
    const orders = await polar.orders.list({
      customerId: customer.id,
      limit: 50,
    });

    // Map orders to a simpler format
    const formattedOrders = orders.result.items.map((order) => ({
      id: order.id,
      createdAt: order.createdAt,
      amount: order.totalAmount,
      currency: order.currency,
      status: order.billingReason,
      productName: order.product.name,
    }));

    return c.json({ subscription, orders: formattedOrders });
  } catch (error) {
    console.error("Error fetching billing data:", error);
    // Still return subscription info even if orders fail
    return c.json({ subscription, orders: [] });
  }
});

// Get invoice URL for an order
app.get("/api/billing/invoice/:orderId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { githubId: githubUser.id },
  });

  if (!user?.email) {
    return c.json({ error: "User not found" }, 404);
  }

  const orderId = c.req.param("orderId");

  try {
    // Verify this order belongs to the user by checking customer email
    const order = await polar.orders.get({ id: orderId });

    if (order.customer.email !== user.email) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // Get the invoice URL
    const invoice = await polar.orders.invoice({ id: orderId });

    return c.json({ invoiceUrl: invoice.url });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return c.json({ error: "Failed to fetch invoice" }, 500);
  }
});

// Cancel subscription
app.post("/api/subscription/cancel", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: { githubId: githubUser.id },
  });

  if (!user?.polarSubscriptionId) {
    return c.json({ error: "No active subscription" }, 400);
  }

  try {
    // Cancel at period end
    await polar.subscriptions.update({
      id: user.polarSubscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { cancelAtPeriodEnd: true },
    });

    return c.json({ success: true, message: "Subscription will cancel at period end" });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
});

// Polar webhook handler
app.post("/api/webhooks/polar", async (c) => {
  const body = await c.req.text();
  const signature = c.req.header("webhook-signature") || "";

  // TODO: Verify webhook signature in production
  // const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const eventType = payload.type;
  console.log(`Received Polar webhook: ${eventType}`);

  try {
    switch (eventType) {
      case "checkout.created":
        // Checkout started - no action needed
        break;

      case "checkout.updated":
        // Checkout updated - handle completion
        if (payload.data.status === "succeeded") {
          const checkout = payload.data;
          const email = checkout.customer_email;
          const productId = checkout.product_id;
          const subscriptionId = checkout.subscription_id;

          if (email && subscriptionId) {
            const user = await prisma.user.findFirst({
              where: { email },
            });

            if (user) {
              const tier = getTierFromProductId(productId);
              await prisma.user.update({
                where: { id: user.id },
                data: {
                  subscriptionTier: tier as SubscriptionTier,
                  subscriptionStatus: "ACTIVE",
                  polarSubscriptionId: subscriptionId,
                  cancelAtPeriodEnd: false,
                },
              });
              console.log(`Activated subscription for user ${user.login}: ${tier}`);
            }
          }
        }
        break;

      case "subscription.created":
      case "subscription.updated": {
        const subscription = payload.data;
        const subscriptionId = subscription.id;
        const productId = subscription.product_id;
        const status = subscription.status;
        const email = subscription.customer?.email;

        // Find user by subscription ID or email
        let user = await prisma.user.findFirst({
          where: { polarSubscriptionId: subscriptionId },
        });

        if (!user && email) {
          user = await prisma.user.findFirst({
            where: { email },
          });
        }

        if (user) {
          const tier = getTierFromProductId(productId);
          const mappedStatus = status === "active" ? "ACTIVE" :
                              status === "canceled" ? "CANCELLED" :
                              status === "past_due" ? "PAST_DUE" : "INACTIVE";

          await prisma.user.update({
            where: { id: user.id },
            data: {
              subscriptionTier: mappedStatus === "ACTIVE" ? tier as SubscriptionTier : user.subscriptionTier,
              subscriptionStatus: mappedStatus as SubscriptionStatus,
              polarSubscriptionId: subscriptionId,
              cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
              subscriptionExpiresAt: subscription.current_period_end ? new Date(subscription.current_period_end) : null,
            },
          });
          console.log(`Updated subscription for user ${user.login}: ${tier}, status: ${mappedStatus}`);
        }
        break;
      }

      case "subscription.canceled":
      case "subscription.revoked": {
        const subscription = payload.data;
        const subscriptionId = subscription.id;

        const user = await prisma.user.findFirst({
          where: { polarSubscriptionId: subscriptionId },
        });

        if (user) {
          // Check if subscription has fully ended
          const endedAt = subscription.ended_at;
          if (endedAt && new Date(endedAt) <= new Date()) {
            // Subscription has ended - downgrade to FREE
            await prisma.user.update({
              where: { id: user.id },
              data: {
                subscriptionTier: "FREE",
                subscriptionStatus: "CANCELLED",
                polarSubscriptionId: null,
                cancelAtPeriodEnd: false,
              },
            });
            console.log(`Subscription ended for user ${user.login}, downgraded to FREE`);
          } else {
            // Subscription will end later
            await prisma.user.update({
              where: { id: user.id },
              data: {
                subscriptionStatus: "CANCELLED",
                cancelAtPeriodEnd: true,
              },
            });
            console.log(`Subscription marked for cancellation for user ${user.login}`);
          }
        }
        break;
      }

      case "order.paid": {
        // Primary event for successful payments
        const order = payload.data;
        const email = order.customer?.email;
        const productId = order.product_id;
        const subscriptionId = order.subscription_id;

        if (email && subscriptionId) {
          const user = await prisma.user.findFirst({
            where: { email },
          });

          if (user) {
            const tier = getTierFromProductId(productId);
            await prisma.user.update({
              where: { id: user.id },
              data: {
                subscriptionTier: tier as SubscriptionTier,
                subscriptionStatus: "ACTIVE",
                polarSubscriptionId: subscriptionId,
                cancelAtPeriodEnd: false,
              },
            });
            console.log(`Order paid - activated subscription for user ${user.login}: ${tier}`);
          }
        }
        break;
      }

      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }

    return c.json({ received: true });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return c.json({ error: "Webhook handler failed" }, 500);
  }
});

const port = Number(process.env.PORT) || 3000;
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
