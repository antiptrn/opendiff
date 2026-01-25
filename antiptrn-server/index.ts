import { Hono } from "hono";
import { cors } from "hono/cors";
import { Polar } from "@polar-sh/sdk";
import { PrismaClient, SubscriptionTier } from "@prisma/client";
import { paymentProvider, getPaymentProviderName, getReviewQuotaPerSeat, getOrgReviewQuota } from "./lib/payments";

// Direct Polar SDK client for customer-facing operations not covered by payment abstraction
const polar = new Polar({ accessToken: process.env.POLAR_ACCESS_TOKEN });

// Tier hierarchy for comparison
const TIER_HIERARCHY: Record<string, number> = {
  FREE: 0,
  BYOK: 1,
  CODE_REVIEW: 2,
  TRIAGE: 3,
};
import { logAudit } from "./lib/audit";
import { organizationRoutes } from "./lib/routes/organizations";
import { getUserOrganizations, getOrgQuotaPool } from "./lib/middleware/organization";

const prisma = new PrismaClient();
const app = new Hono();

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID!;
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET!;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Helper to get GitHub user from token (for GitHub-specific API calls)
async function getGitHubUserFromToken(token: string) {
  const userResponse = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });

  if (!userResponse.ok) {
    return null;
  }

  return userResponse.json();
}

// Helper to get Google user from token
async function getGoogleUserFromToken(token: string) {
  const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!userResponse.ok) {
    return null;
  }

  return userResponse.json();
}

// Unified helper to get OAuth user from token (tries GitHub first, then Google)
// Returns user data with provider info for database lookup
async function getUserFromToken(token: string): Promise<{
  id: number | string;
  login?: string;
  name?: string;
  email?: string;
  avatar_url?: string;
  _provider: "github" | "google";
  _githubId?: number;
  _googleId?: string;
} | null> {
  // Try GitHub first
  const githubUser = await getGitHubUserFromToken(token);
  if (githubUser) {
    return {
      ...githubUser,
      _provider: "github" as const,
      _githubId: githubUser.id,
    };
  }

  // Try Google
  const googleUser = await getGoogleUserFromToken(token);
  if (googleUser) {
    return {
      id: googleUser.id,
      login: googleUser.email?.split("@")[0],
      name: googleUser.name,
      email: googleUser.email,
      avatar_url: googleUser.picture,
      _provider: "google" as const,
      _googleId: googleUser.id,
    };
  }

  return null;
}

// Helper to get the where clause for database lookup
function getDbUserWhere(providerUser: NonNullable<Awaited<ReturnType<typeof getUserFromToken>>>) {
  if (providerUser._provider === "github" && providerUser._githubId) {
    return { githubId: providerUser._githubId };
  } else if (providerUser._provider === "google" && providerUser._googleId) {
    return { googleId: providerUser._googleId };
  }
  return null;
}

// Helper to look up database user from OAuth provider user
async function findDbUser(providerUser: NonNullable<Awaited<ReturnType<typeof getUserFromToken>>>) {
  const where = getDbUserWhere(providerUser);
  if (!where) return null;
  return prisma.user.findUnique({ where });
}

// Helper to get organization ID from X-Organization-Id header
function getOrgIdFromHeader(c: { req: { header: (name: string) => string | undefined } }): string | undefined {
  return c.req.header("X-Organization-Id");
}

app.use(
  "*",
  cors({
    origin: FRONTEND_URL,
    credentials: true,
  })
);

app.get("/", (c) => {
  return c.json({ status: "ok", message: "antiptrn-server running" });
});

app.get("/auth/github", (c) => {
  const redirectUri = `${c.req.url.split("/auth/github")[0]}/auth/github/callback`;
  const scope = "read:user user:email repo";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", scope);

  // Encode redirectUrl in state if provided
  if (clientRedirectUrl) {
    const state = Buffer.from(JSON.stringify({ redirectUrl: clientRedirectUrl })).toString("base64");
    githubAuthUrl.searchParams.set("state", state);
  }

  return c.redirect(githubAuthUrl.toString());
});

app.get("/auth/github/callback", async (c) => {
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
    const tokenResponse = await fetch(
      "https://github.com/login/oauth/access_token",
      {
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
      }
    );

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
      // Check if this GitHub account is already linked to another user
      const existingGithubUser = await prisma.user.findUnique({
        where: { githubId: userData.id },
      });

      if (existingGithubUser && existingGithubUser.id !== linkOperation.userId) {
        return c.redirect(`${FRONTEND_URL}/console/settings?error=github_already_linked`);
      }

      // Link GitHub to the user's account
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

      // Get user's organizations and return updated user data
      const organizations = await getUserOrganizations(updatedUser.id);

      const authData = {
        id: updatedUser.googleId,
        visitorId: updatedUser.id,
        login: updatedUser.login,
        name: updatedUser.name,
        avatar_url: updatedUser.avatarUrl,
        email: updatedUser.email,
        access_token: tokenData.access_token,
        auth_provider: "google",
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
    const primaryEmail = emails.find(
      (e: { primary: boolean }) => e.primary
    )?.email;

    const email = primaryEmail || userData.email;

    // Check if user exists by githubId first
    let user = await prisma.user.findUnique({
      where: { githubId: userData.id },
    });

    if (user) {
      // User exists with this GitHub ID - update their info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          login: userData.login,
          name: userData.name,
          email,
          avatarUrl: userData.avatar_url,
          // Store refresh token if GitHub provides one (expiring tokens enabled)
          ...(tokenData.refresh_token && { githubRefreshToken: tokenData.refresh_token }),
        },
      });
    } else {
      // No user with this GitHub ID - check if email exists (e.g., Google user)
      const existingUserByEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (existingUserByEmail) {
        // Email already used by another account - don't auto-link
        return c.redirect(
          `${FRONTEND_URL}/login?error=email_exists&message=${encodeURIComponent(
            "This email is already associated with another account. Please sign in with that account and link your GitHub from settings."
          )}`
        );
      } else {
        // No existing user - create new one
        user = await prisma.user.create({
          data: {
            githubId: userData.id,
            login: userData.login,
            name: userData.name,
            email,
            avatarUrl: userData.avatar_url,
            // Store refresh token if GitHub provides one (expiring tokens enabled)
            githubRefreshToken: tokenData.refresh_token,
          },
        });
      }
    }

    // Get user's organizations
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

// Google OAuth
app.get("/auth/google", (c) => {
  const redirectUri = `${c.req.url.split("/auth/google")[0]}/auth/google/callback`;
  const scope = "openid email profile";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  googleAuthUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
  googleAuthUrl.searchParams.set("response_type", "code");
  googleAuthUrl.searchParams.set("scope", scope);
  googleAuthUrl.searchParams.set("access_type", "offline");
  googleAuthUrl.searchParams.set("prompt", "consent"); // Always show consent to get refresh token

  // Encode redirectUrl in state if provided
  if (clientRedirectUrl) {
    const state = Buffer.from(JSON.stringify({ redirectUrl: clientRedirectUrl })).toString("base64");
    googleAuthUrl.searchParams.set("state", state);
  }

  return c.redirect(googleAuthUrl.toString());
});

