import { readFileSync } from "node:fs";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "@octokit/rest";
import { type Context, Hono } from "hono";
import { CodeReviewAgent } from "./agent/reviewer";
import { TriageAgent } from "./agent/triage";
import { GitHubClient } from "./github/client";
import { generateReviewSummary } from "./internal/generate-summary";
import { runLocalReview } from "./internal/local-review";
import { getProviderModelsCatalog } from "./internal/provider-models";
import { ReviewFormatter } from "./review/formatter";
import { AsyncJobQueue } from "./utils/async-job-queue";
import { applyPatchAndPush } from "./utils/fix-apply";
import { withClonedRepo } from "./utils/git";
import {
  type ReviewFailureCommentKind,
  type TokenQuotaAwareRepositorySettings,
  upsertReviewFailureComment,
  upsertTokenQuotaBlockedComment,
} from "./utils/quota-comment";
import {
  type RepositorySettings,
  getCustomReviewRules,
  getRepositorySettings,
  getRuntimeAiConfig,
  hasPendingClarificationLocks,
  isSettingsApiUnavailableError,
  recordReview,
  recordReviewComments,
} from "./utils/settings";
import { WebhookHandler } from "./webhook/handler";
import { validateWebhookSignature } from "./webhook/validator";

// Configuration from environment
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_PRIVATE_KEY = process.env.GITHUB_PRIVATE_KEY;
const GITHUB_PRIVATE_KEY_PATH = process.env.GITHUB_PRIVATE_KEY_PATH;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const BOT_USERNAME = process.env.BOT_USERNAME || "opendiff-bot";
const BOT_TEAMS = (process.env.BOT_TEAMS || "").split(",").filter(Boolean);
const REVIEW_AGENT_API_KEY = process.env.REVIEW_AGENT_API_KEY;

function parsePositiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const REVIEW_QUEUE_CONCURRENCY = parsePositiveIntegerEnv("REVIEW_QUEUE_CONCURRENCY", 1);
const REVIEW_QUEUE_MAX_SIZE = parsePositiveIntegerEnv("REVIEW_QUEUE_MAX_SIZE", 100);
const REVIEW_QUEUE_MAX_ATTEMPTS = parsePositiveIntegerEnv("REVIEW_QUEUE_MAX_ATTEMPTS", 2);
const REVIEW_QUEUE_RETRY_DELAY_MS = parsePositiveIntegerEnv("REVIEW_QUEUE_RETRY_DELAY_MS", 15_000);

interface PullRequestWebhookPayload {
  action: string;
  sender?: { login: string };
  installation?: { id: number };
  requested_reviewer?: { login: string };
  requested_team?: { slug: string };
  repository: {
    id: number;
    owner: { login: string };
    name: string;
  };
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    draft?: boolean;
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
    user: { login: string };
  };
}

