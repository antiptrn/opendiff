import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { Hono } from "hono";
import { CodeReviewAgent } from "./agent/reviewer";
import { GitHubClient } from "./github/client";
import { ReviewFormatter } from "./review/formatter";
import { WebhookHandler } from "./webhook/handler";
import { validateWebhookSignature } from "./webhook/validator";

// Configuration from environment
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY;
const GITHUB_PRIVATE_KEY_PATH = process.env.GITHUB_PRIVATE_KEY_PATH;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const BOT_USERNAME = process.env.BOT_USERNAME || "antiptrn-bot";
const BOT_TEAMS = (process.env.BOT_TEAMS || "").split(",").filter(Boolean);
const SETTINGS_API_URL = process.env.SETTINGS_API_URL;
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY;

// Record a review in the database
async function recordReview(data: {
  owner: string;
  repo: string;
  pullNumber: number;
  reviewType: "initial" | "comment_reply";
  reviewId?: number;
  commentId?: number;
}): Promise<void> {
  if (!SETTINGS_API_URL) {
    console.warn("SETTINGS_API_URL not configured, skipping review recording");
    return;
  }

  try {
    const response = await fetch(`${SETTINGS_API_URL}/api/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...data,
        apiKey: REVIEW_AGENT_API_KEY,
      }),
    });

    if (!response.ok) {
      console.warn(`Failed to record review: ${response.status}`);
    }
  } catch (error) {
    console.warn("Error recording review:", error);
  }
}

// Settings interface - uses effectiveEnabled/effectiveTriageEnabled which accounts for subscription status
interface RepositorySettings {
  owner: string;
  repo: string;
  enabled: boolean;
  triageEnabled: boolean;
  effectiveEnabled: boolean;
  effectiveTriageEnabled: boolean;
}

// Fetch custom review rules from the server
async function getCustomReviewRules(owner: string, repo: string): Promise<string | null> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${SETTINGS_API_URL}/api/internal/review-rules/${owner}/${repo}`, {
      headers: {
        "X-API-Key": REVIEW_AGENT_API_KEY,
      },
    });
    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as { rules?: string };
    return data.rules || null;
  } catch (error) {
    console.warn(`Error fetching custom rules for ${owner}/${repo}:`, error);
    return null;
  }
}

// Fetch repository settings from the server
async function getRepositorySettings(owner: string, repo: string): Promise<RepositorySettings> {
  // Default settings - features disabled until explicitly enabled by a subscriber
  const defaultSettings: RepositorySettings = {
    owner,
    repo,
    enabled: false,
    triageEnabled: false,
    effectiveEnabled: false,
    effectiveTriageEnabled: false,
  };

  if (!SETTINGS_API_URL) {
    console.warn(`SETTINGS_API_URL not configured, reviews disabled for ${owner}/${repo}`);
    return defaultSettings;
  }

  try {
    const response = await fetch(`${SETTINGS_API_URL}/api/settings/${owner}/${repo}`);
    if (!response.ok) {
      console.warn(`Failed to fetch settings for ${owner}/${repo}, features disabled`);
      return defaultSettings;
    }
    return (await response.json()) as RepositorySettings;
  } catch (error) {
    console.warn(`Error fetching settings for ${owner}/${repo}:`, error);
    return defaultSettings;
  }
}

// Check if a GitHub user has an active seat in the organization that owns a repository
async function checkUserHasSeat(
  owner: string,
  repo: string,
  githubLogin: string
): Promise<boolean> {
  if (!SETTINGS_API_URL || !REVIEW_AGENT_API_KEY) {
    console.warn("SETTINGS_API_URL or REVIEW_AGENT_API_KEY not configured, skipping seat check");
    return true; // Allow review if we can't check (fail open)
  }

  try {
    const response = await fetch(
      `${SETTINGS_API_URL}/api/internal/check-seat/${owner}/${repo}?githubLogin=${encodeURIComponent(githubLogin)}`,
      {
        headers: {
          "X-API-Key": REVIEW_AGENT_API_KEY,
        },
      }
    );

    if (!response.ok) {
      console.warn(
        `Failed to check seat for ${githubLogin} in ${owner}/${repo}: ${response.status}`
      );
      return true; // Allow review if check fails (fail open)
    }

    const data = (await response.json()) as { hasSeat: boolean; reason?: string };
    if (!data.hasSeat && data.reason) {
      console.log(`Seat check failed: ${data.reason}`);
    }
    return data.hasSeat;
  } catch (error) {
    console.warn(`Error checking seat for ${githubLogin} in ${owner}/${repo}:`, error);
    return true; // Allow review if check fails (fail open)
  }
}

