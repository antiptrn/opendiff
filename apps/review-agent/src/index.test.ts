import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Store original env vars
const originalEnv = { ...process.env };

describe("Application endpoints", () => {
  const WEBHOOK_SECRET = "test-secret-for-webhooks";
  const TEST_PORT = 3999;

  beforeAll(() => {
    // Set required environment variables
    process.env.PORT = String(TEST_PORT);
    process.env.GITHUB_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.GITHUB_TOKEN = "ghp_test_token";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    process.env.BOT_USERNAME = "test-bot";
    process.env.BOT_TEAMS = "team-a,team-b";
    process.env.SETTINGS_API_URL = "";
    process.env.REVIEW_AGENT_API_KEY = "test-review-agent-key";
  });

  afterAll(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  describe("GET /health", () => {
    it("should return ok status with timestamp", async () => {
      // Import the app after setting env vars
      const { default: app } = await import("./index");

      const request = new Request(`http://localhost:${TEST_PORT}/health`, {
        method: "GET",
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("ok");
      expect(body.timestamp).toBeDefined();
      // Verify timestamp is a valid ISO string
      expect(() => new Date(body.timestamp)).not.toThrow();
    });
  });

  describe("POST /webhook", () => {
    it("should reject requests with invalid signature (401)", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({ action: "opened", number: 1 });
      const invalidSignature = "sha256=invalidsignature123456789";

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": invalidSignature,
          "x-github-event": "pull_request",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(401);
      expect(body.error).toBe("Invalid signature");
    });

    it("should reject requests with missing signature (401)", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({ action: "opened", number: 1 });

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-github-event": "pull_request",
        },
        body: payload,
      });

      const response = await app.fetch(request);

      expect(response.status).toBe(401);
    });

    it("should accept valid signature and ignore non-review events", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({ action: "opened", number: 1 });
      const signature = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": "push", // Not a pull_request event
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("ignored");
    });

    it("should accept valid signature for pull_request event with non-trigger action", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({
        action: "closed", // Not a trigger action (opened, synchronize, ready_for_review)
        pull_request: { number: 42 },
      });
      const signature = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": "pull_request",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("ignored");
    });

    it("should enqueue pull_request review triggers", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({
        action: "opened",
        repository: {
          id: 1,
          owner: { login: "owner" },
          name: "repo",
        },
        pull_request: {
          number: 42,
          title: "Add queue",
          body: null,
          draft: false,
          head: { sha: "abc123", ref: "feature" },
          base: { sha: "def456", ref: "main" },
          user: { login: "author" },
        },
      });
      const signature = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": "pull_request",
          "x-github-delivery": "delivery-1",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(202);
      expect(body.status).toBe("queued");
      expect(body.key).toBe("owner/repo#42");
      expect(body.jobId).toBeDefined();
      expect(body.reviewQueue).toBeDefined();
    });

    it("should enqueue deterministic review when an issue comment only mentions the bot", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({
        action: "created",
        sender: { login: "reviewer" },
        repository: {
          id: 1,
          owner: { login: "owner" },
          name: "repo",
        },
        issue: {
          number: 42,
          pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/42" },
        },
        comment: {
          id: 1001,
          body: "  @test-bot  ",
          user: { login: "reviewer" },
        },
      });
      const signature = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": "issue_comment",
          "x-github-delivery": "delivery-comment-review",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(202);
      expect(body.status).toBe("queued");
      expect(body.trigger).toBe("issue_comment");
      expect(body.key).toBe("owner/repo#42");
      expect(body.jobId).toBeDefined();
      expect(body.reviewQueue).toBeDefined();
    });

    it("should keep non-bare issue comment mentions on the comment response path", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({
        action: "created",
        sender: { login: "reviewer" },
        repository: {
          id: 1,
          owner: { login: "owner" },
          name: "repo",
        },
        issue: {
          number: 43,
          pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/43" },
        },
        comment: {
          id: 1002,
          body: "@test-bot can you explain this?",
          user: { login: "reviewer" },
        },
      });
      const signature = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": "issue_comment",
          "x-github-delivery": "delivery-comment-reply",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("skipped");
      expect(body.reason).toBe("disabled");
    });

    it("should ignore non-bare alias mentions for issue comments", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({
        action: "created",
        sender: { login: "reviewer" },
        repository: {
          id: 1,
          owner: { login: "owner" },
          name: "repo",
        },
        issue: {
          number: 44,
          pull_request: { url: "https://api.github.com/repos/owner/repo/pulls/44" },
        },
        comment: {
          id: 1003,
          body: "@opendiff can you explain this?",
          user: { login: "reviewer" },
        },
      });
      const signature = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": "issue_comment",
          "x-github-delivery": "delivery-comment-alias",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("ignored");
      expect(body.reason).toBe("bot_not_mentioned");
    });

    it("should ignore review_requested events for other reviewers", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({
        action: "review_requested",
        requested_reviewer: { login: "human-reviewer" },
        repository: {
          id: 1,
          owner: { login: "owner" },
          name: "repo",
        },
        pull_request: {
          number: 42,
          title: "Add queue",
          body: null,
          draft: false,
          head: { sha: "abc123", ref: "feature" },
          base: { sha: "def456", ref: "main" },
          user: { login: "author" },
        },
      });
      const signature = `sha256=${createHmac("sha256", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature-256": signature,
          "x-github-event": "pull_request",
          "x-github-delivery": "delivery-2",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("ignored");
      expect(body.reason).toBe("review_not_requested_from_bot");
    });

    it("should support legacy sha1 signature header", async () => {
      const { default: app } = await import("./index");

      const payload = JSON.stringify({ action: "opened", number: 1 });
      const sha1Signature = `sha1=${createHmac("sha1", WEBHOOK_SECRET).update(payload).digest("hex")}`;

      const request = new Request(`http://localhost:${TEST_PORT}/webhook`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-hub-signature": sha1Signature, // Legacy header
          "x-github-event": "issues",
        },
        body: payload,
      });

      const response = await app.fetch(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.status).toBe("ignored");
    });
  });
});

describe("Environment configuration", () => {
  it("should parse BOT_TEAMS from comma-separated string", () => {
    process.env.BOT_TEAMS = "team-alpha,team-beta,team-gamma";
    const teams = (process.env.BOT_TEAMS || "").split(",").filter(Boolean);

    expect(teams).toHaveLength(3);
    expect(teams).toContain("team-alpha");
    expect(teams).toContain("team-beta");
    expect(teams).toContain("team-gamma");
  });

  it("should handle empty BOT_TEAMS", () => {
    process.env.BOT_TEAMS = "";
    const teams = (process.env.BOT_TEAMS || "").split(",").filter(Boolean);

    expect(teams).toHaveLength(0);
  });

  it("should handle undefined BOT_TEAMS", () => {
    process.env.BOT_TEAMS = undefined;
    const teams = (process.env.BOT_TEAMS || "").split(",").filter(Boolean);

    expect(teams).toHaveLength(0);
  });

  it("should default BOT_USERNAME when not set", () => {
    process.env.BOT_USERNAME = undefined;
    const botUsername = process.env.BOT_USERNAME || "opendiff-bot";

    expect(botUsername).toBe("opendiff-bot");
  });

  it("should parse PORT as integer", () => {
    process.env.PORT = "8080";
    const port = Number.parseInt(process.env.PORT || "3000", 10);

    expect(port).toBe(8080);
    expect(typeof port).toBe("number");
  });

  it("should default PORT to 3000 when not set", () => {
    process.env.PORT = undefined;
    const port = Number.parseInt(process.env.PORT || "3000", 10);

    expect(port).toBe(3000);
  });
});