interface PullRequestReviewJob {
  payload: PullRequestWebhookPayload;
  deliveryId: string | null;
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

// Shared context initialised at the start of every webhook event handler
interface WebhookContext {
  owner: string;
  repo: string;
  settings: RepositorySettings;
  githubClient: GitHubClient;
  handler: WebhookHandler;
  customRules: string | null;
  triageAgent: TriageAgent;
}

async function initWebhookContext(payload: {
  repository: { id?: number; owner: { login: string }; name: string };
  installation?: { id: number };
}): Promise<WebhookContext> {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const githubRepoId = payload.repository.id;

  const settings = await getRepositorySettings(owner, repo, githubRepoId);
  const aiConfig = await getRuntimeAiConfig(owner, repo, githubRepoId);

  const installationId = payload.installation?.id;
  const octokit = createOctokit(installationId);
  const githubClient = new GitHubClient(octokit);
  const agent = new CodeReviewAgent(aiConfig);
  const formatter = new ReviewFormatter();
  const triageAgent = new TriageAgent(aiConfig);
  const handler = new WebhookHandler(githubClient, agent, formatter, triageAgent);

  const customRules = await getCustomReviewRules(owner, repo, githubRepoId);
  if (customRules) {
    console.log(`Using custom review rules for ${owner}/${repo}`);
  }

  return { owner, repo, settings, githubClient, handler, customRules, triageAgent };
}

function buildPullRequestReviewJobKey(payload: PullRequestWebhookPayload): string {
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const pullNumber = payload.pull_request?.number ?? "unknown";
  return `${owner}/${repo}#${pullNumber}`;
}

function isReviewRequestedFromBot(payload: PullRequestWebhookPayload): boolean {
  return (
    payload.requested_reviewer?.login === BOT_USERNAME ||
    Boolean(payload.requested_team && BOT_TEAMS.includes(payload.requested_team.slug))
  );
}

function settingsApiUnavailableResponse(c: Context, error: unknown): Response {
  const message = error instanceof Error ? error.message : "Settings API unavailable";
  console.error("Settings API unavailable while handling webhook:", error);
  return c.json(
    {
      error: "Settings API unavailable",
      reason: message,
    },
    503
  );
}

function isTokenQuotaExhausted(
  settings: RepositorySettings
): settings is TokenQuotaAwareRepositorySettings {
  return (settings as TokenQuotaAwareRepositorySettings).disabledReason === "quota_exhausted";
}

async function commentOnTokenQuotaBlocked(options: {
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  pullNumber: number;
  settings: RepositorySettings;
}): Promise<void> {
  if (!isTokenQuotaExhausted(options.settings)) {
    return;
  }

  try {
    await upsertTokenQuotaBlockedComment(
      options.githubClient,
      options.owner,
      options.repo,
      options.pullNumber,
      BOT_USERNAME,
      options.settings
    );
  } catch (error) {
    console.warn(
      `Failed to post token quota notice for ${options.owner}/${options.repo}#${options.pullNumber}:`,
      error
    );
  }
}

async function commentOnPullRequestFailure(options: {
  githubClient: GitHubClient;
  owner: string;
  repo: string;
  pullNumber: number;
  kind: ReviewFailureCommentKind;
  deliveryId?: string | null;
  error?: unknown;
}): Promise<void> {
  try {
    await upsertReviewFailureComment(
      options.githubClient,
      options.owner,
      options.repo,
      options.pullNumber,
      BOT_USERNAME,
      {
        kind: options.kind,
        deliveryId: options.deliveryId,
      }
    );
  } catch (commentError) {
    console.warn(
      `Failed to post ${options.kind} failure notice for ${options.owner}/${options.repo}#${options.pullNumber}:`,
      commentError
    );
  }

  if (options.error) {
    console.error(
      `${options.kind} failed for ${options.owner}/${options.repo}#${options.pullNumber}:`,
      options.error
    );
  }
}

async function commentOnWebhookPullRequestFailure(
  payload: {
    installation?: { id?: number };
    repository?: { owner?: { login?: string }; name?: string };
    pull_request?: { number?: number };
    issue?: { number?: number; pull_request?: { url: string } };
  },
  kind: ReviewFailureCommentKind,
  error: unknown,
  deliveryId?: string | null,
  githubClient?: GitHubClient
): Promise<void> {
  const owner = payload.repository?.owner?.login;
  const repo = payload.repository?.name;
  const pullNumber =
    payload.pull_request?.number ??
    (payload.issue?.pull_request ? payload.issue.number : undefined);
  if (!owner || !repo || !pullNumber) {
    return;
  }

  let client = githubClient;
  try {
    client ??= new GitHubClient(createOctokit(payload.installation?.id));
  } catch (authError) {
    console.warn(
      `Unable to create GitHub client for ${kind} failure notice on ${owner}/${repo}#${pullNumber}:`,
      authError
    );
    console.error(`${kind} failed before a failure notice could be posted:`, error);
    return;
  }

  await commentOnPullRequestFailure({
    githubClient: client,
    owner,
    repo,
    pullNumber,
    kind,
    deliveryId,
    error,
  });
}

async function addReviewInProgressReaction(
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<number | null> {
  try {
    const { id } = await githubClient.createPullRequestEyesReaction(owner, repo, pullNumber);
    console.log(`Added review in-progress reaction ${id} for ${owner}/${repo}#${pullNumber}`);
    return id;
  } catch (error) {
    console.warn(
      `Failed to add review in-progress reaction for ${owner}/${repo}#${pullNumber}:`,
      error
    );
    return null;
  }
}

async function removeReviewInProgressReaction(
  githubClient: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  reactionId: number | null
): Promise<void> {
  if (!reactionId) {
    return;
  }

  try {
    await githubClient.deletePullRequestEyesReaction(owner, repo, pullNumber, reactionId);
    console.log(
      `Removed review in-progress reaction ${reactionId} for ${owner}/${repo}#${pullNumber}`
    );
  } catch (error) {
    console.warn(
      `Failed to remove review in-progress reaction ${reactionId} for ${owner}/${repo}#${pullNumber}:`,
      error
    );
  }
}

async function processPullRequestReviewJob(job: PullRequestReviewJob): Promise<void> {
  const { payload, deliveryId } = job;

  if (!payload.pull_request) {
    console.log(
      `Skipping queued pull_request webhook without pull_request payload (${deliveryId})`
    );
    return;
  }

  let githubClient: GitHubClient | undefined;
  let failureCommentPosted = false;
  let reviewReaction: {
    githubClient: GitHubClient;
    owner: string;
    repo: string;
    pullNumber: number;
    id: number | null;
  } | null = null;

  try {
    const {
      owner,
      repo,
      settings,
      githubClient: contextGithubClient,
      handler,
      customRules,
      triageAgent,
    } = await initWebhookContext(payload);
    githubClient = contextGithubClient;

    if (!settings.effectiveEnabled) {
      console.log(
        `Reviews disabled for ${owner}/${repo} (enabled: ${settings.enabled}, effectiveEnabled: ${settings.effectiveEnabled}, reason: ${settings.disabledReason ?? "unknown"})`
      );
      await commentOnTokenQuotaBlocked({
        githubClient,
        owner,
        repo,
        pullNumber: payload.pull_request.number,
        settings,
      });
      return;
    }

    if (payload.pull_request.draft) {
      console.log(`Skipping draft PR ${owner}/${repo}#${payload.pull_request.number}`);
      return;
    }

    const sender = payload.sender?.login;
    let triageEnabled = true;
    if (payload.action === "synchronize" && sender?.includes("[bot]")) {
      const pendingLocks = await hasPendingClarificationLocks(
        owner,
        repo,
        payload.pull_request.number
      );
      if (pendingLocks) {
        triageEnabled = false;
        console.log(
          `Skipping triage on bot synchronize for ${owner}/${repo}#${payload.pull_request.number} due to pending clarification locks`
        );
      }
    }

    const triageOptions = {
      enabled: triageEnabled,
      autofixEnabled: settings.autofixEnabled,
      triageAgent,
      botUsername: BOT_USERNAME,
    };

    reviewReaction = {
      githubClient,
      owner,
      repo,
      pullNumber: payload.pull_request.number,
      id: await addReviewInProgressReaction(githubClient, owner, repo, payload.pull_request.number),
    };

    const result =
      payload.action === "review_requested"
        ? await handler.handlePullRequestReviewRequested(
            payload,
            BOT_USERNAME,
            BOT_TEAMS,
            customRules,
            settings.sensitivity
          )
        : await handler.handlePullRequestOpened(
            payload,
            BOT_USERNAME,
            customRules,
            triageOptions,
            settings.sensitivity
          );

    if (result.skipped) {
      console.log(`Queued PR review skipped for ${owner}/${repo}#${payload.pull_request.number}`);
      return;
    }

    if (!result.success) {
      const error = new Error(result.error || "Review failed");
      await commentOnPullRequestFailure({
        githubClient,
        owner,
        repo,
        pullNumber: payload.pull_request.number,
        kind: "review",
        deliveryId,
        error,
      });
      failureCommentPosted = true;
      throw error;
    }

    const dbReviewId = await recordReview({
      githubRepoId: payload.repository.id,
      owner,
      repo,
      pullNumber: payload.pull_request.number,
      reviewType: "initial",
      reviewId: result.reviewId,
      tokensUsed: result.tokensUsed,
    });

    if (dbReviewId && result.issues && result.issues.length > 0) {
      await recordReviewComments(dbReviewId, result.issues, result.triageResult);
    }

    console.log(`Queued review submitted successfully: ${result.reviewId}`);
  } catch (error) {
    if (!failureCommentPosted) {
      await commentOnWebhookPullRequestFailure(payload, "review", error, deliveryId, githubClient);
    }
    throw error;
  } finally {
    if (reviewReaction) {
      await removeReviewInProgressReaction(
        reviewReaction.githubClient,
        reviewReaction.owner,
        reviewReaction.repo,
        reviewReaction.pullNumber,
        reviewReaction.id
      );
    }
  }
}

const app = new Hono();

const reviewQueue = new AsyncJobQueue<PullRequestReviewJob>({
  name: "review",
  concurrency: REVIEW_QUEUE_CONCURRENCY,
  maxQueuedJobs: REVIEW_QUEUE_MAX_SIZE,
  maxAttempts: REVIEW_QUEUE_MAX_ATTEMPTS,
  retryDelayMs: REVIEW_QUEUE_RETRY_DELAY_MS,
  processor: processPullRequestReviewJob,
  onError: (error, job, context) => {
    const pullNumber = job.payload.pull_request?.number ?? "unknown";
    const repo = `${job.payload.repository.owner.login}/${job.payload.repository.name}`;
    console.error(
      `Review queue job ${context.id} failed for ${repo}#${pullNumber} (attempt ${context.attempt}/${context.maxAttempts}):`,
      error
    );
  },
});

function isAuthorizedInternalApiKey(headerValue: string | undefined): boolean {
  if (!REVIEW_AGENT_API_KEY) {
    return process.env.NODE_ENV !== "production";
  }
  return headerValue === REVIEW_AGENT_API_KEY;
}

async function createGitHubClientForRepo(owner: string, repo: string): Promise<GitHubClient> {
  const privateKey = getPrivateKey();

  if (GITHUB_APP_ID && privateKey) {
    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: GITHUB_APP_ID, privateKey },
    });
    const { data: installation } = await appOctokit.apps.getRepoInstallation({ owner, repo });
    return new GitHubClient(createOctokitWithApp(installation.id));
  }

  if (GITHUB_TOKEN) {
    return new GitHubClient(createOctokitWithToken());
  }

  throw new Error(
    "No GitHub authentication configured. Set GITHUB_TOKEN or GITHUB_APP_ID + GITHUB_PRIVATE_KEY_PATH"
  );
}

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    reviewQueue: reviewQueue.getStats(),
  });
});

