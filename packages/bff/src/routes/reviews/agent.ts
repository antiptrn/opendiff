/** Review agent recording endpoints — migrated to /api/internal routes. This file is kept for the route structure. */
import { Hono } from "hono";

const agentRoutes = new Hono();

// Agent endpoints (POST /reviews, POST /reviews/:id/comments) are now served
// via /api/internal routes in internal.ts for proper API-key auth isolation.

export { agentRoutes };
