/**
 * Personal access tokens, for connecting an AI agent (through the MCP server) to one organization.
 * Tokens are random, stored only as SHA-256 hashes, and work only on the routes the MCP tools use.
 */
import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { hashToken } from "./sessions";

export const ACCESS_TOKEN_PREFIX = "cpat_";

export function isAccessToken(token: string): boolean {
  return token.startsWith(ACCESS_TOKEN_PREFIX);
}

/** Create a token for a member of an organization and return the raw token (only ever returned once). */
export async function createAccessToken(input: {
  userId: string;
  organizationId: string;
  name: string;
}) {
  const token = `${ACCESS_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const record = await prisma.accessToken.create({
    data: {
      userId: input.userId,
      organizationId: input.organizationId,
      name: input.name,
      tokenHash: hashToken(token),
      tokenPrefix: token.slice(0, ACCESS_TOKEN_PREFIX.length + 6),
    },
    select: { id: true, name: true, tokenPrefix: true, createdAt: true, lastUsedAt: true },
  });
  return { token, record };
}

/**
 * Resolve a token to its user and organization, or null if it's unknown or the user has since left
 * the organization. Records when it was last used (at most once a minute).
 */
export async function findAccessToken(token: string) {
  const record = await prisma.accessToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!record) return null;

  const membership = await prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId: record.organizationId, userId: record.userId },
    },
    select: { userId: true },
  });
  if (!membership) return null;

  if (!record.lastUsedAt || Date.now() - record.lastUsedAt.getTime() > 60_000) {
    await prisma.accessToken
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return { user: record.user, organizationId: record.organizationId };
}

// The only requests an access token may make: what the MCP tools need, and nothing about billing,
// members, the account, AI keys or other tokens
const ACCESS_TOKEN_ROUTES: Array<{ method: string; path: RegExp }> = [
  { method: "GET", path: /^\/api\/reviews$/ },
  { method: "GET", path: /^\/api\/reviews\/[^/]+$/ },
  { method: "POST", path: /^\/api\/reviews\/[^/]+\/fixes\/[^/]+\/(accept|reject)$/ },
  { method: "GET", path: /^\/api\/review-issues$/ },
  { method: "GET", path: /^\/api\/repos$/ },
  { method: "GET", path: /^\/api\/org\/repos$/ },
  { method: "GET", path: /^\/api\/org\/repos\/[^/]+\/[^/]+$/ },
  { method: "GET", path: /^\/api\/settings\/[^/]+\/[^/]+$/ },
  { method: "PUT", path: /^\/api\/settings\/[^/]+\/[^/]+$/ },
  { method: "DELETE", path: /^\/api\/settings\/[^/]+\/[^/]+$/ },
  { method: "POST", path: /^\/api\/settings\/[^/]+\/[^/]+\/review-open-pulls$/ },
  { method: "PATCH", path: /^\/api\/reviews\/[^/]+$/ },
  { method: "GET", path: /^\/api\/stats$/ },
  { method: "GET", path: /^\/api\/stats\/usage$/ },
  { method: "GET", path: /^\/api\/notifications$/ },
  { method: "POST", path: /^\/api\/notifications\/(read-all|[^/]+\/read)$/ },
  { method: "GET", path: /^\/api\/settings\/review-rules$/ },
  { method: "PUT", path: /^\/api\/settings\/review-rules$/ },
  { method: "GET", path: /^\/api\/skills$/ },
  { method: "POST", path: /^\/api\/skills$/ },
  { method: "GET", path: /^\/api\/skills\/[^/]+$/ },
  { method: "PUT", path: /^\/api\/skills\/[^/]+$/ },
  { method: "DELETE", path: /^\/api\/skills\/[^/]+$/ },
  { method: "POST", path: /^\/api\/org\/repos\/[^/]+\/[^/]+\/sync-readme$/ },
];

export function isAccessTokenRouteAllowed(method: string, path: string): boolean {
  return ACCESS_TOKEN_ROUTES.some((route) => route.method === method && route.path.test(path));
}
