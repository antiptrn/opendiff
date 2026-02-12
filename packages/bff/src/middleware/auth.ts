/** Authentication middleware: validates Bearer tokens and attaches the user to the request context. */
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
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
  const orgId = getOrgIdFromHeader(c);
  if (!orgId) return null;

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
