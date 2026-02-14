import { Hono } from "hono";
import { githubRoutes } from "./github";
import { googleRoutes } from "./google";
import { linkingRoutes } from "./linking";
import { microsoftRoutes } from "./microsoft";
import { tokenRoutes } from "./token";

const authRoutes = new Hono();

// GitHub OAuth: GET /github, GET /github/callback
authRoutes.route("/github", githubRoutes);

// Google OAuth: GET /google, GET /google/callback
authRoutes.route("/google", googleRoutes);

// Microsoft OAuth: GET /microsoft, GET /microsoft/callback
authRoutes.route("/microsoft", microsoftRoutes);

// GitHub linking/unlinking: GET /github/link, DELETE /github/unlink
authRoutes.route("/github", linkingRoutes);

// Token refresh + user info: POST /refresh, GET /user
authRoutes.route("/", tokenRoutes);

export { authRoutes };
