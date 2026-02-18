import { Hono } from "hono";
import { cors } from "hono/cors";

// Import shared modules (db import triggers BigInt serialization side-effect)
import "./db";

import { accountRoutes } from "./routes/account";
// Route modules
import { authRoutes } from "./routes/auth";
import { feedbackRoutes } from "./routes/feedback";
import { internalRoutes } from "./routes/internal";
import { notificationRoutes } from "./routes/notifications";
import { organizationRoutes } from "./routes/organizations";
import { reposRoutes } from "./routes/repos";
import { reviewRoutes } from "./routes/reviews";
import { settingsRoutes } from "./routes/settings";
import { skillsRoutes } from "./routes/skills";
import { statsRoutes } from "./routes/stats";
import { subscriptionRoutes } from "./routes/subscriptions";
import { webhookRoutes } from "./routes/webhooks";

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || FRONTEND_URL)
  .split(",")
  .map((o) => o.trim());

const app = new Hono();

app.use(
  "*",
  cors({
    origin: ALLOWED_ORIGINS,
    credentials: true,
  })
);

// Health check
app.get("/", (c) => {
  return c.json({ status: "ok", message: "bff running" });
});

// Mount route modules
app.route("/auth", authRoutes);
app.route("/api/organizations", organizationRoutes);
app.route("/api/feedback", feedbackRoutes);
app.route("/api/internal", internalRoutes);
app.route("/api/stats", statsRoutes);
app.route("/api", webhookRoutes);
app.route("/api", accountRoutes);
app.route("/api/settings", settingsRoutes);
app.route("/api", reposRoutes);
app.route("/api", skillsRoutes);
app.route("/api", subscriptionRoutes);
app.route("/api", reviewRoutes);
app.route("/api", notificationRoutes);

const port = Number(process.env.PORT) || 3000;
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
