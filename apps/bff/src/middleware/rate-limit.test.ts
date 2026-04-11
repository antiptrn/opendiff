import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { Hono } from "hono";

const mockGetRedisClient = mock(
  () => null as { eval: (...args: unknown[]) => Promise<unknown> } | null
);

mock.module("../services/redis", () => ({
  getRedisClient: mockGetRedisClient,
}));

import { __resetRateLimitForTests, rateLimit } from "./rate-limit";

function createApp(max = 2, windowMs = 1000) {
  const app = new Hono();
  app.use("/limited", rateLimit({ windowMs, max, keyPrefix: "test" }));
  app.get("/limited", (c) => c.json({ ok: true }));
  return app;
}

describe("rateLimit middleware", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalTrustProxy = process.env.RATE_LIMIT_TRUST_PROXY_HEADERS;
  const originalRedisCooldown = process.env.REDIS_RATE_LIMIT_COOLDOWN_MS;

  beforeEach(() => {
    __resetRateLimitForTests();
    mockGetRedisClient.mockReset();
    mockGetRedisClient.mockReturnValue(null);

    process.env.NODE_ENV = "test";
    process.env.RATE_LIMIT_TRUST_PROXY_HEADERS = "false";
    process.env.REDIS_RATE_LIMIT_COOLDOWN_MS = "1000";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.RATE_LIMIT_TRUST_PROXY_HEADERS = originalTrustProxy;
    process.env.REDIS_RATE_LIMIT_COOLDOWN_MS = originalRedisCooldown;
  });

  it("allows requests under limit and blocks when limit exceeded", async () => {
    const app = createApp(2, 1000);

    const one = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "1.1.1.1" } })
    );
    const two = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "1.1.1.1" } })
    );
    const three = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "1.1.1.1" } })
    );

    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(three.status).toBe(429);
    expect(three.headers.get("retry-after")).toBeTruthy();
  });

  it("resets counters after window elapses", async () => {
    const app = createApp(1, 20);

    const first = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "2.2.2.2" } })
    );
    const blocked = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "2.2.2.2" } })
    );
    await Bun.sleep(30);
    const afterReset = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "2.2.2.2" } })
    );

    expect(first.status).toBe(200);
    expect(blocked.status).toBe(429);
    expect(afterReset.status).toBe(200);
  });

  it("ignores X-Forwarded-For spoofing in production unless explicitly trusted", async () => {
    process.env.NODE_ENV = "production";
    process.env.RATE_LIMIT_TRUST_PROXY_HEADERS = "false";

    const app = createApp(1, 1000);

    const first = await app.fetch(
      new Request("http://localhost/limited", {
        headers: { "X-Forwarded-For": "8.8.8.8" },
      })
    );
    const second = await app.fetch(
      new Request("http://localhost/limited", {
        headers: { "X-Forwarded-For": "9.9.9.9" },
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it("uses Cloudflare connecting IP in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.RATE_LIMIT_TRUST_PROXY_HEADERS = "false";

    const app = createApp(1, 1000);

    const first = await app.fetch(
      new Request("http://localhost/limited", {
        headers: { "CF-Connecting-IP": "3.3.3.3" },
      })
    );
    const second = await app.fetch(
      new Request("http://localhost/limited", {
        headers: { "CF-Connecting-IP": "4.4.4.4" },
      })
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });

  it("temporarily skips Redis calls after a Redis failure", async () => {
    const brokenRedis = {
      eval: mock(() => Promise.reject(new Error("redis unavailable"))),
    };

    mockGetRedisClient.mockReturnValue(brokenRedis);
    process.env.REDIS_RATE_LIMIT_COOLDOWN_MS = "60000";

    const app = createApp(10, 1000);

    const one = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "7.7.7.7" } })
    );
    const two = await app.fetch(
      new Request("http://localhost/limited", { headers: { "X-Real-IP": "7.7.7.7" } })
    );

    expect(one.status).toBe(200);
    expect(two.status).toBe(200);
    expect(mockGetRedisClient).toHaveBeenCalledTimes(1);
    expect(brokenRedis.eval).toHaveBeenCalledTimes(1);
  });
});