app.get("/auth/google/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const redirectUri = `${c.req.url.split("/auth/google/callback")[0]}/auth/google/callback`;

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  // Parse redirectUrl from state
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
    // Exchange code for tokens
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
      return c.redirect(`${FRONTEND_URL}/login?error=${tokenData.error_description || tokenData.error}`);
    }

    // Get user info from Google
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const googleUser = await userResponse.json();

    if (!googleUser.email) {
      return c.redirect(`${FRONTEND_URL}/login?error=no_email`);
    }

    // Generate a username from email (before @)
    const login = googleUser.email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

    // Try to find existing user by Google ID or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { googleId: googleUser.id },
          { email: googleUser.email },
        ],
      },
    });

    if (user) {
      // Update existing user with Google info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          googleId: googleUser.id,
          name: googleUser.name || user.name,
          avatarUrl: googleUser.picture || user.avatarUrl,
          // Don't overwrite login if user signed up with GitHub first
          login: user.login || login,
          // Store refresh token if provided (only on first auth or re-consent)
          ...(tokenData.refresh_token && { googleRefreshToken: tokenData.refresh_token }),
        },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          googleId: googleUser.id,
          login,
          name: googleUser.name,
          email: googleUser.email,
          avatarUrl: googleUser.picture,
          // Store refresh token if provided
          googleRefreshToken: tokenData.refresh_token,
        },
      });
    }

    // Get user's organizations
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

// Microsoft OAuth (Entra ID)
app.get("/auth/microsoft", (c) => {
  const redirectUri = `${c.req.url.split("/auth/microsoft")[0]}/auth/microsoft/callback`;
  const scope = "openid email profile User.Read";
  const clientRedirectUrl = c.req.query("redirectUrl");

  const microsoftAuthUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  microsoftAuthUrl.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
  microsoftAuthUrl.searchParams.set("redirect_uri", redirectUri);
  microsoftAuthUrl.searchParams.set("response_type", "code");
  microsoftAuthUrl.searchParams.set("scope", scope);
  microsoftAuthUrl.searchParams.set("response_mode", "query");

  // Encode redirectUrl in state if provided
  if (clientRedirectUrl) {
    const state = Buffer.from(JSON.stringify({ redirectUrl: clientRedirectUrl })).toString("base64");
    microsoftAuthUrl.searchParams.set("state", state);
  }

  return c.redirect(microsoftAuthUrl.toString());
});

app.get("/auth/microsoft/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const redirectUri = `${c.req.url.split("/auth/microsoft/callback")[0]}/auth/microsoft/callback`;

  if (!code) {
    return c.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  // Parse redirectUrl from state
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
    // Exchange code for tokens
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
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
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Microsoft token error:", tokenData);
      return c.redirect(`${FRONTEND_URL}/login?error=${tokenData.error_description || tokenData.error}`);
    }

    // Get user info from Microsoft Graph
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

    // Generate a username from email (before @)
    const login = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");

    // Try to find existing user by Microsoft ID or email
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { microsoftId: microsoftUser.id },
          { email: email },
        ],
      },
    });

    if (user) {
      // Update existing user with Microsoft info
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          microsoftId: microsoftUser.id,
          name: microsoftUser.displayName || user.name,
          // Don't overwrite login if user signed up with another provider first
          login: user.login || login,
          // Store refresh token if provided (only on first auth or re-consent)
          ...(tokenData.refresh_token && { microsoftRefreshToken: tokenData.refresh_token }),
        },
      });
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          microsoftId: microsoftUser.id,
          login,
          name: microsoftUser.displayName,
          email: email,
          // Store refresh token if provided
          microsoftRefreshToken: tokenData.refresh_token,
        },
      });
    }

    // Get user's organizations
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

// GitHub linking for users who signed in with Google
app.get("/auth/github/link", async (c) => {
  // Get the user's token to verify they're logged in
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

  // Use the same callback as normal auth, but with state indicating link operation
  const redirectUri = `${c.req.url.split("/auth/github/link")[0]}/auth/github/callback`;
  const scope = "read:user user:email repo";
  const state = Buffer.from(JSON.stringify({ type: "link", userId: user.id })).toString("base64");

  const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
  githubAuthUrl.searchParams.set("client_id", GITHUB_CLIENT_ID);
  githubAuthUrl.searchParams.set("redirect_uri", redirectUri);
  githubAuthUrl.searchParams.set("scope", scope);
  githubAuthUrl.searchParams.set("state", state);

  return c.json({ url: githubAuthUrl.toString() });
});

// GitHub unlinking for users who signed in with Google
app.delete("/auth/github/unlink", async (c) => {
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

  // Only allow unlinking for Google/Microsoft users who have GitHub linked
  if (!user.googleId && !user.microsoftId) {
    return c.json({ error: "Only Google or Microsoft users can unlink GitHub" }, 400);
  }

  if (!user.githubId) {
    return c.json({ error: "GitHub is not linked" }, 400);
  }

  // Unlink GitHub by clearing the GitHub fields
  await prisma.user.update({
    where: { id: user.id },
    data: {
      githubId: null,
      githubAccessToken: null,
    },
  });

  return c.json({ success: true });
});

// Refresh access token using stored refresh token
app.post("/auth/refresh", async (c) => {
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

      // Exchange refresh token for new access token
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
        // Clear invalid refresh token
        if (tokenData.error === "invalid_grant") {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleRefreshToken: null },
          });
        }
        return c.json({ error: "Token refresh failed. Please log in again." }, 401);
      }

      // Get updated user info
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
    } else if (authProvider === "microsoft") {
      if (!user.microsoftRefreshToken) {
        return c.json({ error: "No refresh token available. Please log in again." }, 401);
      }

      // Exchange refresh token for new access token
      const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
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
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Microsoft refresh error:", tokenData);
        // Clear invalid refresh token
        if (tokenData.error === "invalid_grant") {
          await prisma.user.update({
            where: { id: user.id },
            data: { microsoftRefreshToken: null },
          });
        }
        return c.json({ error: "Token refresh failed. Please log in again." }, 401);
      }

      // Store new refresh token if provided (Microsoft rotates them)
      if (tokenData.refresh_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: { microsoftRefreshToken: tokenData.refresh_token },
        });
      }

      // Get updated user info
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
    } else if (authProvider === "github") {
      // GitHub tokens may or may not expire depending on app settings
      // If we have a refresh token, try to use it
      if (!user.githubRefreshToken) {
        // No refresh token means either tokens don't expire or user needs to re-auth
        return c.json({ error: "No refresh token available. Please log in again." }, 401);
      }

      // Exchange refresh token for new access token
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
        // Clear invalid refresh token
        if (tokenData.error === "bad_refresh_token") {
          await prisma.user.update({
            where: { id: user.id },
            data: { githubRefreshToken: null },
          });
        }
        return c.json({ error: "Token refresh failed. Please log in again." }, 401);
      }

      // Store new refresh token if provided (GitHub rotates them)
      if (tokenData.refresh_token) {
        await prisma.user.update({
          where: { id: user.id },
          data: { githubRefreshToken: tokenData.refresh_token },
        });
      }

      // Get updated user info
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

