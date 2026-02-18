import type { Context, Next } from "hono";
import { getRedisClient } from "../services/redis";

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
const MAX_IN_MEMORY_BUCKETS = 100_000;
let lastRedisFailureLogAt = 0;
const REDIS_FAILURE_LOG_INTERVAL_MS = 15_000;
const RATE_LIMIT_LUA = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;

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

function setInMemoryBucket(key: string, bucket: Bucket): void {
  if (buckets.size >= MAX_IN_MEMORY_BUCKETS && !buckets.has(key)) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey) {
      buckets.delete(oldestKey);
    }
  }

  buckets.set(key, bucket);
}

function maybeLogRedisFailure(error: unknown): void {
  const now = Date.now();
  if (now - lastRedisFailureLogAt < REDIS_FAILURE_LOG_INTERVAL_MS) {
    return;
  }

  lastRedisFailureLogAt = now;
  console.error("Redis rate limiter unavailable, falling back to in-memory buckets:", error);
}

async function incrementRedisBucket(key: string, windowMs: number): Promise<Bucket | null> {
  const redis = getRedisClient();
  if (!redis) {
    return null;
  }

  try {
    const result = (await redis.eval(RATE_LIMIT_LUA, 1, key, String(windowMs))) as [number, number];
    const count = Number(result?.[0] ?? 0);
    const ttlMs = Number(result?.[1] ?? windowMs);
    const normalizedTtl = ttlMs > 0 ? ttlMs : windowMs;

    return {
      count,
      resetAt: Date.now() + normalizedTtl,
    };
  } catch (error) {
    maybeLogRedisFailure(error);
    return null;
  }
}

/**
 * Redis-backed rate limiter middleware with in-memory fallback.
 *
 * Notes:
 * - Redis is preferred for shared limits across instances.
 * - If Redis is unavailable, falls back to process-local buckets.
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

    const ip = getClientIp(c);
    const key = `${keyPrefix}:${ip}`;

    const redisBucket = await incrementRedisBucket(key, windowMs);

    if (!redisBucket) {
      maybeCleanup(now);
    }

    const existing = redisBucket ? null : buckets.get(key);
    const resetAt = redisBucket
      ? redisBucket.resetAt
      : existing && existing.resetAt > now
        ? existing.resetAt
        : now + windowMs;
    const nextCount = redisBucket
      ? redisBucket.count
      : existing && existing.resetAt > now
        ? existing.count + 1
        : 1;
    const remaining = Math.max(0, max - nextCount);

    c.header("X-RateLimit-Limit", String(max));
    c.header("X-RateLimit-Remaining", String(remaining));
    c.header("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));

    if (nextCount > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - now) / 1000));
      c.header("Retry-After", String(retryAfterSeconds));
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    if (!redisBucket) {
      setInMemoryBucket(key, { count: nextCount, resetAt });
    }

    await next();
  };
}
