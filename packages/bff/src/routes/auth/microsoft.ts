/** Microsoft OAuth flow: initiates authorization and handles the callback for sign-in. */
import { Hono } from "hono";
import { Sentry } from "../../utils/sentry";
import { prisma } from "../../db";
import { getUserOrganizations } from "../../middleware/organization";
import { logAudit } from "../../services/audit";
import {
  FRONTEND_URL,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  OAUTH_CALLBACK_BASE_URL,
  PREVIEW_PR_NUMBER,
  getBaseUrl,
  getTurnstileErrorRedirect,
  sanitizeRedirectUrl,
  verifyTurnstileRequest,
} from "./utils";

const microsoftRoutes = new Hono();

microsoftRoutes.get("/", async (c) => {
  const isHuman = await verifyTurnstileRequest(c);

  if (!isHuman) {
    return c.redirect(getTurnstileErrorRedirect());
  }

  const callbackBase = OAUTH_CALLBACK_BASE_URL || getBaseUrl(c);
  const redirectUri = `${callbackBase}/auth/microsoft/callback`;
  const scope = "openid email profile User.Read";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const microsoftAuthUrl = new URL(
    "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
  );
  microsoftAuthUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
  microsoftAuthUrl.searchParams.set("redirect_uri", redirectUri);
  microsoftAuthUrl.searchParams.set("response_type", "code");
  microsoftAuthUrl.searchParams.set("scope", scope);
  microsoftAuthUrl.searchParams.set("response_mode", "query");

  const stateObj: Record<string, unknown> = {};
  if (clientRedirectUrl) stateObj.redirectUrl = clientRedirectUrl;
  if (PREVIEW_PR_NUMBER) stateObj.prNumber = PREVIEW_PR_NUMBER;
  if (Object.keys(stateObj).length > 0) {
    microsoftAuthUrl.searchParams.set(
      "state",
      Buffer.from(JSON.stringify(stateObj)).toString("base64")
    );
  }

  return c.redirect(microsoftAuthUrl.toString());
});

microsoftRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const callbackBase = OAUTH_CALLBACK_BASE_URL || getBaseUrl(c);
  const redirectUri = `${callbackBase}/auth/microsoft/callback`;

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
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          scope: "openid email profile User.Read",
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Microsoft token error:", tokenData);
      return c.redirect(
        `${FRONTEND_URL}/login?error=${tokenData.error_description || tokenData.error}`
      );
    }

    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const microsoftUser = await userResponse.json();

    if (!microsoftUser.mail && !microsoftUser.userPrincipalName) {
      return c.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    const email = microsoftUser.mail || microsoftUser.userPrincipalName;
    const login = email
      .split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    let user = await prisma.user.findFirst({
      where: {
        OR: [{ microsoftId: microsoftUser.id }, { email: email }],
      },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          microsoftId: microsoftUser.id,
          name: microsoftUser.displayName || user.name,
          login: user.login || login,
          ...(tokenData.refresh_token && { microsoftRefreshToken: tokenData.refresh_token }),
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          microsoftId: microsoftUser.id,
          login,
          name: microsoftUser.displayName,
          email: email,
          microsoftRefreshToken: tokenData.refresh_token,
        },
      });
    }

    const organizations = await getUserOrganizations(user.id);

    const authData = {
      id: microsoftUser.id,
      visitorId: user.id,
      login: user.login,
      name: user.name,
      avatar_url: user.avatarUrl,
      email: user.email,
      access_token: tokenData.access_token,
      auth_provider: "microsoft",
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
      metadata: { login: user.login, provider: "microsoft" },
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
    Sentry.captureException(error);
    console.error("Microsoft OAuth error:", error);
    return c.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
});

export { microsoftRoutes };
