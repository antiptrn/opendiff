/** Google OAuth flow: initiates authorization and handles the callback for sign-in. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { getUserOrganizations } from "../../middleware/organization";
import { logAudit } from "../../services/audit";
import {
  FRONTEND_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  OAUTH_CALLBACK_BASE_URL,
  PREVIEW_PR_NUMBER,
  getBaseUrl,
  getTurnstileErrorRedirect,
  sanitizeRedirectUrl,
  verifyTurnstileRequest,
} from "./utils";

const googleRoutes = new Hono();

googleRoutes.get("/", async (c) => {
  const isHuman = await verifyTurnstileRequest(c);

  if (!isHuman) {
    return c.redirect(getTurnstileErrorRedirect());
  }

  const callbackBase = OAUTH_CALLBACK_BASE_URL || getBaseUrl(c);
  const redirectUri = `${callbackBase}/auth/google/callback`;
  const scope = "openid email profile";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", scope);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");

  const stateObj: Record<string, unknown> = {};
  if (clientRedirectUrl) stateObj.redirectUrl = clientRedirectUrl;
  if (PREVIEW_PR_NUMBER) stateObj.prNumber = PREVIEW_PR_NUMBER;
  if (Object.keys(stateObj).length > 0) {
    googleAuthUrl.searchParams.set(
      "state",
      Buffer.from(JSON.stringify(stateObj)).toString("base64")
    );
  }

  return c.redirect(googleAuthUrl.toString());
});

googleRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const callbackBase = OAUTH_CALLBACK_BASE_URL || getBaseUrl(c);
  const redirectUri = `${callbackBase}/auth/google/callback`;

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  let clientRedirectUrl: string | null = null;
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      if (decoded.redirectUrl) {
        clientRedirectUrl = sanitizeRedirectUrl(decoded.redirectUrl);
      }
    } catch {
      // Invalid state, ignore
    }
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Google token error:", tokenData);
      return c.redirect(
        `${FRONTEND_URL}/login?error=${tokenData.error_description || tokenData.error}`
      );
    }

    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userResponse.json();

    if (!googleUser.email) {
      return c.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    const login = googleUser.email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ googleId: googleUser.id }, { email: googleUser.email }],
      },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleUser.id,
          name: googleUser.name || user.name,
          avatarUrl: googleUser.picture || user.avatarUrl,
          login: user.login || login,
          ...(tokenData.refresh_token && { googleRefreshToken: tokenData.refresh_token }),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          googleId: googleUser.id,
          login,
          name: googleUser.name,
          email: googleUser.email,
          avatarUrl: googleUser.picture,
          googleRefreshToken: tokenData.refresh_token,
        },
      });
    }

    const organizations = await getUserOrganizations(user.id);

    const authData = {
      id: googleUser.id,
      visitorId: user.id,
      login: user.login,
      name: user.name,
      avatar_url: user.avatarUrl,
      email: user.email,
      access_token: tokenData.access_token,
      auth_provider: "google",
      hasGithubLinked: !!user.githubId,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      accountType: user.accountType,
      onboardingCompletedAt: user.onboardingCompletedAt,
      personalOrgId: user.personalOrgId,
      organizations,
      hasOrganizations: organizations.length > 0,
    };

    await logAudit({
      userId: user.id,
      action: "user.login",
      metadata: { login: user.login, provider: "google" },
      c,
    });

    const encodedUser = encodeURIComponent(JSON.stringify(authData));
    const callbackUrl = new URL(`${FRONTEND_URL}/auth/callback`);
    callbackUrl.searchParams.set("user", encodedUser);
    if (clientRedirectUrl) {
      callbackUrl.searchParams.set("redirectUrl", clientRedirectUrl);
    }
    return c.redirect(callbackUrl.toString());
  } catch (error) {
    console.error("Google OAuth error:", error);
    return c.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
});

export { googleRoutes };
