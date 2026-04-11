/** GitHub account linking and unlinking for users authenticated via Google or Microsoft. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { getAuthUser, requireAuth } from "../../middleware/auth";
import { GITHUB_CLIENT_ID, getBaseUrl } from "./utils";

const linkingRoutes = new Hono();

linkingRoutes.get("/link", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  const redirectUri = `${getBaseUrl(c)}/auth/github/callback`;
  const scope = "read:user user:email repo";
  const state = Buffer.from(JSON.stringify({ type: "link", userId: user.id })).toString("base64");

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", scope);
  githubAuthUrl.searchParams.set("state", state);

  return c.json({ url: githubAuthUrl.toString() });
});

linkingRoutes.delete("/unlink", requireAuth(), async (c) => {
  const user = getAuthUser(c);

  if (!user.googleId && !user.microsoftId) {
    return c.json({ error: "Only Google or Microsoft users can unlink GitHub" }, 400);
  }

  if (!user.githubId) {
    return c.json({ error: "GitHub is not linked" }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      githubId: null,
      githubAccessToken: null,
    },
  });

  return c.json({ success: true });
});

export { linkingRoutes };
