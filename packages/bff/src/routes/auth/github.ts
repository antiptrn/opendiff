/** GitHub OAuth flow: initiates authorization and handles the callback for sign-in and account linking. */
import { Hono } from "hono";
import { prisma } from "../../db";
import { getUserOrganizations } from "../../middleware/organization";
import { logAudit } from "../../services/audit";
import {
  FRONTEND_URL,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  OAUTH_CALLBACK_BASE_URL,
  PREVIEW_PR_NUMBER,
  getBaseUrl,
  sanitizeRedirectUrl,
  verifyTurnstileToken,
} from "./utils";

const githubRoutes = new Hono();

githubRoutes.get("/", async (c) => {
  const turnstileToken = c.req.query("turnstileToken");
  const clientIp = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "";
  const isHuman = await verifyTurnstileToken({
    token: turnstileToken,
    ip: clientIp.split(",")[0]?.trim(),
  });

  if (!isHuman) {
    return c.redirect(
      `${FRONTEND_URL}/login?error=captcha_failed&message=${encodeURIComponent("Please complete human verification and try again.")}`
    );
  }

  const callbackBase = OAUTH_CALLBACK_BASE_URL || getBaseUrl(c);
  const redirectUri = `${callbackBase}/auth/github/callback`;
  const scope = "read:user user:email repo";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", scope);

  const stateObj: Record<string, unknown> = {};
  if (clientRedirectUrl) stateObj.redirectUrl = clientRedirectUrl;
  if (PREVIEW_PR_NUMBER) stateObj.prNumber = PREVIEW_PR_NUMBER;
  if (Object.keys(stateObj).length > 0) {
    githubAuthUrl.searchParams.set(
      "state",
      Buffer.from(JSON.stringify(stateObj)).toString("base64")
    );
  }

  return c.redirect(githubAuthUrl.toString());
});

githubRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  // Parse state for link operation or redirectUrl
  let linkOperation: { type: "link"; userId: string } | null = null;
  let clientRedirectUrl: string | null = null;
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      if (decoded.type === "link" && decoded.userId) {
        linkOperation = decoded;
      }
      if (decoded.redirectUrl) {
        clientRedirectUrl = sanitizeRedirectUrl(decoded.redirectUrl);
      }
    } catch {
      // Invalid state, ignore
    }
  }

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      const errorRedirect = linkOperation
        ? `${FRONTEND_URL}/console/settings?error=github_link_failed`
        : `${FRONTEND_URL}/login?error=${tokenData.error_description || tokenData.error}`;
      return c.redirect(errorRedirect);
    }

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    const userData = await userResponse.json();

    // Handle GitHub account linking for Google-auth users
    if (linkOperation) {
      const existingGithubUser = await prisma.user.findUnique({
        where: { githubId: userData.id },
      });

      if (existingGithubUser && existingGithubUser.id !== linkOperation.userId) {
        return c.redirect(`${FRONTEND_URL}/console/settings?error=github_already_linked`);
      }

      const existingUser = await prisma.user.findUnique({
        where: { id: linkOperation.userId },
      });

      if (!existingUser) {
        return c.redirect(`${FRONTEND_URL}/console/settings?error=user_not_found`);
      }

      const updatedUser = await prisma.user.update({
        where: { id: linkOperation.userId },
        data: {
          githubId: userData.id,
          githubAccessToken: tokenData.access_token,
          githubRefreshToken: tokenData.refresh_token,
          login: userData.login,
        },
      });

      await logAudit({
        userId: linkOperation.userId,
        action: "user.login",
        metadata: { provider: "github", action: "linked" },
        c,
      });

      // Get a fresh Google/Microsoft access token so user keeps their original session
      let sessionAccessToken: string | null = null;
      let authProvider: "google" | "microsoft" = "google";

      if (existingUser.googleRefreshToken) {
        try {
          const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              refresh_token: existingUser.googleRefreshToken,
              grant_type: "refresh_token",
            }),
          });
          const refreshData = await refreshResponse.json();
          if (refreshData.access_token) {
            sessionAccessToken = refreshData.access_token;
            authProvider = "google";
          }
        } catch (e) {
          console.error("Failed to refresh Google token during GitHub link:", e);
        }
      } else if (existingUser.microsoftRefreshToken) {
        try {
          const refreshResponse = await fetch(
            "https://login.microsoftonline.com/common/oauth2/v2.0/token",
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: MICROSOFT_CLIENT_ID,
                client_secret: MICROSOFT_CLIENT_SECRET,
                refresh_token: existingUser.microsoftRefreshToken,
                grant_type: "refresh_token",
              }),
            }
          );
          const refreshData = await refreshResponse.json();
          if (refreshData.access_token) {
            sessionAccessToken = refreshData.access_token;
            authProvider = "microsoft";
          }
        } catch (e) {
          console.error("Failed to refresh Microsoft token during GitHub link:", e);
        }
      }

      if (!sessionAccessToken) {
        sessionAccessToken = tokenData.access_token;
      }

      const organizations = await getUserOrganizations(updatedUser.id);

      const authData = {
        id: updatedUser.googleId || updatedUser.microsoftId,
        visitorId: updatedUser.id,
        login: updatedUser.login,
        name: updatedUser.name,
        avatar_url: updatedUser.avatarUrl,
        email: updatedUser.email,
        access_token: sessionAccessToken,
        auth_provider: authProvider,
        hasGithubLinked: true,
        subscriptionTier: updatedUser.subscriptionTier,
        subscriptionStatus: updatedUser.subscriptionStatus,
        accountType: updatedUser.accountType,
        onboardingCompletedAt: updatedUser.onboardingCompletedAt,
        personalOrgId: updatedUser.personalOrgId,
        organizations,
        hasOrganizations: organizations.length > 0,
      };

      const encodedUser = encodeURIComponent(JSON.stringify(authData));
      const callbackUrl = new URL(`${FRONTEND_URL}/auth/callback`);
      callbackUrl.searchParams.set("user", encodedUser);
      callbackUrl.searchParams.set("redirectUrl", "/console/settings");
      return c.redirect(callbackUrl.toString());
    }

    // Normal GitHub sign-in flow
    const emailResponse = await fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/json",
      },
    });

    const emails = await emailResponse.json();
    const primaryEmail = emails.find((e: { primary: boolean }) => e.primary)?.email;

    const email = primaryEmail || userData.email;

    let user = await prisma.user.findUnique({
      where: { githubId: userData.id },
    });

    if (user) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          login: userData.login,
          name: userData.name,
          email,
          avatarUrl: userData.avatar_url,
          ...(tokenData.refresh_token && { githubRefreshToken: tokenData.refresh_token }),
        },
      });
    } else {
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUserByEmail) {
        return c.redirect(
          `${FRONTEND_URL}/login?error=email_exists&message=${encodeURIComponent(
            "This email is already associated with another account. Please sign in with that account and link your GitHub from settings."
          )}`
        );
      }
      user = await prisma.user.create({
        data: {
          githubId: userData.id,
          login: userData.login,
          name: userData.name,
          email,
          avatarUrl: userData.avatar_url,
          githubRefreshToken: tokenData.refresh_token,
        },
      });
    }

    const organizations = await getUserOrganizations(user.id);

    const authData = {
      id: userData.id,
      visitorId: user.id,
      login: userData.login,
      name: userData.name,
      avatar_url: userData.avatar_url,
      email,
      access_token: tokenData.access_token,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      accountType: user.accountType,
      onboardingCompletedAt: user.onboardingCompletedAt,
      personalOrgId: user.personalOrgId,
      organizations,
      hasOrganizations: organizations.length > 0,
      auth_provider: "github",
      hasGithubLinked: true,
    };

    await logAudit({
      userId: user.id,
      action: "user.login",
      metadata: { login: userData.login },
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
    console.error("GitHub OAuth error:", error);
    const errorRedirect = linkOperation
      ? `${FRONTEND_URL}/console/settings?error=github_link_failed`
      : `${FRONTEND_URL}/login?error=auth_failed`;
    return c.redirect(errorRedirect);
  }
});

export { githubRoutes };
