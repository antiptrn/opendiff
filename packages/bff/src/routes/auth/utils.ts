export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
export const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
export const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";

export function getBaseUrl(c: {
  req: { url: string; header: (name: string) => string | undefined };
}) {
  const url = new URL(c.req.url);
  const proto = c.req.header("x-forwarded-proto") || url.protocol.replace(":", "");
  return `${proto}://${url.host}`;
}

/**
 * Sanitize a client-provided redirect URL to prevent open redirect attacks.
 * Only allows relative paths. Returns null if the URL is unsafe.
 */
export function sanitizeRedirectUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    // Parse against a dummy base to detect absolute URLs and protocol-relative URLs
    const parsed = new URL(url, "http://localhost");
    // Reject if the URL resolved to a different host (absolute/protocol-relative URL)
    if (parsed.hostname !== "localhost") return null;
    // Reject backslash-based bypasses and non-path prefixes
    if (!url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return null;
    // Return only the path + search + hash (strips any injected authority)
    return parsed.pathname + parsed.search + parsed.hash;
  } catch {
    return null;
  }
}
