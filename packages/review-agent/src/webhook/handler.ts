import type { CodeReviewAgent } from "../agent/reviewer";
import type { TriageAgent } from "../agent/triage";
import type { CodeIssue, FileToReview } from "../agent/types";
import type { GitHubClient } from "../github/client";
import type { ReviewFormatter } from "../review/formatter";
import type { DiffPatches } from "../review/types";
import { withClonedRepo } from "../utils/git";
import { handleTriageAfterReview } from "./triage-handler";

// File extensions to review
const CODE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".kt",
  ".scala",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".swift",
  ".m",
  ".mm",
  ".vue",
  ".svelte",
]);

// Files to always skip
const SKIP_PATTERNS = [
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /\.min\.(js|css)$/,
  /\.generated\./,
  /\.d\.ts$/,
  /node_modules\//,
];

interface WebhookPayload {
  action: string;
  pull_request?: {
    number: number;
    title: string;
    body: string | null;
    head: { sha: string; ref: string };
    base: { sha: string; ref: string };
    user: { login: string };
  };
  repository: {
    owner: { login: string };
    name: string;
  };
  requested_reviewer?: { login: string };
  requested_team?: { slug: string };
  comment?: {
    id: number;
    body: string;
    user: { login: string };
    path?: string;
    in_reply_to_id?: number;
  };
  issue?: {
    number: number;
    pull_request?: { url: string };
  };
}

interface HandlerResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  reviewId?: number;
  issues?: CodeIssue[];
  tokensUsed?: number;
  triageResult?: {
    fixedIssues: Array<{
      issue: CodeIssue;
      commitSha: string;
      explanation: string;
      diff: string;
      githubCommentId?: number;
    }>;
    skippedIssues: Array<{
      issue: CodeIssue;
      reason: string;
    }>;
  };
}

interface TriageOptions {
  enabled: boolean;
  autofixEnabled: boolean;
  triageAgent: TriageAgent;
  botUsername: string;
}

export class WebhookHandler {
  constructor(
    private github: GitHubClient,
    private agent: CodeReviewAgent,
    private formatter: ReviewFormatter,
    private triageAgent?: TriageAgent
  ) {}

  async handlePullRequestOpened(
    payload: WebhookPayload,
    botUsername: string,
    customRules?: string | null,
    triageOptions?: TriageOptions,
    sensitivity?: number
  ): Promise<HandlerResult> {
    if (!payload.pull_request) {
      return { success: true, skipped: true };
    }

    // Skip if the PR was opened by the bot itself (avoid loops)
    if (payload.pull_request.user.login === botUsername) {
      return { success: true, skipped: true };
    }

    const reviewResult = await this.performReview(payload, customRules, sensitivity);

    // If review succeeded and triage is enabled, run auto-fix
    if (
      reviewResult.success &&
      !reviewResult.skipped &&
      triageOptions?.enabled &&
      reviewResult.issues &&
      reviewResult.issues.length > 0
    ) {
      console.log(`Triage enabled: ${reviewResult.issues.length} issues to process`);

      const triageResult = await handleTriageAfterReview(
        this.github,
        triageOptions.triageAgent,
        {
          number: payload.pull_request.number,
          head: payload.pull_request.head,
        },
        reviewResult.issues,
        payload.repository.owner.login,
        payload.repository.name,
        triageOptions.botUsername,
        triageOptions.autofixEnabled
      );

      if (triageResult.error) {
        console.error(`Triage error: ${triageResult.error}`);
      }

      reviewResult.triageResult = {
        fixedIssues: triageResult.fixedIssues,
        skippedIssues: triageResult.skippedIssues,
      };
    }

    return reviewResult;
  }

  async handlePullRequestReviewRequested(
    payload: WebhookPayload,
    botUsername: string,
    botTeams: string[] = [],
    customRules?: string | null,
    sensitivity?: number
  ): Promise<HandlerResult> {
    // Check if the review was requested from our bot
    const isRequestedFromBot =
      payload.requested_reviewer?.login === botUsername ||
      (payload.requested_team && botTeams.includes(payload.requested_team.slug));

    if (!isRequestedFromBot) {
      return { success: true, skipped: true };
    }

    return this.performReview(payload, customRules, sensitivity);
  }

