import { Hono } from "hono";
import { auditRoutes } from "./audit";
import { crudRoutes } from "./crud";
import { inviteRoutes, publicInviteRoutes } from "./invites";
import { memberRoutes } from "./members";
import { seatRoutes } from "./seats";
import { subscriptionRoutes } from "./subscriptions";

const organizationRoutes = new Hono();

// CRUD routes: /, /:orgId, /:orgId/avatar
organizationRoutes.route("/", crudRoutes);

// Public invite endpoints: /invites/:token, /invites/:token/accept
// Must be before the /:orgId sub-routes to avoid /:orgId capturing "invites"
organizationRoutes.route("/invites", publicInviteRoutes);

// Org-scoped sub-routes (mounted at /:orgId)
organizationRoutes.route("/:orgId", memberRoutes);
organizationRoutes.route("/:orgId", subscriptionRoutes);
organizationRoutes.route("/:orgId", seatRoutes);
organizationRoutes.route("/:orgId", auditRoutes);
organizationRoutes.route("/:orgId", inviteRoutes);

export { organizationRoutes };