app.get("/auth/user", async (c) => {
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

// Fetch user's repositories with optional search
app.get("/api/repos", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const query = c.req.query("q") || "";

  try {
    // Determine the GitHub token to use
    let githubToken = token;

    // Check if this is a Google user by trying to get user info
    const providerUser = await getUserFromToken(token);
    if (providerUser?._provider === "google") {
      // For Google users, we need their stored GitHub token
      const user = await findDbUser(providerUser);
      if (!user?.githubAccessToken) {
        return c.json({ error: "GitHub not linked", code: "GITHUB_NOT_LINKED" }, 400);
      }
      githubToken = user.githubAccessToken;
    }

    // Fetch user's repos (includes repos they have access to)
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, 500);
    }

    const repos = await reposResponse.json();

    // Filter by search query if provided
    const filteredRepos = query
      ? repos.filter((repo: { full_name: string }) =>
          repo.full_name.toLowerCase().includes(query.toLowerCase())
        )
      : repos;

    // Return simplified repo data
    return c.json(
      filteredRepos.slice(0, 50).map((repo: { full_name: string; owner: { login: string }; name: string; private: boolean; language: string | null; pushed_at: string | null; description: string | null }) => ({
        full_name: repo.full_name,
        owner: repo.owner.login,
        name: repo.name,
        private: repo.private,
        language: repo.language,
        pushed_at: repo.pushed_at,
        description: repo.description,
      }))
    );
  } catch {
    return c.json({ error: "Failed to fetch repos" }, 500);
  }
});

// Repository settings endpoints

// Get all activated repos for user
app.get("/api/settings", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const orgId = c.req.header("X-Organization-Id");

  try {
    // Get repos the user has access to
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, 500);
    }

    const repos = await reposResponse.json();
    const repoIdentifiers = repos.map((r: { owner: { login: string }; name: string }) => ({
      owner: r.owner.login,
      repo: r.name,
    }));

    // Get the current user's seat in the organization
    const githubUser = await getUserFromToken(token);
    let canEnableReviews = false;
    let canEnableTriage = false;

    if (githubUser && orgId) {
      const user = await findDbUser(githubUser);

      if (user) {
        const membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: user.id,
            },
          },
          include: { organization: true },
        });

        if (membership && membership.hasSeat && membership.organization.subscriptionStatus === "ACTIVE") {
          const tier = membership.organization.subscriptionTier;
          canEnableReviews = tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
          canEnableTriage = tier === "TRIAGE" || tier === "BYOK";
        }
      }
    }

    // Get settings for user's repos that are enabled
    const settings = await prisma.repositorySettings.findMany({
      where: {
        AND: [
          {
            OR: repoIdentifiers.map((r: { owner: string; repo: string }) => ({
              owner: r.owner,
              repo: r.repo,
            })),
          },
          {
            OR: [
              { enabled: true },
              { triageEnabled: true },
            ],
          },
        ],
      },
    });

    return c.json(settings.map((s) => ({
      owner: s.owner,
      repo: s.repo,
      enabled: s.enabled,
      triageEnabled: s.triageEnabled,
      effectiveEnabled: s.enabled && canEnableReviews,
      effectiveTriageEnabled: s.triageEnabled && canEnableTriage,
    })));
  } catch (error) {
    console.error("Error fetching activated repos:", error);
    return c.json({ error: "Failed to fetch settings" }, 500);
  }
});

app.get("/api/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();

  const settings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
    include: {
      organization: true,
    },
  });

  // Return default settings (disabled) if no record exists
  // Features require explicit enabling by a subscriber
  if (!settings) {
    return c.json({
      owner,
      repo,
      enabled: false,
      triageEnabled: false,
      customReviewRules: "",
      effectiveEnabled: false,
      effectiveTriageEnabled: false,
    });
  }

  // Calculate effective state based on organization's subscription
  const org = settings.organization;
  const hasActiveSubscription = org && org.subscriptionStatus === "ACTIVE" && org.subscriptionTier;
  const tier = org?.subscriptionTier;

  // Can enable reviews if org has active subscription with review capability
  const canEnableReviews = hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK");
  // Can enable triage if org has active subscription with triage capability
  const canEnableTriage = hasActiveSubscription && (tier === "TRIAGE" || tier === "BYOK");

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    customReviewRules: settings.customReviewRules || "",
    // Effective state = stored setting AND org has subscription with permission
    effectiveEnabled: settings.enabled && canEnableReviews,
    effectiveTriageEnabled: settings.triageEnabled && canEnableTriage,
  });
});

app.put("/api/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const authHeader = c.req.header("Authorization");
  const body = await c.req.json();
  const orgId = getOrgIdFromHeader(c);

  // Extract settings and repo metadata from body
  const { enabled, triageEnabled, customReviewRules, repoMetadata } = body as {
    enabled?: boolean;
    triageEnabled?: boolean;
    customReviewRules?: string;
    repoMetadata?: {
      fullName?: string;
      description?: string;
      isPrivate?: boolean;
      avatarUrl?: string;
      defaultBranch?: string;
      htmlUrl?: string;
      language?: string;
      pushedAt?: string;
    };
  };
  let userId: string | undefined;
  let canEnableReviews = false;
  let canEnableTriage = false;

  // Validate seat membership if user is authenticated and orgId is provided
  if (authHeader?.startsWith("Bearer ") && orgId) {
    const token = authHeader.slice(7);
    const githubUser = await getUserFromToken(token);

    if (githubUser) {
      const user = await findDbUser(githubUser);

      if (user) {
        userId = user.id;

        // Check if user is a member of the organization with a seat
        const membership = await prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: user.id,
            },
          },
          include: { organization: true },
        });

        if (membership && membership.hasSeat && membership.organization.subscriptionStatus === "ACTIVE") {
          const tier = membership.organization.subscriptionTier;
          canEnableReviews = tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK";
          canEnableTriage = tier === "TRIAGE" || tier === "BYOK";
        }

        // Enforce subscription limits
        if (enabled && !canEnableReviews) {
          return c.json({
            error: "Reviews require an active paid subscription (BYOK, Code Review, or Triage)"
          }, 403);
        }

        if (triageEnabled && !canEnableTriage) {
          return c.json({
            error: "Triage mode requires a BYOK or Triage subscription"
          }, 403);
        }
      }
    }
  } else if (enabled || triageEnabled) {
    // If trying to enable features but not authenticated or no orgId, reject
    return c.json({
      error: "Authentication and organization context required to enable reviews"
    }, 401);
  }

  const settings = await prisma.repositorySettings.upsert({
    where: { owner_repo: { owner, repo } },
    update: {
      enabled: enabled ?? false,
      triageEnabled: triageEnabled ?? false,
      customReviewRules: customReviewRules !== undefined ? (customReviewRules || null) : undefined,
      userId: userId,
      organizationId: orgId || undefined,
      enabledById: userId,
      // Update repo metadata if provided
      ...(repoMetadata && {
        fullName: repoMetadata.fullName ?? `${owner}/${repo}`,
        description: repoMetadata.description ?? null,
        isPrivate: repoMetadata.isPrivate ?? false,
        avatarUrl: repoMetadata.avatarUrl ?? null,
        defaultBranch: repoMetadata.defaultBranch ?? null,
        htmlUrl: repoMetadata.htmlUrl ?? null,
        language: repoMetadata.language ?? null,
        pushedAt: repoMetadata.pushedAt ? new Date(repoMetadata.pushedAt) : null,
      }),
    },
    create: {
      owner,
      repo,
      enabled: enabled ?? false,
      triageEnabled: triageEnabled ?? false,
      customReviewRules: customReviewRules || null,
      userId: userId,
      organizationId: orgId || undefined,
      enabledById: userId,
      // Save repo metadata
      fullName: repoMetadata?.fullName ?? `${owner}/${repo}`,
      description: repoMetadata?.description ?? null,
      isPrivate: repoMetadata?.isPrivate ?? false,
      avatarUrl: repoMetadata?.avatarUrl ?? null,
      defaultBranch: repoMetadata?.defaultBranch ?? null,
      htmlUrl: repoMetadata?.htmlUrl ?? null,
      language: repoMetadata?.language ?? null,
      pushedAt: repoMetadata?.pushedAt ? new Date(repoMetadata.pushedAt) : null,
    },
  });

  await logAudit({
    organizationId: orgId,
    userId,
    action: "repo.settings.updated",
    target: `${owner}/${repo}`,
    metadata: { enabled, triageEnabled },
    c,
  });

  return c.json({
    owner: settings.owner,
    repo: settings.repo,
    enabled: settings.enabled,
    triageEnabled: settings.triageEnabled,
    customReviewRules: settings.customReviewRules || "",
    effectiveEnabled: settings.enabled && canEnableReviews,
    effectiveTriageEnabled: settings.triageEnabled && canEnableTriage,
  });
});

