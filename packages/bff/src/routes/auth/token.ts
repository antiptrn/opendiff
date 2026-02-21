/** Token refresh and user info endpoints for all OAuth providers (GitHub, Google, Microsoft). */
import { Hono } from "hono";
import { prisma } from "../../db";
import { getUserOrganizations } from "../../middleware/organization";
import { Sentry } from "../../utils/sentry";
import {
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
} from "./utils";

const tokenRoutes = new Hono();

tokenRoutes.post("/refresh", async (c) => {
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
    Sentry.captureException(error);
    console.error("Token refresh error:", error);
    return c.json({ error: "Token refresh failed" }, 500);
  }
});

tokenRoutes.get("/user", async (c) => {
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

export { tokenRoutes };