app.get("/internal/review-queue", (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!isAuthorizedInternalApiKey(apiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return c.json(reviewQueue.getSnapshot());
});

app.get("/internal/provider-models", async (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!isAuthorizedInternalApiKey(apiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const modelsByProvider = await getProviderModelsCatalog();
    return c.json({
      providers: ["anthropic", "openai"],
      modelsByProvider,
    });
  } catch (error) {
    console.error("Failed to list provider models:", error);
    return c.json({ error: "Failed to list provider models" }, 500);
  }
});

app.post("/internal/local-review", async (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!isAuthorizedInternalApiKey(apiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = (await c.req.json()) as {
    files?: Array<{ filename: string; content: string; patch: string }>;
    title?: string;
    sensitivity?: number;
    aiConfig?: { authMethod: "API_KEY" | "OAUTH_TOKEN"; model: string; credential: string };
  };

  if (!Array.isArray(body.files) || body.files.length === 0) {
    return c.json({ error: "files array is required" }, 400);
  }
  if (!body.title) {
    return c.json({ error: "title is required" }, 400);
  }

  try {
    const result = await runLocalReview({
      files: body.files,
      title: body.title,
      sensitivity: body.sensitivity ?? 50,
      aiConfig: body.aiConfig,
    });
    return c.json(result);
  } catch (error) {
    console.error("Local review failed:", error);
    return c.json({ error: "Review failed" }, 500);
  }
});

app.post("/internal/generate-summary", async (c) => {
  const apiKey = c.req.header("X-API-Key");
  if (!isAuthorizedInternalApiKey(apiKey)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = (await c.req.json()) as {
    owner?: string;
    repo?: string;
    pullNumber?: number;
    headBranch?: string;
    pullTitle?: string | null;
    pullBody?: string | null;
    pullAuthor?: string | null;
    baseBranch?: string | null;
    comments?: Array<{
      body: string;
      path: string | null;
      line: number | null;
      fixStatus: string | null;
    }>;
    aiConfig?: { authMethod: "API_KEY" | "OAUTH_TOKEN"; model: string; credential: string };
  };

  if (!body.owner || !body.repo || !body.pullNumber || !body.headBranch) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  try {
    const github = await createGitHubClientForRepo(body.owner, body.repo);
    const result = await generateReviewSummary(
      {
        owner: body.owner,
        repo: body.repo,
        pullNumber: body.pullNumber,
        headBranch: body.headBranch,
        pullTitle: body.pullTitle ?? null,
        pullBody: body.pullBody ?? null,
        pullAuthor: body.pullAuthor ?? null,
        baseBranch: body.baseBranch ?? null,
        comments: body.comments ?? [],
      },
      github,
      body.aiConfig
    );

    return c.json(result);
  } catch (error) {
    console.error("Summary generation failed:", error);
    return c.json({ error: "Summary generation failed" }, 500);
  }
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
  const deliveryId = c.req.header("x-github-delivery") || null;

  console.log(`Received webhook: ${event} - ${payload.action || "no action"}`);

  // Handle pull request events
  if (event === "pull_request") {
    const triggerActions = ["opened", "synchronize", "ready_for_review", "review_requested"];

    if (triggerActions.includes(payload.action)) {
      if (!payload.pull_request) {
        return c.json({ status: "ignored", reason: "missing_pull_request" });
      }

      if (payload.action === "review_requested" && !isReviewRequestedFromBot(payload)) {
        return c.json({ status: "ignored", reason: "review_not_requested_from_bot" });
      }

      try {
        await getRepositorySettings(
          payload.repository.owner.login,
          payload.repository.name,
          payload.repository.id
        );
      } catch (error) {
        await commentOnWebhookPullRequestFailure(payload, "review", error, deliveryId);
        if (isSettingsApiUnavailableError(error)) {
          return settingsApiUnavailableResponse(c, error);
        }
        throw error;
      }

      const key = buildPullRequestReviewJobKey(payload);
      const enqueueResult = reviewQueue.enqueue(key, {
        payload,
        deliveryId,
      });

      if (!enqueueResult.accepted) {
        console.warn(`Review queue full; rejecting ${key} for GitHub retry`);
        return c.json(
          {
            status: "busy",
            reason: "review_queue_full",
            reviewQueue: enqueueResult.stats,
          },
          503
        );
      }

      console.log(
        `Queued PR review ${enqueueResult.jobId} for ${key} (${payload.action}, ${enqueueResult.status})`
      );

      return c.json(
        {
          status: "queued",
          queueStatus: enqueueResult.status,
          jobId: enqueueResult.jobId,
          key,
          reviewQueue: enqueueResult.stats,
        },
        202
      );
    }
  }

  // Handle review comments (inline code comments)
  if (event === "pull_request_review_comment" && payload.action === "created") {
    // Skip bot comments to avoid self-triggering loops
    const reviewCommenter = payload.comment?.user?.login;
    if (reviewCommenter?.includes("[bot]")) {
      console.log(`Skipping review comment from bot: ${reviewCommenter}`);
      return c.json({ status: "ignored" });
    }

    try {
      const { owner, repo, settings, githubClient, handler, customRules } =
        await initWebhookContext(payload);

      if (!settings.effectiveEnabled) {
        console.log(
          `Comment responses disabled for ${owner}/${repo} (effectiveEnabled: ${settings.effectiveEnabled})`
        );
        if (payload.comment?.body?.includes(`@${BOT_USERNAME}`)) {
          await commentOnTokenQuotaBlocked({
            githubClient,
            owner,
            repo,
            pullNumber: payload.pull_request.number,
            settings,
          });
        }
        return c.json({ status: "skipped", reason: "disabled" });
      }

      const result = await handler.handleReviewComment(payload, BOT_USERNAME, customRules);

      if (result.skipped) {
        console.log("Review comment skipped (not for bot)");
        return c.json({ status: "skipped" });
      }

      if (!result.success) {
        console.error("Comment reply failed:", result.error);
        await commentOnPullRequestFailure({
          githubClient,
          owner,
          repo,
          pullNumber: payload.pull_request.number,
          kind: "comment_reply",
          deliveryId,
          error: new Error(result.error || "Comment reply failed"),
        });
        return c.json({ error: result.error }, 500);
      }

      // Record the comment reply
      await recordReview({
        githubRepoId: payload.repository.id,
        owner,
        repo,
        pullNumber: payload.pull_request.number,
        reviewType: "comment_reply",
        commentId: result.reviewId,
        tokensUsed: result.tokensUsed,
      });

      console.log(`Comment reply posted: ${result.reviewId}`);
      return c.json({ status: "replied", commentId: result.reviewId });
    } catch (error) {
      await commentOnWebhookPullRequestFailure(payload, "comment_reply", error, deliveryId);
      if (isSettingsApiUnavailableError(error)) {
        return settingsApiUnavailableResponse(c, error);
      }
      console.error("Error processing review comment:", error);
      return c.json({ error: "Internal error" }, 500);
    }
  }

  // Handle issue comments (PR general comments)
  if (event === "issue_comment" && payload.action === "created") {
    // Skip bot comments to avoid self-triggering loops
    const issueCommenter = payload.comment?.user?.login;
    if (issueCommenter?.includes("[bot]")) {
      console.log(`Skipping issue comment from bot: ${issueCommenter}`);
      return c.json({ status: "ignored" });
    }

    if (!payload.issue?.pull_request) {
      return c.json({ status: "ignored", reason: "not_pull_request" });
    }

    if (!payload.comment?.body?.includes(`@${BOT_USERNAME}`)) {
      return c.json({ status: "ignored", reason: "bot_not_mentioned" });
    }

    try {
      const { owner, repo, settings, githubClient, handler, customRules } =
        await initWebhookContext(payload);

      if (!settings.effectiveEnabled) {
        console.log(
          `Comment responses disabled for ${owner}/${repo} (effectiveEnabled: ${settings.effectiveEnabled})`
        );
        await commentOnTokenQuotaBlocked({
          githubClient,
          owner,
          repo,
          pullNumber: payload.issue.number,
          settings,
        });
        return c.json({ status: "skipped", reason: "disabled" });
      }

      const result = await handler.handleIssueComment(payload, BOT_USERNAME, customRules);

      if (result.skipped) {
        console.log("Issue comment skipped (not for bot or not a PR)");
        return c.json({ status: "skipped" });
      }

      if (!result.success) {
        console.error("Comment reply failed:", result.error);
        await commentOnPullRequestFailure({
          githubClient,
          owner,
          repo,
          pullNumber: payload.issue.number,
          kind: "comment_reply",
          deliveryId,
          error: new Error(result.error || "Comment reply failed"),
        });
        return c.json({ error: result.error }, 500);
      }

      // Record the comment reply
      await recordReview({
        githubRepoId: payload.repository.id,
        owner,
        repo,
        pullNumber: payload.issue.number,
        reviewType: "comment_reply",
        commentId: result.reviewId,
        tokensUsed: result.tokensUsed,
      });

      console.log(`Comment reply posted: ${result.reviewId}`);
      return c.json({ status: "replied", commentId: result.reviewId });
    } catch (error) {
      await commentOnWebhookPullRequestFailure(payload, "comment_reply", error, deliveryId);
      if (isSettingsApiUnavailableError(error)) {
        return settingsApiUnavailableResponse(c, error);
      }
      console.error("Error processing issue comment:", error);
      return c.json({ error: "Internal error" }, 500);
    }
  }

  // Unknown or unhandled event
  return c.json({ status: "ignored" });
});

// Fix-accepted callback: apply a diff, push, reply on GitHub, resolve thread
app.post("/callback/fix-accepted", async (c) => {
  // Validate API key
  const apiKey = c.req.header("X-API-Key") || "";
  if (REVIEW_AGENT_API_KEY && apiKey !== REVIEW_AGENT_API_KEY) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const {
    fixId,
    owner,
    repo,
    pullNumber,
    diff,
    summary,
    commentBody,
    githubCommentId,
    path,
    line,
  } = await c.req.json();

  if (!fixId || !owner || !repo || !pullNumber || !diff) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  let githubClient: GitHubClient | undefined;

  try {
    // Look up GitHub App installation for this repo
    const privateKey = getPrivateKey();
    if (!GITHUB_APP_ID || !privateKey) {
      throw new Error("GitHub App auth required for fix-accepted callback");
    }

    const appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId: GITHUB_APP_ID, privateKey },
    });
    const { data: installation } = await appOctokit.apps.getRepoInstallation({ owner, repo });
    const octokit = createOctokitWithApp(installation.id);
    githubClient = new GitHubClient(octokit);

    // Get the PR to find the head branch
    const pr = await githubClient.getPullRequest(owner, repo, pullNumber);
    const branch = pr.head.ref;

    const commitSha = await withClonedRepo(
      {
        mode: "read-write",
        github: githubClient,
        owner,
        repo,
        branch,
        label: `fix-${pullNumber}`,
        botUsername: BOT_USERNAME,
      },
      async (tempDir, git) => {
        const msg = (commentBody || "apply accepted fix").slice(0, 72);
        const commitMessage = path ? `fix(${path}): ${msg}` : `fix: ${msg}`;
        const sha = await applyPatchAndPush({
          tempDir,
          git,
          diff,
          commitMessage,
          branch,
        });
        console.log(`Fix ${fixId} applied and pushed: ${sha}`);

        return sha;
      }
    );

    // Reply to GitHub comment and resolve thread
    try {
      const reviewComments = await githubClient.getReviewComments(owner, repo, pullNumber);
      let targetComment = githubCommentId
        ? reviewComments.find((rc) => rc.id === githubCommentId)
        : null;

      // Fallback: match by file path + line number among bot comments
      if (!targetComment && path) {
        const botComments = reviewComments.filter(
          (rc) => rc.user === BOT_USERNAME || rc.user === `${BOT_USERNAME}[bot]`
        );
        targetComment = botComments.find((rc) => rc.path === path && rc.line === line) ?? null;
      }

      if (targetComment) {
        const replyBody = summary
          ? `✅ **Fixed in ${commitSha.slice(0, 7)}**\n\n${summary}`
          : `✅ **Fixed in ${commitSha.slice(0, 7)}**`;
        await githubClient.replyToReviewComment(
          owner,
          repo,
          pullNumber,
          targetComment.id,
          replyBody
        );

        const threadId = await githubClient.getReviewThreadId(
          owner,
          repo,
          pullNumber,
          targetComment.nodeId
        );
        if (threadId) {
          await githubClient.resolveReviewThread(threadId);
        }
        console.log(`Replied and resolved thread for ${path}:${line}`);
      } else {
        console.warn(
          `No matching review comment found for fix ${fixId} (path=${path}, line=${line}, githubCommentId=${githubCommentId})`
        );
      }
    } catch (err) {
      console.warn(`Failed to reply/resolve for fix ${fixId}:`, err);
    }

    // Notify server that the fix was applied
    const SETTINGS_API_URL = process.env.SETTINGS_API_URL;
    if (SETTINGS_API_URL) {
      try {
        await fetch(`${SETTINGS_API_URL}/api/internal/fixes/${fixId}/applied`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": REVIEW_AGENT_API_KEY || "" },
          body: JSON.stringify({ commitSha }),
        });
      } catch (err) {
        console.warn(`Failed to notify server of fix ${fixId} applied:`, err);
      }
    }

    return c.json({ success: true, commitSha });
  } catch (error) {
    console.error(`Failed to apply fix ${fixId}:`, error);
    try {
      await commentOnPullRequestFailure({
        githubClient: githubClient ?? (await createGitHubClientForRepo(owner, repo)),
        owner,
        repo,
        pullNumber,
        kind: "autofix",
        error,
      });
    } catch (commentError) {
      console.warn(
        `Failed to create GitHub client for autofix failure notice on ${owner}/${repo}#${pullNumber}:`,
        commentError
      );
    }

    // Notify server that the fix failed so it reverts to PENDING
    const SETTINGS_API_URL = process.env.SETTINGS_API_URL;
    if (SETTINGS_API_URL) {
      try {
        await fetch(`${SETTINGS_API_URL}/api/internal/fixes/${fixId}/failed`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-API-Key": REVIEW_AGENT_API_KEY || "" },
        });
      } catch (err) {
        console.warn(`Failed to notify server of fix ${fixId} failure:`, err);
      }
    }

    return c.json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Start server
console.log(`Starting review-agent on port ${PORT}...`);
console.log(`Bot username: ${BOT_USERNAME}`);
console.log(`Bot teams: ${BOT_TEAMS.length > 0 ? BOT_TEAMS.join(", ") : "none"}`);
console.log(
  `Review queue: concurrency=${REVIEW_QUEUE_CONCURRENCY}, maxSize=${REVIEW_QUEUE_MAX_SIZE}, maxAttempts=${REVIEW_QUEUE_MAX_ATTEMPTS}, retryDelayMs=${REVIEW_QUEUE_RETRY_DELAY_MS}`
);
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
