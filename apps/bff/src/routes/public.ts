/** Unauthenticated, cacheable endpoints for the marketing site. */
import { Hono } from "hono";
import { getPublicStats, type PublicStats } from "../services/public-stats";

export function createPublicRoutes(getStats: () => Promise<PublicStats>) {
  const routes = new Hono();

  routes.get("/stats", async (c) => {
    const stats = await getStats();

    // Public aggregate fetched without credentials, so any origin may read it
    c.header("Access-Control-Allow-Origin", "*");
    c.header("Cache-Control", "public, max-age=60");
    return c.json(stats);
  });

  return routes;
}

const publicRoutes = createPublicRoutes(getPublicStats);

export { publicRoutes };
