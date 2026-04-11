import type { CodeReviewAgent } from "../agent/reviewer";
import type { TriageAgent } from "../agent/triage";
import type { CodeIssue, FileToReview } from "../agent/types";
import type { GitHubClient } from "../github/client";
import type { ReviewFormatter } from "../review/formatter";
import type { DiffPatches } from "../review/types";
import { withClonedRepo } from "../utils/git";
import { buildIssueFingerprint } from "../utils/issue-fingerprint";
import {
  extractFingerprints,
  extractStoredIssueRecords,
  toStoredIssueRecord,
  type StoredIssueRecord,
} from "../utils/issue-markers";
import {
  acquireExecutionLock,
  getClarificationLockByThread,
  getSuppressedIssueFingerprints,
  resolveClarificationLock,
} from "../utils/settings";
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
    line?: number;
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
    clarificationIssues?: Array<{
      issue: CodeIssue;
      question: string;
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

function isReviewSummaryComment(body: string): boolean {
  return body.startsWith("## Summary") || body.startsWith("## Review Summary");
}

async function upsertReviewSummaryComment(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string,
  summaryBody: string
): Promise<void> {
  const issueComments = await github.getIssueComments(owner, repo, pullNumber);
  const existingSummary = [...issueComments]
    .reverse()
    .find(
      (comment) =>
        (comment.user === botUsername || comment.user === `${botUsername}[bot]`) &&
        isReviewSummaryComment(comment.body)
    );

  if (existingSummary) {
    await github.updateIssueComment(owner, repo, existingSummary.id, summaryBody);
    console.log(`Updated review summary comment ${existingSummary.id}`);
    return;
  }

  await github.createIssueComment(owner, repo, pullNumber, summaryBody);
  console.log("Posted review summary comment");
}

function shouldSubmitReview(review: { event: "APPROVE" | "COMMENT"; comments?: unknown[] }): boolean {
  if (review.comments && review.comments.length > 0) {
    return true;
  }

  return review.event !== "COMMENT";
}

function hasOpenIssuesToReport(
  inlineComments: unknown[],
  bodyOnlyIssues: CodeIssue[],
  invalidInlineIssues: CodeIssue[],
  history: {
    unresolvedHistoricalIssues: StoredIssueRecord[];
    newIssues: StoredIssueRecord[];
    addressedIssues: StoredIssueRecord[];
  }
): boolean {
  return (
    inlineComments.length > 0 ||
    bodyOnlyIssues.length > 0 ||
    invalidInlineIssues.length > 0 ||
    history.unresolvedHistoricalIssues.length > 0 ||
    history.newIssues.length > 0 ||
    history.addressedIssues.length > 0
  );
}

async function getExistingMentionedIssueFingerprints(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string
): Promise<Set<string>> {
  const [reviewComments, issueComments] = await Promise.all([
    github.getReviewComments(owner, repo, pullNumber),
    github.getIssueComments(owner, repo, pullNumber),
  ]);

  const botUsers = new Set([botUsername, `${botUsername}[bot]`]);
  const fingerprints = new Set<string>();

  for (const comment of reviewComments) {
    if (!botUsers.has(comment.user)) continue;
    for (const fingerprint of extractFingerprints(comment.body)) {
      fingerprints.add(fingerprint);
    }
  }

  for (const comment of issueComments) {
    if (!botUsers.has(comment.user)) continue;
    for (const fingerprint of extractFingerprints(comment.body)) {
      fingerprints.add(fingerprint);
    }
  }

  return fingerprints;
}

async function getHistoricalIssues(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string
): Promise<Map<string, StoredIssueRecord>> {
  const [reviewComments, issueComments] = await Promise.all([
    github.getReviewComments(owner, repo, pullNumber),
    github.getIssueComments(owner, repo, pullNumber),
  ]);

  const botUsers = new Set([botUsername, `${botUsername}[bot]`]);
  const issues = new Map<string, StoredIssueRecord>();

  for (const comment of reviewComments) {
    if (!botUsers.has(comment.user)) continue;
    for (const issue of extractStoredIssueRecords(comment.body)) {
      issues.set(issue.fingerprint, issue);
    }
  }

  for (const comment of issueComments) {
    if (!botUsers.has(comment.user)) continue;
    for (const issue of extractStoredIssueRecords(comment.body)) {
      issues.set(issue.fingerprint, issue);
    }
  }

  return issues;
}

async function buildPullRequestConversationContext(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number
): Promise<string> {
  const [issueComments, reviewComments, reviews] = await Promise.all([
    github.getIssueComments(owner, repo, pullNumber),
    github.getReviewComments(owner, repo, pullNumber),
    github.getPullRequestReviews(owner, repo, pullNumber),
  ]);

  const events = [
    ...issueComments.map((comment) => ({
      createdAt: comment.createdAt || "",
      text: `[PR comment] ${comment.user}: ${comment.body}`,
    })),
    ...reviewComments.map((comment) => ({
      createdAt: comment.createdAt || "",
      text: `[Inline review comment] ${comment.user} on ${comment.path}:${comment.line ?? "?"}: ${comment.body}`,
    })),
    ...reviews
      .filter((review) => review.body.trim())
      .map((review) => ({
        createdAt: review.submittedAt || "",
        text: `[Review body - ${review.state}] ${review.user}: ${review.body}`,
      })),
  ]
    .filter((event) => event.text.trim())
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (events.length === 0) {
    return "";
  }

  const lines = events.slice(-40).map((event) => event.text);
  return lines.join("\n\n");
}

function buildReviewHistoryContext(
  historicalIssues: Map<string, StoredIssueRecord>,
  currentIssueMap: Map<string, StoredIssueRecord>
): {
  unresolvedHistoricalIssues: StoredIssueRecord[];
  newIssues: StoredIssueRecord[];
  addressedIssues: StoredIssueRecord[];
  promptText: string;
} {
  const unresolvedHistoricalIssues: StoredIssueRecord[] = [];
  const addressedIssues: StoredIssueRecord[] = [];
  const newIssues: StoredIssueRecord[] = [];

  for (const [fingerprint, issue] of historicalIssues) {
    if (currentIssueMap.has(fingerprint)) {
      unresolvedHistoricalIssues.push(issue);
    } else {
      addressedIssues.push(issue);
    }
  }

  for (const [fingerprint, issue] of currentIssueMap) {
    if (!historicalIssues.has(fingerprint)) {
      newIssues.push(issue);
    }
  }

  const lines: string[] = [];
  if (unresolvedHistoricalIssues.length > 0) {
    lines.push("Still unresolved from earlier reviews:");
    for (const issue of unresolvedHistoricalIssues.slice(0, 10)) {
      lines.push(`- ${issue.file}:${issue.line} ${issue.message}`);
    }
  }
  if (addressedIssues.length > 0) {
    lines.push("Already addressed since earlier reviews:");
    for (const issue of addressedIssues.slice(0, 10)) {
      lines.push(`- ${issue.file}:${issue.line} ${issue.message}`);
    }
  }

  return {
    unresolvedHistoricalIssues,
    newIssues,
    addressedIssues,
    promptText: lines.join("\n"),
  };
}

function buildPriorReviewPromptContext(historicalIssues: Map<string, StoredIssueRecord>): string {
  if (historicalIssues.size === 0) {
    return "";
  }

  const lines = ["Previously reported findings on this PR:"];
  for (const issue of [...historicalIssues.values()].slice(-20)) {
    lines.push(`- ${issue.file}:${issue.line} ${issue.message}`);
  }
  return lines.join("\n");
}

function resolvedReviewBody(): string {
  return "Resolved in a later revision. See the living `Summary` comment for the current state of this PR.";
}

async function cleanupResolvedPreviousReviews(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string,
  unresolvedIssueFingerprints: Set<string>
): Promise<void> {
  const [reviews, reviewComments] = await Promise.all([
    github.getPullRequestReviews(owner, repo, pullNumber),
    github.getReviewComments(owner, repo, pullNumber),
  ]);

  const botUsers = new Set([botUsername, `${botUsername}[bot]`]);
  const commentsByReviewId = new Map<number, typeof reviewComments>();

  for (const comment of reviewComments) {
    if (!comment.pullRequestReviewId || !botUsers.has(comment.user)) {
      continue;
    }
    const existing = commentsByReviewId.get(comment.pullRequestReviewId) ?? [];
    existing.push(comment);
    commentsByReviewId.set(comment.pullRequestReviewId, existing);
  }

  for (const review of reviews) {
    if (!botUsers.has(review.user)) {
      continue;
    }

    const relatedComments = commentsByReviewId.get(review.id) ?? [];
    const issueComments = relatedComments.filter((comment) => extractFingerprints(comment.body).length > 0);
    const reviewFingerprints = new Set<string>(extractFingerprints(review.body));
    const commentFingerprints = issueComments.flatMap((comment) => extractFingerprints(comment.body));
    const allFingerprints = new Set<string>([...reviewFingerprints, ...commentFingerprints]);

    if (allFingerprints.size === 0) {
      continue;
    }

    const hasUnresolvedIssues = [...allFingerprints].some((fingerprint) =>
      unresolvedIssueFingerprints.has(fingerprint)
    );
    if (hasUnresolvedIssues) {
      continue;
    }

    for (const comment of issueComments) {
      const thread = await github.getReviewCommentThread(owner, repo, pullNumber, comment.id);
      const hasExternalReplies = thread.comments.some(
        (threadComment) => threadComment.id !== comment.id && !botUsers.has(threadComment.user)
      );

      if (hasExternalReplies) {
        console.log(
          `Preserved resolved review comment ${comment.id} because the thread has non-bot replies`
        );
        continue;
      }

      for (const threadComment of [...thread.comments].reverse()) {
        if (!botUsers.has(threadComment.user)) {
          continue;
        }

        try {
          await github.deleteReviewComment(owner, repo, threadComment.id);
          console.log(`Deleted resolved review comment ${threadComment.id}`);
        } catch (error) {
          console.warn(`Failed to delete resolved review comment ${threadComment.id}:`, error);
        }
      }
    }

    try {
      await github.updatePullRequestReview(
        owner,
        repo,
        pullNumber,
        review.id,
        resolvedReviewBody()
      );
      console.log(`Minimized resolved review body ${review.id}`);
    } catch (error) {
      console.warn(`Failed to minimize resolved review body ${review.id}:`, error);
    }
  }
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

    const reviewResult = await this.performReview(payload, botUsername, customRules, sensitivity);

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
        clarificationIssues: triageResult.clarificationIssues,
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

    return this.performReview(payload, botUsername, customRules, sensitivity);
  }

  private async performReview(
    payload: WebhookPayload,
    botUsername: string,
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

          // Build file list with patches for the reviewer (OpenCode reads files itself)
          const filesToReview: FileToReview[] = codeFiles.map((file) => ({
            filename: file.filename,
            patch: file.patch,
          }));

          // Run AI review with OpenCode (agent will read files itself)
          const conversationContext = await buildPullRequestConversationContext(
            this.github,
            owner,
            repo,
            prNumber
          );
          const historicalIssues = await getHistoricalIssues(
            this.github,
            owner,
            repo,
            prNumber,
            botUsername
          );
          const reviewResult = await this.agent.reviewFiles(
            filesToReview,
            {
              prTitle: pull_request.title,
              prBody: pull_request.body,
              sensitivity,
              conversationContext,
              priorReviewContext: buildPriorReviewPromptContext(historicalIssues),
            },
            tempDir,
            customRules
          );

          const issueFingerprints = reviewResult.issues.map((issue) =>
            buildIssueFingerprint(issue)
          );
          const suppressed = await getSuppressedIssueFingerprints(
            owner,
            repo,
            prNumber,
            issueFingerprints
          );
          const existingMentioned = await getExistingMentionedIssueFingerprints(
            this.github,
            owner,
            repo,
            prNumber,
            botUsername
          );

          const filteredIssues = reviewResult.issues.filter(
            (issue) => {
              const fingerprint = buildIssueFingerprint(issue);
              return !suppressed.has(fingerprint) && !existingMentioned.has(fingerprint);
            }
          );

          if (suppressed.size > 0) {
            console.log(
              `Suppressed ${suppressed.size} clarification-locked issue(s) for ${owner}/${repo}#${prNumber}`
            );
          }
          if (existingMentioned.size > 0) {
            const duplicateCount = reviewResult.issues.filter((issue) =>
              existingMentioned.has(buildIssueFingerprint(issue))
            ).length;
            if (duplicateCount > 0) {
              console.log(
                `Suppressed ${duplicateCount} previously mentioned unresolved issue(s) for ${owner}/${repo}#${prNumber}`
              );
            }
          }

          const effectiveReviewResult = {
            ...reviewResult,
            issues: filteredIssues,
          };
          const currentIssueMap = new Map(
            reviewResult.issues
              .filter((issue) => !suppressed.has(buildIssueFingerprint(issue)))
              .map((issue) => [buildIssueFingerprint(issue), toStoredIssueRecord(issue)])
          );
          const history = buildReviewHistoryContext(historicalIssues, currentIssueMap);

          await cleanupResolvedPreviousReviews(
            this.github,
            owner,
            repo,
            prNumber,
            botUsername,
            new Set(history.unresolvedHistoricalIssues.map((issue) => issue.fingerprint))
          );

          // Build patches map for filtering inline comments to valid diff lines
          const patches: DiffPatches = {};
          for (const file of codeFiles) {
            if (file.patch) {
              patches[file.filename] = file.patch;
            }
          }

          // Format for GitHub (with patches to filter comments to valid lines)
          const { inlineIssues, bodyOnlyIssues } = this.formatter.partitionIssues(
            effectiveReviewResult.issues,
            patches
          );
          const review = this.formatter.formatReview(effectiveReviewResult, patches);
          const inlineComments = inlineIssues.map((issue) => this.formatter.formatComment(issue));

          let validInlineComments = inlineComments;
          let invalidInlineIssues: CodeIssue[] = [];

          if (inlineComments.length > 0) {
            const { validComments, invalidComments } = await this.github.validateReviewComments(
              owner,
              repo,
              prNumber,
              pull_request.head.sha,
              inlineComments
            );

            validInlineComments = validComments;
            invalidInlineIssues = invalidComments
              .map((comment) =>
                inlineIssues.find(
                  (issue) =>
                    issue.file === comment.path &&
                    issue.line === comment.line &&
                    this.formatter.formatComment(issue).body === comment.body
                )
              )
              .filter((issue): issue is CodeIssue => issue !== undefined);

            if (invalidInlineIssues.length > 0) {
              console.warn(
                `Downgrading ${invalidInlineIssues.length} inline issue(s) to summary-only because GitHub could not resolve their diff lines`
              );
              for (const issue of invalidInlineIssues) {
                console.warn(`Unresolvable review line: ${issue.file}:${issue.line}`);
              }
            }
          }

          const summaryBody = this.formatter.formatSummaryBody(effectiveReviewResult, [
            ...bodyOnlyIssues,
            ...invalidInlineIssues,
          ]);
          const historicalSummaryBody = this.formatter.formatHistoricalSummaryBody(
            {
              ...effectiveReviewResult,
              issues: [
                ...history.unresolvedHistoricalIssues.map((issue) => ({
                  ...issue,
                  description: issue.message,
                })),
                ...history.newIssues.map((issue) => ({
                  ...issue,
                  description: issue.message,
                })),
              ] as CodeIssue[],
            },
            [...bodyOnlyIssues, ...invalidInlineIssues],
            history
          );
          const reviewBody = this.formatter.formatReviewBody(
            effectiveReviewResult,
            inlineIssues.filter(
              (issue) =>
                !invalidInlineIssues.some(
                  (invalidIssue) =>
                    invalidIssue.file === issue.file &&
                    invalidIssue.line === issue.line &&
                    invalidIssue.message === issue.message
                )
            ),
            [...bodyOnlyIssues, ...invalidInlineIssues]
          );

          try {
            await upsertReviewSummaryComment(
              this.github,
              owner,
              repo,
              prNumber,
              botUsername,
              historicalSummaryBody || summaryBody
            );
          } catch (error) {
            console.error("Failed to upsert review summary comment:", error);
          }

          let reviewId: number | undefined;
          const resolvedComments = validInlineComments.length > 0 ? validInlineComments : undefined;
          const shouldPostStatusUpdate = hasOpenIssuesToReport(
            validInlineComments,
            bodyOnlyIssues,
            invalidInlineIssues,
            history
          );

          if (shouldPostStatusUpdate && shouldSubmitReview({ ...review, comments: resolvedComments })) {
            const { id } = await this.github.submitReview(
              owner,
              repo,
              prNumber,
              pull_request.head.sha,
              {
                ...review,
                body: reviewBody,
                comments: resolvedComments,
              }
            );
            reviewId = id;
          } else {
            console.log("Skipped GitHub review submission; summary captured the current state");
          }

          return {
            success: true,
            reviewId,
            issues: effectiveReviewResult.issues,
            tokensUsed: reviewResult.tokensUsed,
          } as HandlerResult;
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

          // Get AI response using OpenCode
          const response = await this.agent.respondToCommentWithIntent(
            conversation,
            tempDir,
            codeContext,
            customRules
          );

          if (response.intent === "execute_fix" && comment.path && this.triageAgent) {
            const executionKey = `execute-fix:${owner}:${repo}:${prNumber}:review-comment:${comment.id}`;
            const acquired = await acquireExecutionLock(executionKey, "review_comment_execute_fix");
            if (!acquired) {
              return { success: true, skipped: true } as HandlerResult;
            }

            const canExecute = await this.canUserExecuteFix(
              owner,
              repo,
              pull_request.user.login,
              comment.user.login
            );

            if (!canExecute) {
              const denied = await this.github.replyToReviewComment(
                owner,
                repo,
                prNumber,
                comment.id,
                "I can explain issues, but only the PR author or collaborators with write access can ask me to apply fixes."
              );
              return { success: true, reviewId: denied.id } as HandlerResult;
            }

            const threadRootCommentId = comment.in_reply_to_id || comment.id;
            const clarificationLock = await getClarificationLockByThread(
              owner,
              repo,
              prNumber,
              threadRootCommentId
            );

            const issueToFix: CodeIssue = {
              type: (clarificationLock?.issueType as CodeIssue["type"]) || "bug-risk",
              severity: "warning",
              file: clarificationLock?.file || comment.path,
              line: clarificationLock?.line || comment.line || 1,
              message:
                clarificationLock?.message || comment.body.slice(0, 120) || "apply requested fix",
              suggestion: response.executionInstruction || response.response,
            };

            const triageResult = await handleTriageAfterReview(
              this.github,
              this.triageAgent,
              {
                number: prNumber,
                head: pull_request.head,
              },
              [issueToFix],
              owner,
              repo,
              botUsername,
              true,
              { postSummary: false }
            );

            if (triageResult.fixedIssues.length > 0) {
              if (clarificationLock?.fingerprint) {
                await resolveClarificationLock(
                  owner,
                  repo,
                  prNumber,
                  clarificationLock.fingerprint,
                  triageResult.fixedIssues[0]?.commitSha
                );
              }
              return {
                success: true,
                reviewId: triageResult.fixedIssues[0]?.githubCommentId ?? comment.id,
              } as HandlerResult;
            }

            const fallbackBody =
              triageResult.clarificationIssues[0]?.question ||
              triageResult.skippedIssues[0]?.reason ||
              "I could not apply that fix yet.";

            const { id } = await this.github.replyToReviewComment(
              owner,
              repo,
              prNumber,
              comment.id,
              `I couldn't apply that yet. ${fallbackBody}`
            );

            return { success: true, reviewId: id } as HandlerResult;
          }

          // Reply to the comment
          const { id } = await this.github.replyToReviewComment(
            owner,
            repo,
            prNumber,
            comment.id,
            response.response
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

          // Get AI response using OpenCode
          const response = await this.agent.respondToCommentWithIntent(
            conversation,
            tempDir,
            undefined,
            customRules
          );

          // Post reply
          const { id } = await this.github.createIssueComment(
            owner,
            repo,
            prNumber,
            response.response
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

  private isCodeFile(filename: string): boolean {
    const ext = filename.slice(filename.lastIndexOf("."));
    return CODE_EXTENSIONS.has(ext);
  }

  private shouldSkipFile(filename: string): boolean {
    return SKIP_PATTERNS.some((pattern) => pattern.test(filename));
  }

  private async canUserExecuteFix(
    owner: string,
    repo: string,
    pullAuthor: string,
    requester: string
  ): Promise<boolean> {
    if (requester === pullAuthor) {
      return true;
    }

    const permission = await this.github.getCollaboratorPermission(owner, repo, requester);
    return permission === "admin" || permission === "write" || permission === "maintain";
  }
}