// Get all enabled repos for an organization (from database, not GitHub)
// This allows org members without GitHub access to see the repos
app.get("/api/org/repos", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const orgId = c.req.header("X-Organization-Id");
  const searchQuery = c.req.query("q")?.toLowerCase() || "";

  if (!orgId) {
    return c.json({ error: "Organization ID required" }, 400);
  }

  try {
    const providerUser = await getUserFromToken(token);
    if (!providerUser) {
      return c.json({ error: "Invalid token" }, 401);
    }

    const user = await findDbUser(providerUser);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Verify user is a member of the organization
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return c.json({ error: "Not a member of this organization" }, 403);
    }

    // Get all enabled repos for this organization
    const repos = await prisma.repositorySettings.findMany({
      where: {
        AND: [
          { organizationId: orgId },
          { OR: [{ enabled: true }, { triageEnabled: true }] },
          ...(searchQuery ? [{
            OR: [
              { fullName: { contains: searchQuery, mode: "insensitive" as const } },
              { owner: { contains: searchQuery, mode: "insensitive" as const } },
              { repo: { contains: searchQuery, mode: "insensitive" as const } },
            ],
          }] : []),
        ],
      },
      orderBy: { updatedAt: "desc" },
    });

    // Calculate effective state based on subscription
    const org = membership.organization;
    const hasActiveSubscription = org.subscriptionStatus === "ACTIVE" && org.subscriptionTier;
    const tier = org.subscriptionTier;
    const canEnableReviews = hasActiveSubscription && (tier === "CODE_REVIEW" || tier === "TRIAGE" || tier === "BYOK");
    const canEnableTriage = hasActiveSubscription && (tier === "TRIAGE" || tier === "BYOK");

    return c.json(repos.map((r) => ({
      owner: r.owner,
      repo: r.repo,
      fullName: r.fullName || `${r.owner}/${r.repo}`,
      description: r.description,
      isPrivate: r.isPrivate,
      avatarUrl: r.avatarUrl,
      defaultBranch: r.defaultBranch,
      htmlUrl: r.htmlUrl || `https://github.com/${r.owner}/${r.repo}`,
      language: r.language,
      pushedAt: r.pushedAt,
      enabled: r.enabled,
      triageEnabled: r.triageEnabled,
      customReviewRules: r.customReviewRules || "",
      effectiveEnabled: r.enabled && canEnableReviews,
      effectiveTriageEnabled: r.triageEnabled && canEnableTriage,
    })));
  } catch (error) {
    console.error("Error fetching org repos:", error);
    return c.json({ error: "Failed to fetch repos" }, 500);
  }
});

// Delete repository settings
app.delete("/api/settings/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get orgId from query param
  const orgId = c.req.query("orgId");

  // Check if settings exist
  const settings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  if (!settings) {
    return c.json({ error: "Repository settings not found" }, 404);
  }

  // Verify user has permission (member of the org that owns this repo settings)
  if (settings.organizationId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: { organizationId: settings.organizationId, userId: user.id },
      },
    });

    if (!membership) {
      return c.json({ error: "Not authorized to delete this repository" }, 403);
    }
  }

  // Delete the settings
  await prisma.repositorySettings.delete({
    where: { owner_repo: { owner, repo } },
  });

  await logAudit({
    organizationId: orgId || settings.organizationId || undefined,
    userId: user.id,
    action: "repo.settings.updated",
    target: `${owner}/${repo}`,
    metadata: { deleted: true },
    c,
  });

  return c.json({ success: true });
});

// ==================== STATS ENDPOINTS ====================

// Get dashboard stats for authenticated user
app.get("/api/stats", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const orgId = c.req.header("X-Organization-Id");
  const providerUser = await getUserFromToken(token);

  if (!providerUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  try {
    const user = await findDbUser(providerUser);
    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    // Check if user has GitHub access (either GitHub auth or linked GitHub)
    let hasGithubAccess = providerUser._provider === "github";
    let githubToken = token;

    if (providerUser._provider === "google" && user.githubAccessToken) {
      hasGithubAccess = true;
      githubToken = user.githubAccessToken;
    }

    // If user has org context and no GitHub access, use org repos from database
    if (orgId && !hasGithubAccess) {
      // Verify user is a member of the organization
      const membership = await prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: user.id,
          },
        },
      });

      if (!membership) {
        return c.json({ error: "Not a member of this organization" }, 403);
      }

      // Get org repos from database
      const orgRepos = await prisma.repositorySettings.findMany({
        where: {
          organizationId: orgId,
          OR: [
            { enabled: true },
            { triageEnabled: true },
          ],
        },
      });

      const repoNames = orgRepos.map((r) => ({
        owner: r.owner,
        repo: r.repo,
      }));

      // Count reviews for org's repos
      const reviewCount = repoNames.length > 0
        ? await prisma.review.count({
            where: {
              OR: repoNames.map((r) => ({
                owner: r.owner,
                repo: r.repo,
              })),
            },
          })
        : 0;

      return c.json({
        reviewCount,
        connectedRepos: orgRepos.length,
        totalRepos: orgRepos.length, // For users without GitHub access, total = connected
      });
    }

    // User has GitHub access - use GitHub API
    const reposResponse = await fetch(
      `https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member`,
      {
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!reposResponse.ok) {
      return c.json({ error: "Failed to fetch repos" }, 500);
    }

    const repos = await reposResponse.json();
    const repoNames = repos.map((r: { owner: { login: string }; name: string }) => ({
      owner: r.owner.login,
      repo: r.name,
    }));

    // Count connected repos (repos with enabled=true OR triageEnabled=true)
    const connectedRepos = repoNames.length > 0
      ? await prisma.repositorySettings.count({
          where: {
            OR: repoNames.map((r: { owner: string; repo: string }) => ({
              owner: r.owner,
              repo: r.repo,
              OR: [
                { enabled: true },
                { triageEnabled: true },
              ],
            })),
          },
        })
      : 0;

    // Count reviews for user's repos
    const reviewCount = repoNames.length > 0
      ? await prisma.review.count({
          where: {
            OR: repoNames.map((r: { owner: string; repo: string }) => ({
              owner: r.owner,
              repo: r.repo,
            })),
          },
        })
      : 0;

    return c.json({
      reviewCount,
      connectedRepos,
      totalRepos: repos.length,
    });
  } catch (error) {
    console.error("Error fetching stats:", error);
    return c.json({ error: "Failed to fetch stats" }, 500);
  }
});

