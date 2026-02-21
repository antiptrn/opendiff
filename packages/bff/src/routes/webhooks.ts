import { Hono } from "hono";
import { Sentry } from "../utils/sentry";

const webhookRoutes = new Hono();

// Unified webhook handler - works with both Polar and Stripe
webhookRoutes.post("/webhooks/:provider", async (c) => {
  const provider = c.req.param("provider");

  // Validate provider
  if (provider !== "polar" && provider !== "stripe") {
    return c.json({ error: "Invalid provider" }, 400);
  }

  const body = await c.req.text();
  const headers: Record<string, string> = {};

  // Collect relevant headers for each provider
  if (provider === "polar") {
    headers["webhook-signature"] = c.req.header("webhook-signature") || "";
  } else if (provider === "stripe") {
    headers["stripe-signature"] = c.req.header("stripe-signature") || "";
  }

  console.log(`Received ${provider} webhook`);

  try {
    // Use the unified webhook processor
    // It will parse the payload based on provider and handle the event
    const { polarProvider } = await import("../payments/polar");
    const { stripeProvider } = await import("../payments/stripe");
    const { handleWebhookEvent } = await import("../payments/webhook-handler");

    const providerImpl = provider === "stripe" ? stripeProvider : polarProvider;
    const event = await providerImpl.parseWebhook(body, headers);
    await handleWebhookEvent(event);

    return c.json({ received: true });
  } catch (error) {
    Sentry.captureException(error);
    console.error(`${provider} webhook handler error:`, error);
    return c.json({ error: "Webhook handler failed" }, 500);
  }
});

// Legacy Polar webhook handler support (redirects to unified handler)
// Keep for backwards compatibility during migration
webhookRoutes.post("/polar/webhook", async (c) => {
  // Forward to unified handler
  const body = await c.req.text();
  const headers: Record<string, string> = {
    "webhook-signature": c.req.header("webhook-signature") || "",
  };

  try {
    const { polarProvider } = await import("../payments/polar");
    const { handleWebhookEvent } = await import("../payments/webhook-handler");

    const event = await polarProvider.parseWebhook(body, headers);
    await handleWebhookEvent(event);

    return c.json({ received: true });
  } catch (error) {
    Sentry.captureException(error);
    console.error("Polar webhook handler error:", error);
    return c.json({ error: "Webhook handler failed" }, 500);
  }
});

export { webhookRoutes };
