import { Hono } from "hono";
import { logAudit } from "../audit";
import { findDbUser, getUserFromToken } from "../auth";
import { prisma } from "../db";
import { getUserOrganizations } from "../middleware/organization";

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";

const authRoutes = new Hono();

function getBaseUrl(c: { req: { url: string; header: (name: string) => string | undefined } }) {
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${url.host}`;
}

// ==================== GitHub OAuth ====================

authRoutes.get("/github", (c) => {
  const redirectUri = `${getBaseUrl(c)}/auth/github/callback`;
  const scope = "read:user user:email repo";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", scope);

  if (clientRedirectUrl) {
    const state = Buffer.from(JSON.stringify({ redirectUrl: clientRedirectUrl })).toString(
      "base64"
    );
    githubAuthUrl.searchParams.set("state", state);
  }

  return c.redirect(githubAuthUrl.toString());
});

authRoutes.get("/github/callback", async (c) => {
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
        clientRedirectUrl = decoded.redirectUrl;
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

// ==================== Google OAuth ====================

authRoutes.get("/google", (c) => {
  const redirectUri = `${getBaseUrl(c)}/auth/google/callback`;
  const scope = "openid email profile";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", scope);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent");

  if (clientRedirectUrl) {
    const state = Buffer.from(JSON.stringify({ redirectUrl: clientRedirectUrl })).toString(
      "base64"
    );
    googleAuthUrl.searchParams.set("state", state);
  }

  return c.redirect(googleAuthUrl.toString());
});

authRoutes.get("/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const redirectUri = `${getBaseUrl(c)}/auth/google/callback`;

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  let clientRedirectUrl: string | null = null;
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      if (decoded.redirectUrl) {
        clientRedirectUrl = decoded.redirectUrl;
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

// ==================== Microsoft OAuth ====================

authRoutes.get("/microsoft", (c) => {
  const redirectUri = `${getBaseUrl(c)}/auth/microsoft/callback`;
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

  if (clientRedirectUrl) {
    const state = Buffer.from(JSON.stringify({ redirectUrl: clientRedirectUrl })).toString(
      "base64"
    );
    microsoftAuthUrl.searchParams.set("state", state);
  }

  return c.redirect(microsoftAuthUrl.toString());
});

authRoutes.get("/microsoft/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const redirectUri = `${getBaseUrl(c)}/auth/microsoft/callback`;

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  let clientRedirectUrl: string | null = null;
  if (state) {
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64").toString());
      if (decoded.redirectUrl) {
        clientRedirectUrl = decoded.redirectUrl;
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
    console.error("Microsoft OAuth error:", error);
    return c.redirect(`${FRONTEND_URL}/login?error=auth_failed`);
  }
});

// ==================== GitHub Linking/Unlinking ====================

authRoutes.get("/github/link", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const providerUser = await getUserFromToken(token);
  if (!providerUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(providerUser);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

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

authRoutes.delete("/github/unlink", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const providerUser = await getUserFromToken(token);
  if (!providerUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(providerUser);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

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

// ==================== Token Refresh ====================

authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json();
  const { visitorId, authProvider } = body;

  if (!visitorId || !authProvider) {
    return c.json({ error: "Missing visitorId or authProvider" }, 400);
  }

  const user = await prisma.user.findUnique({
    where: { id: visitorId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    if (authProvider === "google") {
      if (!user.googleRefreshToken) {
        return c.json({ error: "No refresh token available. Please log in again." }, 401);
      }

      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: user.googleRefreshToken,
          grant_type: "refresh_token",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Google refresh error:", tokenData);
        if (tokenData.error === "invalid_grant") {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleRefreshToken: null },
          });
        }
        return c.json({ error: "Token refresh failed. Please log in again." }, 401);
      }

      const organizations = await getUserOrganizations(user.id);

      return c.json({
        access_token: tokenData.access_token,
        visitorId: user.id,
        login: user.login,
        name: user.name,
        avatar_url: user.avatarUrl,
        email: user.email,
        auth_provider: "google",
        hasGithubLinked: !!user.githubId,
        accountType: user.accountType,
        onboardingCompletedAt: user.onboardingCompletedAt,
        personalOrgId: user.personalOrgId,
        organizations,
        hasOrganizations: organizations.length > 0,
      });
    }
    if (authProvider === "microsoft") {
      if (!user.microsoftRefreshToken) {
        return c.json({ error: "No refresh token available. Please log in again." }, 401);
      }

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
            refresh_token: user.microsoftRefreshToken,
            grant_type: "refresh_token",
            scope: "openid email profile User.Read offline_access",
          }),
        }
      );

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Microsoft refresh error:", tokenData);
        if (tokenData.error === "invalid_grant") {
          await prisma.user.update({
            where: { id: user.id },
            data: { microsoftRefreshToken: null },
          });
        }
        return c.json({ error: "Token refresh failed. Please log in again." }, 401);
      }

      if (tokenData.refresh_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: { microsoftRefreshToken: tokenData.refresh_token },
        });
      }

      const organizations = await getUserOrganizations(user.id);

      return c.json({
        access_token: tokenData.access_token,
        visitorId: user.id,
        login: user.login,
        name: user.name,
        avatar_url: user.avatarUrl,
        email: user.email,
        auth_provider: "microsoft",
        hasGithubLinked: !!user.githubId,
        accountType: user.accountType,
        onboardingCompletedAt: user.onboardingCompletedAt,
        personalOrgId: user.personalOrgId,
        organizations,
        hasOrganizations: organizations.length > 0,
      });
    }
    if (authProvider === "github") {
      if (!user.githubRefreshToken) {
        return c.json({ error: "No refresh token available. Please log in again." }, 401);
      }

      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          refresh_token: user.githubRefreshToken,
          grant_type: "refresh_token",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("GitHub refresh error:", tokenData);
        if (tokenData.error === "bad_refresh_token") {
          await prisma.user.update({
            where: { id: user.id },
            data: { githubRefreshToken: null },
          });
        }
        return c.json({ error: "Token refresh failed. Please log in again." }, 401);
      }

      if (tokenData.refresh_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: { githubRefreshToken: tokenData.refresh_token },
        });
      }

      const organizations = await getUserOrganizations(user.id);

      return c.json({
        access_token: tokenData.access_token,
        visitorId: user.id,
        login: user.login,
        name: user.name,
        avatar_url: user.avatarUrl,
        email: user.email,
        auth_provider: "github",
        hasGithubLinked: true,
        accountType: user.accountType,
        onboardingCompletedAt: user.onboardingCompletedAt,
        personalOrgId: user.personalOrgId,
        organizations,
        hasOrganizations: organizations.length > 0,
      });
    }

    return c.json({ error: "Unknown auth provider" }, 400);
  } catch (error) {
    console.error("Token refresh error:", error);
    return c.json({ error: "Token refresh failed" }, 500);
  }
});

// ==================== User Info ====================

authRoutes.get("/user", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  try {
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    if (!userResponse.ok) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const userData = await userResponse.json();
    return c.json(userData);
  } catch {
    return c.json({ error: "Failed to fetch user" }, 500);
  }
});

export { authRoutes };