// Record a review (called by review agent)
app.post("/api/reviews", async (c) => {
  const body = await c.req.json();
  const { owner, repo, pullNumber, reviewType, reviewId, commentId, apiKey } = body;

  // Validate API key for review agent
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (expectedApiKey && apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  if (!owner || !repo || !pullNumber || !reviewType) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    // Get repo settings to find the organization that enabled this repo
    const repoSettings = await prisma.repositorySettings.findUnique({
      where: { owner_repo: { owner, repo } },
      include: { organization: true },
    });

    const org = repoSettings?.organization;

    // Check quota if organization exists
    if (org) {
      // Calculate quota pool from all seats in the organization
      const quotaPool = await getOrgQuotaPool(org.id);

      // quota of -1 means unlimited (has BYOK seat)
      if (quotaPool.total !== -1 && org.reviewsUsedThisCycle >= quotaPool.total) {
        return c.json({
          error: "Review quota exceeded",
          quota: quotaPool.total,
          used: org.reviewsUsedThisCycle,
        }, 403);
      }

      // Increment usage counter (even for unlimited to track usage)
      await prisma.organization.update({
        where: { id: org.id },
        data: { reviewsUsedThisCycle: { increment: 1 } },
      });
    }

    const review = await prisma.review.create({
      data: {
        owner,
        repo,
        pullNumber,
        reviewType,
        reviewId: reviewId || null,
        commentId: commentId || null,
      },
    });

    return c.json({ id: review.id, created: true });
  } catch (error) {
    console.error("Error recording review:", error);
    return c.json({ error: "Failed to record review" }, 500);
  }
});

// ==================== SUBSCRIPTION ENDPOINTS ====================

// Get user subscription status
app.get("/api/subscription/status", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({
      subscriptionTier: "FREE",
      subscriptionStatus: "INACTIVE",
      subscriptionId: null,
      productId: null,
      reviewsUsed: 0,
      reviewsQuota: 0,
    });
  }

  return c.json({
    subscriptionTier: user.subscriptionTier ?? "FREE",
    subscriptionStatus: user.subscriptionStatus ?? "INACTIVE",
    subscriptionId: user.subscriptionId,
    productId: user.productId,
    subscriptionExpiresAt: user.subscriptionExpiresAt,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
    reviewsUsed: user.reviewsUsedThisCycle ?? 0,
    reviewsQuota: getReviewQuotaPerSeat(user.subscriptionTier ?? "FREE", user.productId),
  });
});

// Sync subscription status from Polar (for local dev without webhooks)
app.post("/api/subscription/sync", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user || !user.email) {
    return c.json({ error: "User not found or no email" }, 404);
  }

  try {
    // Find customer by email first
    const customers = await polar.customers.list({
      email: user.email,
      limit: 1,
    });

    if (!customers.result.items.length) {
      return c.json({
        synced: true,
        subscriptionTier: "FREE",
        subscriptionStatus: "INACTIVE",
        message: "No Polar customer found",
      });
    }

    const customer = customers.result.items[0];

    // Find subscriptions for this customer
    const subscriptions = await polar.subscriptions.list({
      customerId: customer.id,
      active: true,
    });

    const activeSubscription = subscriptions.result.items[0];

    if (activeSubscription) {
      const tier = paymentProvider.getTierFromProductId(activeSubscription.productId);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: tier as SubscriptionTier,
          subscriptionStatus: "ACTIVE",
          subscriptionId: activeSubscription.id,
          productId: activeSubscription.productId,
          subscriptionExpiresAt: activeSubscription.currentPeriodEnd
            ? new Date(activeSubscription.currentPeriodEnd)
            : null,
          cancelAtPeriodEnd: activeSubscription.cancelAtPeriodEnd ?? false,
        },
      });

      return c.json({
        synced: true,
        subscriptionTier: tier,
        subscriptionStatus: "ACTIVE",
        productId: activeSubscription.productId,
      });
    } else {
      return c.json({
        synced: true,
        subscriptionTier: "FREE",
        subscriptionStatus: "INACTIVE",
        message: "No active subscription found",
      });
    }
  } catch (error) {
    console.error("Error syncing subscription:", error);
    return c.json({ error: "Failed to sync subscription" }, 500);
  }
});

// Debug: Get actual subscription status from Polar
app.get("/api/subscription/debug", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const result: Record<string, unknown> = {
    database: {
      subscriptionId: user.subscriptionId,
      subscriptionTier: user.subscriptionTier,
      subscriptionStatus: user.subscriptionStatus,
      cancelAtPeriodEnd: user.cancelAtPeriodEnd,
      subscriptionExpiresAt: user.subscriptionExpiresAt,
    },
    polar: null as unknown,
  };

  if (user.subscriptionId) {
    try {
      const subscription = await polar.subscriptions.get({
        id: user.subscriptionId,
      });
      result.polar = {
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        currentPeriodEnd: subscription.currentPeriodEnd,
        productId: subscription.productId,
      };
    } catch (error) {
      result.polar = { error: String(error) };
    }
  }

  return c.json(result);
});

// Create checkout session for subscription
app.post("/api/subscription/create", async (c) => {
  const authHeader = c.req.header("Authorization");
  const body = await c.req.json();
  const { productId } = body;

  if (!productId) {
    return c.json({ error: "productId is required" }, 400);
  }

  // Check if user is authenticated
  let user = null;
  let githubUser = null;

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    githubUser = await getUserFromToken(token);

    if (githubUser) {
      user = await findDbUser(githubUser);
    }
  }

  // If user has active subscription, handle upgrade/downgrade/billing switch
  if (user?.subscriptionId && user.subscriptionStatus === "ACTIVE") {
    // Check if trying to switch to the exact same product (same tier AND billing interval)
    if (user.productId === productId) {
      return c.json({ error: "Already on this plan" }, 400);
    }

    const newTier = paymentProvider.getTierFromProductId(productId);
    const currentTierLevel = TIER_HIERARCHY[user.subscriptionTier ?? "FREE"];
    const newTierLevel = TIER_HIERARCHY[newTier];

    try {
      // If subscription is set to cancel, first uncancel it
      if (user.cancelAtPeriodEnd) {
        await polar.subscriptions.update({
          id: user.subscriptionId,
          subscriptionUpdate: {
            cancelAtPeriodEnd: false,
          },
        });
      }

      // Update existing subscription to new product
      await polar.subscriptions.update({
        id: user.subscriptionId,
        subscriptionUpdate: {
          productId: productId,
        },
      });

      // Update user in database
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionTier: newTier as SubscriptionTier,
          productId: productId,
          cancelAtPeriodEnd: false,
        },
      });

      const changeType = newTierLevel > currentTierLevel ? "upgrade" : "downgrade";
      await logAudit({
        organizationId: getOrgIdFromHeader(c),
        userId: user.id,
        action: "subscription.updated",
        metadata: { fromTier: user.subscriptionTier, toTier: newTier, changeType },
        c,
      });

      return c.json({
        subscriptionUpdated: true,
        productId: productId,
        type: changeType,
      });
    } catch (error: unknown) {
      // If subscription is already cancelled on Polar's side, fall through to create new checkout
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("AlreadyCanceledSubscription")) {
        console.log("Subscription already cancelled on Polar, creating new checkout");
        // Clear the old subscription ID since it's cancelled
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionId: null,
            subscriptionStatus: "CANCELLED",
            cancelAtPeriodEnd: false,
          },
        });
        // Fall through to create new checkout below
      } else {
        console.error("Error updating subscription:", error);
        return c.json({ error: "Failed to update subscription" }, 500);
      }
    }
  }

  // Create new checkout
  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: `${FRONTEND_URL}/subscription/success?checkout_id={CHECKOUT_ID}`,
      customerEmail: user?.email || githubUser?.email || undefined,
      customerName: user?.name || githubUser?.name || undefined,
      metadata: {
        userId: user?.id || "",
        githubId: String(githubUser?.id || ""),
      },
    });

    return c.json({
      checkoutUrl: checkout.url,
      requiresAuth: !user,
    });
  } catch (error) {
    console.error("Error creating checkout:", error);
    return c.json({ error: "Failed to create checkout" }, 500);
  }
});

