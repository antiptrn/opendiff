import { describe, expect, it } from "bun:test";
import app from "./index";

describe("Server", () => {
  it("should respond to health check with ok status", async () => {
    const res = await app.fetch(new Request("http://localhost/"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.message).toBe("opendiff-bff running");
  });

  it("should return 404 for unknown routes", async () => {
    const res = await app.fetch(new Request("http://localhost/nonexistent"));
    expect(res.status).toBe(404);
  });

  it("should set CORS headers", async () => {
    const res = await app.fetch(
      new Request("http://localhost/", {
        headers: {
          Origin: process.env.FRONTEND_URL || "http://localhost:5174",
        },
      })
    );
    expect(res.headers.get("access-control-allow-origin")).toBeTruthy();
  });
});
