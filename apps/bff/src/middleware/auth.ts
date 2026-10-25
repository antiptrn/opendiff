/** Authentication middleware: validates Bearer tokens and attaches the user to the request context. */
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { findAccessToken, isAccessToken, isAccessTokenRouteAllowed } from "../access-tokens";
import { findDbUserFromToken, getOrgIdFromHeader } from "../auth";
import { prisma } from "../db";

type AuthUser = NonNullable<Awaited<ReturnType<typeof findDbUserFromToken>>>;

/**
 * Hono middleware that extracts a Bearer token from the Authorization header,
 * resolves it to a database User via `findDbUserFromToken`, and sets the user
 * on the Hono context. Returns 401 if the token is missing or invalid.
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);

    // Personal access tokens (for the MCP server) act for one organization, on a few routes only
    if (isAccessToken(token)) {
      if (!isAccessTokenRouteAllowed(c.req.method, c.req.path)) {
        return c.json({ error: "Access tokens can't be used for this request" }, 403);
      }
      const access = await findAccessToken(token);
      if (!access) {
        return c.json({ error: "Invalid token" }, 401);
      }
      c.set("user", access.user);
      c.set("accessTokenOrgId", access.organizationId);
      await next();
      return;
    }

    const user = await findDbUserFromToken(token);

    if (!user) {
      return c.json({ error: "Invalid token" }, 401);
    }

    c.set("user", user);
    await next();
  };
}

/** Retrieve the authenticated user set by `requireAuth`. Must be called after the middleware. */
export function getAuthUser(c: Context): AuthUser {
  return c.get("user") as AuthUser;
}

/** Retrieve the Bearer token from the Authorization header. Must be called after `requireAuth`. */
export function getAuthToken(c: Context): string {
  return (c.req.header("Authorization") as string).slice(7);
}

/**
 * Validate that the authenticated user is a member of the organization specified
 * by the X-Organization-Id header. Returns the orgId if valid, or null if no header.
 * Throws a 403 JSON response if the user is not a member.
 */
export async function requireOrgAccess(c: Context): Promise<string | null> {
  // An access token works only for its own organization, which it uses when none is named
  const accessTokenOrgId = c.get("accessTokenOrgId") as string | undefined;
  const orgId = getOrgIdFromHeader(c) ?? accessTokenOrgId ?? null;
  if (!orgId) return null;
  if (accessTokenOrgId && orgId !== accessTokenOrgId) {
    throw new HTTPException(403, { message: "This access token is for a different organization" });
  }

  const user = getAuthUser(c);
  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: orgId, userId: user.id },
    },
  });

  if (!membership) {
    throw new HTTPException(403, { message: "Not a member of this organization" });
  }

  return orgId;
}