// Load private key from file or environment
function getPrivateKey(): string | undefined {
  if (GITHUB_PRIVATE_KEY) {
    return GITHUB_PRIVATE_KEY;
  }
  if (GITHUB_PRIVATE_KEY_PATH) {
    return readFileSync(GITHUB_PRIVATE_KEY_PATH, "utf-8");
  }
  return undefined;
}

// Create Octokit with personal token
function createOctokitWithToken(): Octokit {
  if (!GITHUB_TOKEN) {
    throw new Error("GITHUB_TOKEN not configured");
  }
  return new Octokit({ auth: GITHUB_TOKEN });
}

// Create Octokit with GitHub App installation auth
function createOctokitWithApp(installationId: number): Octokit {
  const privateKey = getPrivateKey();
  if (!GITHUB_APP_ID || !privateKey) {
    throw new Error("GITHUB_APP_ID and private key required for App auth");
  }

  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: GITHUB_APP_ID,
      privateKey: privateKey,
      installationId: installationId,
    },
  });
}

// Create Octokit based on available auth
function createOctokit(installationId?: number): Octokit {
  // Prefer GitHub App auth if configured
  const privateKey = getPrivateKey();
  if (GITHUB_APP_ID && privateKey && installationId) {
    return createOctokitWithApp(installationId);
  }

  // Fall back to personal token
  if (GITHUB_TOKEN) {
    return createOctokitWithToken();
  }

  throw new Error(
    "No GitHub authentication configured. Set GITHUB_TOKEN or GITHUB_APP_ID + GITHUB_PRIVATE_KEY_PATH"
  );
}

const app = new Hono();

