import { Hono } from "hono";
import { agentRoutes } from "./agent";
import { localRoutes } from "./local";
import { queryRoutes } from "./queries";

const reviewRoutes = new Hono();

reviewRoutes.route("/", localRoutes);
reviewRoutes.route("/", agentRoutes);
reviewRoutes.route("/", queryRoutes);

export { reviewRoutes };
