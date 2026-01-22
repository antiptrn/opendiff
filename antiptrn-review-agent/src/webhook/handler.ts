import type { CodeReviewAgent } from '../agent/reviewer';
import type { FileToReview } from '../agent/types';
import type { GitHubClient } from '../github/client';
import type { DiffPatches, ReviewFormatter } from '../review/formatter';

// File extensions to review
const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.scala',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
  '.cs',
  '.php',
  '.swift',
  '.m',
  '.mm',
  '.vue',
  '.svelte',
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
}

export class WebhookHandler {
  constructor(
    private github: GitHubClient,
    private agent: CodeReviewAgent,
    private formatter: ReviewFormatter
  ) {}

  async handlePullRequestOpened(
    payload: WebhookPayload,
    botUsername: string,
    customRules?: string | null
  ): Promise<HandlerResult> {
    if (!payload.pull_request) {
      return { success: true, skipped: true };
    }

    // Skip if the PR was opened by the bot itself (avoid loops)
    if (payload.pull_request.user.login === botUsername) {
      return { success: true, skipped: true };
    }

    return this.performReview(payload, customRules);
  }

  async handlePullRequestReviewRequested(
    payload: WebhookPayload,
    botUsername: string,
    botTeams: string[] = [],
    customRules?: string | null
  ): Promise<HandlerResult> {
    // Check if the review was requested from our bot
    const isRequestedFromBot =
      payload.requested_reviewer?.login === botUsername ||
      (payload.requested_team && botTeams.includes(payload.requested_team.slug));

    if (!isRequestedFromBot) {
      return { success: true, skipped: true };
    }

    return this.performReview(payload, customRules);
  }

  private async performReview(payload: WebhookPayload, customRules?: string | null): Promise<HandlerResult> {
    const { repository, pull_request } = payload;

    if (!pull_request) {
      return { success: false, error: 'No pull request in payload' };
    }

    const owner = repository.owner.login;
    const repo = repository.name;
    const prNumber = pull_request.number;

    try {
      // Fetch PR files
      const files = await this.github.getPullRequestFiles(owner, repo, prNumber);

      // Filter to reviewable code files
      const codeFiles = files.filter((file) => {
        // Skip deleted files
        if (file.status === 'removed') return false;

        // Skip non-code files
        if (!this.isCodeFile(file.filename)) return false;

        // Skip generated/lock files
        if (this.shouldSkipFile(file.filename)) return false;

        return true;
      });

      // Get file contents
      const filesToReview: FileToReview[] = await Promise.all(
        codeFiles.map(async (file) => {
          const content = await this.github.getFileContent(
            owner,
            repo,
            file.filename,
            pull_request.head.sha
          );

          return {
            filename: file.filename,
            content: content || '',
            patch: file.patch,
          };
        })
      );

      // Run AI review
      const reviewResult = await this.agent.reviewFiles(filesToReview, {
        prTitle: pull_request.title,
        prBody: pull_request.body,
      }, customRules);

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

      return { success: true, reviewId: id };
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

      // Get code context if available
      let codeContext: { filename: string; content: string; diff?: string } | undefined;
      if (comment.path) {
        const content = await this.github.getFileContent(
          owner,
          repo,
          comment.path,
          pull_request.head.sha
        );
        if (content) {
          codeContext = {
            filename: comment.path,
            content,
          };
        }
      }

      // Build conversation from thread
      const conversation = thread.comments.map((c) => ({
        user: c.user,
        body: c.body,
      }));

      // Get AI response
      const response = await this.agent.respondToComment(conversation, codeContext, customRules);

      // Reply to the comment
      const { id } = await this.github.replyToReviewComment(owner, repo, prNumber, comment.id, response);

      return { success: true, reviewId: id };
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
      // Get all comments on the PR for context
      const allComments = await this.github.getIssueComments(owner, repo, prNumber);

      // Build conversation (last 10 comments for context)
      const conversation = allComments.slice(-10).map((c) => ({
        user: c.user,
        body: c.body,
      }));

      // Get AI response
      const response = await this.agent.respondToComment(conversation, undefined, customRules);

      // Post reply
      const { id } = await this.github.createIssueComment(owner, repo, prNumber, response);

      return { success: true, reviewId: id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private isCodeFile(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf('.'));
    return CODE_EXTENSIONS.has(ext);
  }

  private shouldSkipFile(filename: string): boolean {
    return SKIP_PATTERNS.some((pattern) => pattern.test(filename));
  }
}
