export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
export const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID ?? "";
export const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET ?? "";
export const TURNSTILE_SECRET_KEY = process.env.TURNSTILE_SECRET_KEY ?? "";
export const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";
export const OAUTH_CALLBACK_BASE_URL = process.env.OAUTH_CALLBACK_BASE_URL || "";
export const PREVIEW_PR_NUMBER = process.env.PREVIEW_PR_NUMBER
  ? Number.parseInt(process.env.PREVIEW_PR_NUMBER, 10)
  : null;

const TURNSTILE_VERIFY_ERROR_REDIRECT = `${FRONTEND_URL}/login?error=captcha_failed&message=${encodeURIComponent("Please complete human verification and try again.")}`;

function isLocalFrontend(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

function shouldBypassTurnstile(): boolean {
  if (process.env.TURNSTILE_FORCE_ENABLED === "true") {
    return false;
  }

  if (process.env.NODE_ENV === "production") {
    return false;
  }

  if (process.env.NODE_ENV === "development" || process.env.BUN_ENV === "development") {
    return true;
  }

  return isLocalFrontend(FRONTEND_URL);
}

interface TurnstileContext {
  req: {
    query: (name: string) => string | undefined;
    header: (name: string) => string | undefined;
  };
}

export function getTurnstileErrorRedirect(): string {
  return TURNSTILE_VERIFY_ERROR_REDIRECT;
}

export function extractClientIp(req: TurnstileContext["req"]): string {
  const cfConnectingIp = req.header("cf-connecting-ip");
  const xForwardedFor = req.header("x-forwarded-for");
  return cfConnectingIp || xForwardedFor?.split(",")[0]?.trim() || "";
}

export async function verifyTurnstileToken({
  token,
  ip,
}: {
  token: string | null | undefined;
  ip?: string;
}): Promise<boolean> {
  if (shouldBypassTurnstile()) {
    return true;
  }

  if (!TURNSTILE_SECRET_KEY) {
    // Bypass verification when TURNSTILE_SECRET_KEY is not configured (backward compatibility)
    return true;
  }

  if (!token) {
    return false;
  }

  // SECURITY: Require a valid IP address to prevent token replay attacks across different IPs.
  // Cloudflare Turnstile binds tokens to the client IP, so we must provide it for proper validation.
  if (!ip) {
    console.error(
      "[SECURITY ERROR] Turnstile verification called without a valid IP address. " +
        "This allows token replay attacks. Failing verification."
    );
    return false;
  }

  try {
    const body = new URLSearchParams({
      secret: TURNSTILE_SECRET_KEY,
      response: token,
      remoteip: ip,
    });

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 10000);

    try {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal: abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return false;
      }

      // Validate content-type before parsing JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        return false;
      }

      // Explicitly handle JSON parsing errors
      try {
        const result = (await response.json()) as { success?: boolean };
        return !!result.success;
      } catch {
        // JSON parsing failed
        return false;
      }
    } finally {
      clearTimeout(timeoutId);
    }
  } catch {
    return false;
  }
}

/**
 * Verifies Turnstile token + client IP from the incoming request.
 * Requires deployment behind Cloudflare or a trusted proxy that sets client IP headers.
 */
export async function verifyTurnstileRequest(c: TurnstileContext): Promise<boolean> {
  const turnstileToken = c.req.query("turnstileToken");
  const clientIp = extractClientIp(c.req);

  if (!clientIp) {
    console.warn(
      "[SECURITY WARNING] Failed to extract client IP from cf-connecting-ip or x-forwarded-for headers. " +
        "Turnstile verification will fail. Ensure the BFF is deployed behind Cloudflare or a trusted proxy."
    );
  }

  return verifyTurnstileToken({ token: turnstileToken, ip: clientIp });
}

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