// Get all billing data (subscription + orders) in one call
app.get("/api/billing", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  // Default response for users without subscription
  const defaultResponse = {
    subscription: {
      tier: "FREE" as const,
      status: "INACTIVE" as const,
      expiresAt: null,
      cancelAtPeriodEnd: false,
    },
    orders: [],
  };

  if (!user) {
    return c.json(defaultResponse);
  }

  // Build subscription info from database
  const subscription = {
    tier: user.subscriptionTier,
    status: user.subscriptionStatus,
    expiresAt: user.subscriptionExpiresAt,
    cancelAtPeriodEnd: user.cancelAtPeriodEnd,
  };

  // If no email, can't fetch orders
  if (!user.email) {
    return c.json({ subscription, orders: [] });
  }

  try {
    const providerName = getPaymentProviderName();
    let formattedOrders: Array<{
      id: string;
      createdAt: string;
      amount: number;
      currency: string;
      status: string;
      productName: string;
    }> = [];

    if (providerName === "stripe") {
      // Fetch invoices from Stripe
      const { getStripe } = await import("./lib/payments/stripe");
      const stripe = getStripe();
      
      // Find customer by email
      const customers = await stripe.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        const customer = customers.data[0];
        
        // Fetch invoices for this customer
        const invoices = await stripe.invoices.list({
          customer: customer.id,
          limit: 50,
        });

        formattedOrders = invoices.data.map((invoice) => ({
          id: invoice.id,
          createdAt: new Date(invoice.created * 1000).toISOString(),
          amount: invoice.amount_paid || 0,
          currency: invoice.currency || "usd",
          status: invoice.status || "paid",
          productName: invoice.lines.data[0]?.description || "Subscription",
        }));
      }
    } else {
      // Use Polar (default)
      // Get user's Polar customer ID by looking up by email
      const customers = await polar.customers.list({
        email: user.email,
        limit: 1,
      });

      if (customers.result.items.length > 0) {
        const customer = customers.result.items[0];

        // Fetch orders for this customer
        const orders = await polar.orders.list({
          customerId: customer.id,
          limit: 50,
        });

        // Map orders to a simpler format
        formattedOrders = orders.result.items.map((order) => ({
          id: order.id,
          createdAt: order.createdAt,
          amount: order.totalAmount,
          currency: order.currency,
          status: order.billingReason,
          productName: order.product.name,
        }));
      }
    }

    return c.json({ subscription, orders: formattedOrders });
  } catch (error) {
    console.error("Error fetching billing data:", error);
    // Still return subscription info even if orders fail
    return c.json({ subscription, orders: [] });
  }
});

// Get invoice URL for an order
app.get("/api/billing/invoice/:orderId", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user?.email) {
    return c.json({ error: "User not found" }, 404);
  }

  const orderId = c.req.param("orderId");

  try {
    const providerName = getPaymentProviderName();
    let invoiceUrl: string | null = null;

    if (providerName === "stripe") {
      // Fetch invoice from Stripe
      const { getStripe } = await import("./lib/payments/stripe");
      const stripe = getStripe();
      
      const invoice = await stripe.invoices.retrieve(orderId);
      
      // Verify this invoice belongs to the user by checking customer email
      if (invoice.customer_email !== user.email) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      invoiceUrl = invoice.hosted_invoice_url || invoice.invoice_pdf || null;
    } else {
      // Use Polar (default)
      // Verify this order belongs to the user by checking customer email
      const order = await polar.orders.get({ id: orderId });

      if (order.customer.email !== user.email) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      // Get the invoice URL
      const invoice = await polar.orders.invoice({ id: orderId });
      invoiceUrl = invoice.url;
    }

    if (!invoiceUrl) {
      return c.json({ error: "Invoice URL not available" }, 404);
    }

    return c.json({ invoiceUrl });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return c.json({ error: "Failed to fetch invoice" }, 500);
  }
});

// Cancel subscription
app.post("/api/subscription/cancel", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user?.subscriptionId) {
    return c.json({ error: "No active subscription" }, 400);
  }

  try {
    // Cancel at period end
    await polar.subscriptions.update({
      id: user.subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: true,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { cancelAtPeriodEnd: true },
    });

    await logAudit({
      organizationId: getOrgIdFromHeader(c),
      userId: user.id,
      action: "subscription.cancelled",
      metadata: { tier: user.subscriptionTier },
      c,
    });

    return c.json({ success: true, message: "Subscription will cancel at period end" });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // If already cancelled, update our database to match
    if (errorMessage.includes("AlreadyCanceledSubscription")) {
      await prisma.user.update({
        where: { id: user.id },
        data: { cancelAtPeriodEnd: true },
      });
      return c.json({ success: true, message: "Subscription is already set to cancel" });
    }

    console.error("Error canceling subscription:", error);
    return c.json({ error: "Failed to cancel subscription" }, 500);
  }
});

// Resubscribe (uncancel) subscription
app.post("/api/subscription/resubscribe", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user?.subscriptionId) {
    return c.json({ error: "No subscription to reactivate" }, 400);
  }

  if (!user.cancelAtPeriodEnd) {
    return c.json({ error: "Subscription is not scheduled for cancellation" }, 400);
  }

  try {
    // Uncancel by setting cancelAtPeriodEnd to false
    await polar.subscriptions.update({
      id: user.subscriptionId,
      subscriptionUpdate: {
        cancelAtPeriodEnd: false,
      },
    });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        cancelAtPeriodEnd: false,
        subscriptionStatus: "ACTIVE",
      },
    });

    await logAudit({
      organizationId: getOrgIdFromHeader(c),
      userId: user.id,
      action: "subscription.resubscribed",
      metadata: { tier: user.subscriptionTier },
      c,
    });

    return c.json({ success: true, message: "Subscription reactivated" });
  } catch (error) {
    console.error("Error resubscribing:", error);
    return c.json({ error: "Failed to reactivate subscription" }, 500);
  }
});

// ==================== BYOK API KEY ENDPOINTS ====================

// Get API key status (never returns the actual key)
app.get("/api/settings/api-key", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Only return whether a key is set and a masked version
  const hasKey = !!user.anthropicApiKey;
  const maskedKey = hasKey
    ? `sk-ant-...${user.anthropicApiKey!.slice(-4)}`
    : null;

  return c.json({
    hasKey,
    maskedKey,
    tier: user.subscriptionTier,
  });
});

