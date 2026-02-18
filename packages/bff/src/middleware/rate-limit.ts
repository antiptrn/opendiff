import type { Context, Next } from "hono";

interface RateLimitOptions {
  windowMs: number;
  max: number;
  methods?: string[];
  keyPrefix?: string;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;
const CLEANUP_INTERVAL_MS = 60_000;

function getClientIp(c: Context): string {
  const cfIp = c.req.header("CF-Connecting-IP");
  if (cfIp) return cfIp;

  const forwardedFor = c.req.header("X-Forwarded-For");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = c.req.header("X-Real-IP");
  if (realIp) return realIp;

  return "unknown";
}

function maybeCleanup(now: number): void {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

/**
 * In-memory rate limiter middleware.
 *
 * Notes:
 * - This protects a single process. For horizontally scaled production setups,
 *   keep edge limits (Cloudflare) as the primary defense.
 * - IP-based keying is used so it works before auth middleware runs.
 */
export function rateLimit({ windowMs, max, methods, keyPrefix = "rl" }: RateLimitOptions) {
  const normalizedMethods = methods?.map((method) => method.toUpperCase());

  return async (c: Context, next: Next) => {
    const method = c.req.method.toUpperCase();

    if (method === "OPTIONS") {
      await next();
      return;
    }

    if (normalizedMethods && !normalizedMethods.includes(method)) {
      await next();
      return;
    }

    const now = Date.now();
    maybeCleanup(now);

    const ip = getClientIp(c);
    const key = `${keyPrefix}:${ip}`;
    const existing = buckets.get(key);
    const resetAt = existing && existing.resetAt > now ? existing.resetAt : now + windowMs;
    const nextCount = existing && existing.resetAt > now ? existing.count + 1 : 1;
    const remaining = Math.max(0, max - nextCount);

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (nextCount > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    buckets.set(key, { count: nextCount, resetAt });
    await next();
  };
}