  private async performReview(
    payload: WebhookPayload,
    customRules?: string | null,
    sensitivity?: number
  ): Promise<HandlerResult> {
    const { repository, pull_request } = payload;

    if (!pull_request) {
      return { success: false, error: "No pull request in payload" };
    }

    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pull_request.number;

    try {
      console.log(`Cloning ${owner}/${repo} branch ${pull_request.head.ref} for review`);

      return await withClonedRepo(
        {
          mode: "read-only",
          github: this.github,
          owner,
          repo,
          branch: pull_request.head.ref,
          label: `review-${prNumber}`,
        },
        async (tempDir) => {
          // Fetch PR files metadata
          const files = await this.github.getPullRequestFiles(owner, repo, prNumber);

          // Filter to reviewable code files
          const codeFiles = files.filter((file) => {
            if (file.status === "removed") return false;
            if (!this.isCodeFile(file.filename)) return false;
            if (this.shouldSkipFile(file.filename)) return false;
            return true;
          });

          // Build file list with patches for the reviewer (Agent SDK reads files itself)
          const filesToReview: FileToReview[] = codeFiles.map((file) => ({
            filename: file.filename,
            patch: file.patch,
          }));

          // Run AI review with Agent SDK (agent will read files itself)
          const reviewResult = await this.agent.reviewFiles(
            filesToReview,
            {
              prTitle: pull_request.title,
              prBody: pull_request.body,
              sensitivity,
            },
            tempDir,
            customRules
          );

          // Build patches map for filtering inline comments to valid diff lines
          const patches: DiffPatches = {};
          for (const file of codeFiles) {
            if (file.patch) {
              patches[file.filename] = file.patch;
            }
          }

          // Format for GitHub (with patches to filter comments to valid lines)
          const review = this.formatter.formatReview(reviewResult, patches);

          // Submit review
          const { id } = await this.github.submitReview(
            owner,
            repo,
            prNumber,
            pull_request.head.sha,
            review
          );

          return { success: true, reviewId: id, issues: reviewResult.issues, tokensUsed: reviewResult.tokensUsed } as HandlerResult;
        }
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async handleReviewComment(
    payload: WebhookPayload,
    botUsername: string,
    customRules?: string | null
  ): Promise<HandlerResult> {
    const { comment, repository, pull_request } = payload;

    if (!comment || !pull_request) {
      return { success: true, skipped: true };
    }

    // Skip if the comment is from the bot itself
    if (comment.user.login === botUsername) {
      return { success: true, skipped: true };
    }

    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pull_request.number;

    try {
      // Get the conversation thread
      const thread = await this.github.getReviewCommentThread(owner, repo, prNumber, comment.id);

      // Only respond if the bot was part of the conversation (replied before or was mentioned)
      const botInThread = thread.comments.some((c) => c.user === botUsername);
      const botMentioned = comment.body.includes(`@${botUsername}`);

      if (!botInThread && !botMentioned) {
        return { success: true, skipped: true };
      }

      return await withClonedRepo(
        {
          mode: "read-only",
          github: this.github,
          owner,
          repo,
          branch: pull_request.head.ref,
          label: `comment-${prNumber}`,
        },
        async (tempDir) => {
          // Build conversation from thread
          const conversation = thread.comments.map((c) => ({
            user: c.user,
            body: c.body,
          }));

          // Get code context if available (agent will read full content itself)
          let codeContext: { filename: string; diff?: string } | undefined;
          if (comment.path) {
            // Get the diff for this file
            const files = await this.github.getPullRequestFiles(owner, repo, prNumber);
            const file = files.find((f) => f.filename === comment.path);
            codeContext = {
              filename: comment.path,
              diff: file?.patch,
            };
          }

          // Get AI response using Agent SDK
          const response = await this.agent.respondToComment(
            conversation,
            tempDir,
            codeContext,
            customRules
          );

          // Reply to the comment
          const { id } = await this.github.replyToReviewComment(
            owner,
            repo,
            prNumber,
            comment.id,
            response
          );

          return { success: true, reviewId: id } as HandlerResult;
        }
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async handleIssueComment(
    payload: WebhookPayload,
    botUsername: string,
    customRules?: string | null
  ): Promise<HandlerResult> {
    const { comment, repository, issue } = payload;

    if (!comment || !issue) {
      return { success: true, skipped: true };
    }

    // Only handle PR comments (issues with pull_request field)
    if (!issue.pull_request) {
      return { success: true, skipped: true };
    }

    // Skip if the comment is from the bot itself
    if (comment.user.login === botUsername) {
      return { success: true, skipped: true };
    }

    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = issue.number;

    // Only respond if mentioned
    if (!comment.body.includes(`@${botUsername}`)) {
      return { success: true, skipped: true };
    }

    try {
      // Get PR details to get the head branch
      const pr = await this.github.getPullRequest(owner, repo, prNumber);

      return await withClonedRepo(
        {
          mode: "read-only",
          github: this.github,
          owner,
          repo,
          branch: pr.head.ref,
          label: `issue-comment-${prNumber}`,
        },
        async (tempDir) => {
          // Get all comments on the PR for context
          const allComments = await this.github.getIssueComments(owner, repo, prNumber);

          // Build conversation (last 10 comments for context)
          const conversation = allComments.slice(-10).map((c) => ({
            user: c.user,
            body: c.body,
          }));

          // Get AI response using Agent SDK
          const response = await this.agent.respondToComment(
            conversation,
            tempDir,
            undefined,
            customRules
          );

          // Post reply
          const { id } = await this.github.createIssueComment(owner, repo, prNumber, response);

          return { success: true, reviewId: id } as HandlerResult;
        }
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private isCodeFile(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf("."));
    return CODE_EXTENSIONS.has(ext);
  }

  private shouldSkipFile(filename: string): boolean {
    return SKIP_PATTERNS.some((pattern) => pattern.test(filename));
  }
}