// Set API key (BYOK users only)
app.put("/api/settings/api-key", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  if (user.subscriptionTier !== "BYOK") {
    return c.json({ error: "API key is only available for BYOK plan" }, 403);
  }

  const body = await c.req.json();
  const { apiKey } = body;

  if (!apiKey || typeof apiKey !== "string") {
    return c.json({ error: "API key is required" }, 400);
  }

  // Basic validation for Anthropic API key format
  if (!apiKey.startsWith("sk-ant-")) {
    return c.json({ error: "Invalid Anthropic API key format" }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { anthropicApiKey: apiKey },
  });

  await logAudit({
    organizationId: getOrgIdFromHeader(c),
    userId: user.id,
    action: "api_key.updated",
    c,
  });

  return c.json({
    success: true,
    maskedKey: `sk-ant-...${apiKey.slice(-4)}`,
  });
});

// Delete API key
app.delete("/api/settings/api-key", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { anthropicApiKey: null },
  });

  await logAudit({
    organizationId: getOrgIdFromHeader(c),
    userId: user.id,
    action: "api_key.deleted",
    c,
  });

  return c.json({ success: true });
});

// ==================== CUSTOM REVIEW RULES ENDPOINTS ====================

// Get custom review rules
app.get("/api/settings/review-rules", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json({
    rules: user.customReviewRules || "",
  });
});

// Update custom review rules
app.put("/api/settings/review-rules", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await findDbUser(githubUser);

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Check subscription tier - all paid plans have access
  const tier = user.subscriptionTier;
  if (tier === "FREE") {
    return c.json({ error: "Custom review rules require a paid subscription" }, 403);
  }

  const body = await c.req.json();
  const { rules } = body;

  if (typeof rules !== "string") {
    return c.json({ error: "Rules must be a string" }, 400);
  }

  // Limit rules to 5000 characters
  if (rules.length > 5000) {
    return c.json({ error: "Rules must be 5000 characters or less" }, 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { customReviewRules: rules || null },
  });

  await logAudit({
    organizationId: getOrgIdFromHeader(c),
    userId: user.id,
    action: "review_rules.updated",
    metadata: { rulesLength: rules.length },
    c,
  });

  return c.json({ success: true, rules });
});

// Check if a GitHub user has an active seat in the organization that owns a repository (internal use only)
app.get("/api/internal/check-seat/:owner/:repo", async (c) => {
  const apiKey = c.req.header("X-API-Key");
  
  // Validate internal API key
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const { owner, repo } = c.req.param();
  const githubLogin = c.req.query("githubLogin");

  if (!githubLogin) {
    return c.json({ error: "githubLogin query parameter is required" }, 400);
  }

  try {
    // Get repository settings to find the organization
    const repoSettings = await prisma.repositorySettings.findUnique({
      where: { owner_repo: { owner, repo } },
      include: { organization: true },
    });

    if (!repoSettings || !repoSettings.organization) {
      return c.json({ hasSeat: false, reason: "Repository not found or not associated with an organization" });
    }

    const org = repoSettings.organization;

    // Check if organization has active subscription
    if (org.subscriptionStatus !== "ACTIVE" || !org.subscriptionTier) {
      return c.json({ hasSeat: false, reason: "Organization has no active subscription" });
    }

    // Find user by GitHub login
    const user = await prisma.user.findFirst({
      where: { login: githubLogin },
    });

    if (!user) {
      return c.json({ hasSeat: false, reason: "User not found in database" });
    }

    // Check if user is a member of the organization with a seat
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: org.id,
          userId: user.id,
        },
      },
      include: { organization: true },
    });

    if (!membership) {
      return c.json({ hasSeat: false, reason: "User is not a member of the organization" });
    }

    const hasSeat = membership.hasSeat && 
                    membership.organization.subscriptionStatus === "ACTIVE" &&
                    membership.organization.subscriptionTier !== null;

    return c.json({ 
      hasSeat,
      reason: hasSeat ? "User has an active seat" : "User does not have a seat assigned"
    });
  } catch (error) {
    console.error("Error checking seat:", error);
    return c.json({ error: "Failed to check seat" }, 500);
  }
});

// Get custom review rules for review agent (internal use only)
app.get("/api/internal/review-rules/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const apiKey = c.req.header("X-API-Key");

  // Validate internal API key
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get repo settings to find custom review rules
  const repoSettings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
  });

  if (!repoSettings) {
    return c.json({ rules: null });
  }

  return c.json({ rules: repoSettings.customReviewRules || null });
});

// Get API key for review agent (internal use only)
app.get("/api/internal/api-key/:owner/:repo", async (c) => {
  const { owner, repo } = c.req.param();
  const apiKey = c.req.header("X-API-Key");

  // Validate internal API key
  const expectedApiKey = process.env.REVIEW_AGENT_API_KEY;
  if (!expectedApiKey || apiKey !== expectedApiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Get repo settings to find the organization
  const repoSettings = await prisma.repositorySettings.findUnique({
    where: { owner_repo: { owner, repo } },
    include: {
      organization: true,
    },
  });

  if (!repoSettings?.organization) {
    return c.json({ error: "No organization associated with this repo" }, 404);
  }

  const org = repoSettings.organization;

  // Check if org has BYOK tier with active subscription
  const hasByokTier = org.subscriptionTier === "BYOK" && org.subscriptionStatus === "ACTIVE";

  if (!hasByokTier) {
    return c.json({ error: "Organization not on BYOK tier", useDefault: true });
  }

  if (!org.anthropicApiKey) {
    return c.json({ error: "No API key configured", useDefault: false });
  }

  return c.json({ apiKey: org.anthropicApiKey });
});

// ==================== ACCOUNT MANAGEMENT ENDPOINTS ====================

// Export all user data (GDPR compliance)
app.get("/api/account/export", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const userWhere = getDbUserWhere(githubUser);
  if (!userWhere) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: userWhere,
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              repositorySettings: true,
            },
          },
        },
      },
      auditLogs: {
        orderBy: { createdAt: "desc" },
        take: 1000,
      },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Get all repo settings from user's organizations
  const allRepoSettings = user.memberships.flatMap(
    (m) => m.organization.repositorySettings
  );

  // Get reviews for org's repos
  const repoIdentifiers = allRepoSettings.map((r: { owner: string; repo: string }) => ({
    owner: r.owner,
    repo: r.repo,
  }));

  const reviews = repoIdentifiers.length > 0 ? await prisma.review.findMany({
    where: {
      OR: repoIdentifiers.map((r: { owner: string; repo: string }) => ({
        owner: r.owner,
        repo: r.repo,
      })),
    },
    orderBy: { createdAt: "desc" },
  }) : [];

  // Build export data
  const exportData = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      githubId: user.githubId,
      login: user.login,
      name: user.name,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    organizations: user.memberships.map((m) => ({
      name: m.organization.name,
      slug: m.organization.slug,
      role: m.role,
      hasSeat: m.hasSeat,
      subscription: m.organization.subscriptionTier ? {
        tier: m.organization.subscriptionTier,
        status: m.organization.subscriptionStatus,
        seatCount: m.organization.seatCount,
        expiresAt: m.organization.subscriptionExpiresAt,
        cancelAtPeriodEnd: m.organization.cancelAtPeriodEnd,
      } : null,
    })),
    repositorySettings: allRepoSettings.map((r: { owner: string; repo: string; enabled: boolean; triageEnabled: boolean; createdAt: Date; updatedAt: Date }) => ({
      owner: r.owner,
      repo: r.repo,
      enabled: r.enabled,
      triageEnabled: r.triageEnabled,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    reviews: reviews.map((r) => ({
      owner: r.owner,
      repo: r.repo,
      pullNumber: r.pullNumber,
      reviewType: r.reviewType,
      createdAt: r.createdAt,
    })),
    auditLogs: user.auditLogs.map((log) => ({
      action: log.action,
      target: log.target,
      metadata: log.metadata,
      createdAt: log.createdAt,
    })),
  };

  await logAudit({
    organizationId: getOrgIdFromHeader(c),
    userId: user.id,
    action: "user.data_export",
    c,
  });

  return c.json(exportData);
});

