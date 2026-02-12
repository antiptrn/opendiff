import { describe, expect, it, mock, beforeEach } from "bun:test";
import { Hono } from "hono";

const mockFindDbUserFromToken = mock(() => Promise.resolve(null as Record<string, unknown> | null));

mock.module("../auth", () => ({
  findDbUserFromToken: mockFindDbUserFromToken,
}));

import { requireAuth } from "./auth";

function createApp() {
  const app = new Hono();
  app.use("/protected/*", requireAuth());
  app.get("/protected/resource", (c) => {
    const user = c.get("user");
    return c.json({ user });
  });
  return app;
}

describe("requireAuth middleware", () => {
  beforeEach(() => {
    mockFindDbUserFromToken.mockReset();
    mockFindDbUserFromToken.mockResolvedValue(null);
  });

  it("returns 401 when no Authorization header is present", async () => {
    const app = createApp();
    const res = await app.fetch(new Request("http://localhost/protected/resource"));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when Authorization header does not start with Bearer", async () => {
    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/protected/resource", {
        headers: { Authorization: "Basic abc123" },
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 401 when token is invalid (user not found)", async () => {
    mockFindDbUserFromToken.mockResolvedValue(null);

    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/protected/resource", {
        headers: { Authorization: "Bearer invalid-token" },
      })
    );

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Invalid token");
    expect(mockFindDbUserFromToken).toHaveBeenCalledWith("invalid-token");
  });

  it("sets user on context and calls next() when token is valid", async () => {
    const mockUser = { id: "user-1", email: "test@example.com", name: "Test User" };
    mockFindDbUserFromToken.mockResolvedValue(mockUser);

    const app = createApp();
    const res = await app.fetch(
      new Request("http://localhost/protected/resource", {
        headers: { Authorization: "Bearer valid-token" },
      })
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toEqual(mockUser);
    expect(mockFindDbUserFromToken).toHaveBeenCalledWith("valid-token");
  });
});