// Health check endpoint
app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Webhook endpoint
app.post("/webhook", async (c) => {
  // Validate signature
  const signature = c.req.header("x-hub-signature-256") || c.req.header("x-hub-signature") || "";
  const body = await c.req.text();

  if (!validateWebhookSignature(body, signature, WEBHOOK_SECRET)) {
    console.error("Invalid webhook signature");
    return c.json({ error: "Invalid signature" }, 401);
  }

  // Parse payload
  const payload = JSON.parse(body);
  const event = c.req.header("x-github-event");

  console.log(`Received webhook: ${event} - ${payload.action || "no action"}`);

  // Handle pull request events
  if (event === "pull_request") {
    const triggerActions = ["opened", "synchronize", "ready_for_review"];

    if (triggerActions.includes(payload.action)) {
      try {
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;

        // Check repository settings - use effectiveEnabled which accounts for subscription status
        const settings = await getRepositorySettings(owner, repo);
        if (!settings.effectiveEnabled) {
          console.log(
            `Reviews disabled for ${owner}/${repo} (enabled: ${settings.enabled}, effectiveEnabled: ${settings.effectiveEnabled})`
          );
          return c.json({ status: "skipped", reason: "disabled" });
        }

        // Check if PR author has an active seat
        const prAuthor = payload.pull_request?.user?.login;
        if (prAuthor) {
          const hasSeat = await checkUserHasSeat(owner, repo, prAuthor);
          if (!hasSeat) {
            console.log(`PR author ${prAuthor} does not have an active seat for ${owner}/${repo}`);
            return c.json({ status: "skipped", reason: "author_no_seat" });
          }
        }

        // Initialize services - pass installation ID for GitHub App auth
        const installationId = payload.installation?.id;
        const octokit = createOctokit(installationId);
        const githubClient = new GitHubClient(octokit);
        const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
        const agent = new CodeReviewAgent(anthropic);
        const formatter = new ReviewFormatter();
        const handler = new WebhookHandler(githubClient, agent, formatter);

        // Skip draft PRs
        if (payload.pull_request?.draft) {
          console.log("Skipping draft PR");
          return c.json({ status: "skipped", reason: "draft" });
        }

        // Fetch custom review rules
        const customRules = await getCustomReviewRules(owner, repo);
        if (customRules) {
          console.log(`Using custom review rules for ${owner}/${repo}`);
        }

        // Process the PR
        const result = await handler.handlePullRequestOpened(payload, BOT_USERNAME, customRules);

        if (result.skipped) {
          console.log("PR skipped (opened by bot)");
          return c.json({ status: "skipped" });
        }

        if (!result.success) {
          console.error("Review failed:", result.error);
          return c.json({ error: result.error }, 500);
        }

        // Record the review
        await recordReview({
          owner,
          repo,
          pullNumber: payload.pull_request.number,
          reviewType: "initial",
          reviewId: result.reviewId,
        });

        console.log(`Review submitted successfully: ${result.reviewId}`);
        return c.json({ status: "reviewed", reviewId: result.reviewId });
      } catch (error) {
        console.error("Error processing webhook:", error);
        return c.json({ error: "Internal error" }, 500);
      }
    }
  }

  // Handle review comments (inline code comments)
  if (event === "pull_request_review_comment" && payload.action === "created") {
    try {
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;

      // Check repository settings - triage must be enabled for comment responses (uses effective state for subscription checking)
      const settings = await getRepositorySettings(owner, repo);
      if (!settings.effectiveEnabled || !settings.effectiveTriageEnabled) {
        console.log(
          `Comment responses disabled for ${owner}/${repo} (effectiveEnabled: ${settings.effectiveEnabled}, effectiveTriage: ${settings.effectiveTriageEnabled})`
        );
        return c.json({ status: "skipped", reason: "triage_disabled" });
      }

      const installationId = payload.installation?.id;
      const octokit = createOctokit(installationId);
      const githubClient = new GitHubClient(octokit);
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const agent = new CodeReviewAgent(anthropic);
      const formatter = new ReviewFormatter();
      const handler = new WebhookHandler(githubClient, agent, formatter);

      // Fetch custom review rules
      const customRules = await getCustomReviewRules(owner, repo);

      const result = await handler.handleReviewComment(payload, BOT_USERNAME, customRules);

      if (result.skipped) {
        console.log("Review comment skipped (not for bot)");
        return c.json({ status: "skipped" });
      }

      if (!result.success) {
        console.error("Comment reply failed:", result.error);
        return c.json({ error: result.error }, 500);
      }

      // Record the comment reply
      await recordReview({
        owner,
        repo,
        pullNumber: payload.pull_request.number,
        reviewType: "comment_reply",
        commentId: result.reviewId,
      });

      console.log(`Comment reply posted: ${result.reviewId}`);
      return c.json({ status: "replied", commentId: result.reviewId });
    } catch (error) {
      console.error("Error processing review comment:", error);
      return c.json({ error: "Internal error" }, 500);
    }
  }

  // Handle issue comments (PR general comments)
  if (event === "issue_comment" && payload.action === "created") {
    try {
      const owner = payload.repository.owner.login;
      const repo = payload.repository.name;

      // Check repository settings - triage must be enabled for comment responses (uses effective state for subscription checking)
      const settings = await getRepositorySettings(owner, repo);
      if (!settings.effectiveEnabled || !settings.effectiveTriageEnabled) {
        console.log(
          `Comment responses disabled for ${owner}/${repo} (effectiveEnabled: ${settings.effectiveEnabled}, effectiveTriage: ${settings.effectiveTriageEnabled})`
        );
        return c.json({ status: "skipped", reason: "triage_disabled" });
      }

      const installationId = payload.installation?.id;
      const octokit = createOctokit(installationId);
      const githubClient = new GitHubClient(octokit);
      const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const agent = new CodeReviewAgent(anthropic);
      const formatter = new ReviewFormatter();
      const handler = new WebhookHandler(githubClient, agent, formatter);

      // Fetch custom review rules
      const customRules = await getCustomReviewRules(owner, repo);

      const result = await handler.handleIssueComment(payload, BOT_USERNAME, customRules);

      if (result.skipped) {
        console.log("Issue comment skipped (not for bot or not a PR)");
        return c.json({ status: "skipped" });
      }

      if (!result.success) {
        console.error("Comment reply failed:", result.error);
        return c.json({ error: result.error }, 500);
      }

      // Record the comment reply
      await recordReview({
        owner,
        repo,
        pullNumber: payload.issue.number,
        reviewType: "comment_reply",
        commentId: result.reviewId,
      });

      console.log(`Comment reply posted: ${result.reviewId}`);
      return c.json({ status: "replied", commentId: result.reviewId });
    } catch (error) {
      console.error("Error processing issue comment:", error);
      return c.json({ error: "Internal error" }, 500);
    }
  }

  // Unknown or unhandled event
  return c.json({ status: "ignored" });
});

// Start server
console.log(`Starting antiptrn-review-agent on port ${PORT}...`);
console.log(`Bot username: ${BOT_USERNAME}`);
console.log(`Bot teams: ${BOT_TEAMS.length > 0 ? BOT_TEAMS.join(", ") : "none"}`);
const privateKey = getPrivateKey();
if (GITHUB_APP_ID && privateKey) {
  console.log(`Auth: GitHub App (ID: ${GITHUB_APP_ID})`);
} else if (GITHUB_TOKEN) {
  console.log("Auth: Personal Access Token");
} else {
  console.log("Auth: Not configured!");
}

export default {
  port: PORT,
  fetch: app.fetch,
};