// Delete user account (GDPR compliance)
app.delete("/api/account", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const userWhere = getDbUserWhere(githubUser);
  if (!userWhere) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const user = await prisma.user.findUnique({
    where: userWhere,
    include: {
      memberships: {
        where: { role: "OWNER" },
        include: { organization: true },
      },
    },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Cancel subscriptions and delete all organizations the user owns
  const ownedOrgIds: string[] = [];
  for (const membership of user.memberships) {
    const org = membership.organization;
    ownedOrgIds.push(org.id);

    if (org.subscriptionId && org.subscriptionStatus === "ACTIVE") {
      try {
        await paymentProvider.cancelSubscription(org.subscriptionId);
        console.log(`Cancelled subscription for org ${org.slug} during account deletion`);
      } catch (error) {
        console.error(`Failed to cancel subscription for org ${org.slug}:`, error);
        // Continue with deletion even if subscription cancellation fails
      }
    }
  }

  // Legacy: Cancel user-level subscription if active (for older accounts)
  if (user.subscriptionId && user.subscriptionStatus === "ACTIVE") {
    try {
      await paymentProvider.cancelSubscription(user.subscriptionId);
    } catch (error) {
      console.error("Failed to cancel legacy user subscription:", error);
    }
  }

  // Delete all organizations the user owns (cascades to members, invites, repo settings, audit logs)
  if (ownedOrgIds.length > 0) {
    await prisma.organization.deleteMany({
      where: { id: { in: ownedOrgIds } },
    });
    console.log(`Deleted ${ownedOrgIds.length} owned organizations during account deletion`);
  }

  // Delete remaining user-specific data
  await prisma.auditLog.deleteMany({
    where: { userId: user.id },
  });

  await prisma.repositorySettings.deleteMany({
    where: { userId: user.id },
  });

  await prisma.user.delete({
    where: { id: user.id },
  });

  console.log(`Account deleted for user ${user.login} (${user.id})`);

  return c.json({ success: true, message: "Account deleted successfully" });
});

// ==================== ONBOARDING ENDPOINTS ====================

// Complete onboarding
app.post("/api/onboarding/complete", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const body = await c.req.json();
  const { accountType, personalOrgId } = body;

  if (!accountType || (accountType !== "SOLO" && accountType !== "TEAM")) {
    return c.json({ error: "accountType must be SOLO or TEAM" }, 400);
  }

  // Find the user first
  const existingUser = await findDbUser(githubUser);
  if (!existingUser) {
    return c.json({ error: "User not found" }, 404);
  }

  // For SOLO users, we store the personal org ID so we can filter it out later
  const updateData: {
    accountType: "SOLO" | "TEAM";
    onboardingCompletedAt: Date;
    personalOrgId?: string;
  } = {
    accountType: accountType,
    onboardingCompletedAt: new Date(),
  };

  if (accountType === "SOLO" && personalOrgId) {
    updateData.personalOrgId = personalOrgId;
  }

  const user = await prisma.user.update({
    where: { id: existingUser.id },
    data: updateData,
  });

  await logAudit({
    userId: user.id,
    action: "user.onboarding_completed",
    metadata: { accountType, personalOrgId },
    c,
  });

  return c.json({
    success: true,
    accountType: user.accountType,
    onboardingCompletedAt: user.onboardingCompletedAt,
    personalOrgId: user.personalOrgId,
  });
});

// Update account type
app.put("/api/account/type", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);
  const githubUser = await getUserFromToken(token);

  if (!githubUser) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const body = await c.req.json();
  const { accountType } = body;

  if (!accountType || (accountType !== "SOLO" && accountType !== "TEAM")) {
    return c.json({ error: "accountType must be SOLO or TEAM" }, 400);
  }

  // Find the user first
  const existingUser = await findDbUser(githubUser);
  if (!existingUser) {
    return c.json({ error: "User not found" }, 404);
  }

  const user = await prisma.user.update({
    where: { id: existingUser.id },
    data: {
      accountType: accountType,
    },
  });

  await logAudit({
    userId: user.id,
    action: "user.account_type_changed",
    metadata: { accountType },
    c,
  });

  return c.json({
    success: true,
    accountType: user.accountType,
  });
});

// ==================== ORGANIZATION ROUTES ====================
app.route("/api/organizations", organizationRoutes);

// Unified webhook handler - works with both Polar and Stripe
app.post("/api/webhooks/:provider", async (c) => {
  const provider = c.req.param("provider");

  // Validate provider
  if (provider !== "polar" && provider !== "stripe") {
    return c.json({ error: "Invalid provider" }, 400);
  }

  const body = await c.req.text();
  const headers: Record<string, string> = {};

  // Collect relevant headers for each provider
  if (provider === "polar") {
    headers["webhook-signature"] = c.req.header("webhook-signature") || "";
  } else if (provider === "stripe") {
    headers["stripe-signature"] = c.req.header("stripe-signature") || "";
  }

  console.log(`Received ${provider} webhook`);

  try {
    // Use the unified webhook processor
    // It will parse the payload based on provider and handle the event
    const { polarProvider } = await import("./lib/payments/polar");
    const { stripeProvider } = await import("./lib/payments/stripe");
    const { handleWebhookEvent } = await import("./lib/payments/webhook-handler");

    const providerImpl = provider === "stripe" ? stripeProvider : polarProvider;
    const event = await providerImpl.parseWebhook(body, headers);
    await handleWebhookEvent(event);

    return c.json({ received: true });
  } catch (error) {
    console.error(`${provider} webhook handler error:`, error);
    return c.json({ error: "Webhook handler failed" }, 500);
  }
});

// Legacy Polar webhook handler support (redirects to unified handler)
// Keep for backwards compatibility during migration
app.post("/api/polar/webhook", async (c) => {
  // Forward to unified handler
  const body = await c.req.text();
  const headers: Record<string, string> = {
    "webhook-signature": c.req.header("webhook-signature") || "",
  };

  try {
    const { polarProvider } = await import("./lib/payments/polar");
    const { handleWebhookEvent } = await import("./lib/payments/webhook-handler");

    const event = await polarProvider.parseWebhook(body, headers);
    await handleWebhookEvent(event);

    return c.json({ received: true });
  } catch (error) {
    console.error("Polar webhook handler error:", error);
    return c.json({ error: "Webhook handler failed" }, 500);
  }
});

const port = Number(process.env.PORT) || 3000;
console.log(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
