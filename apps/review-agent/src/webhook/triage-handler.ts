import type { TriageAgent } from "../agent/triage";
import type { CodeIssue } from "../agent/types";
import type { GitHubClient } from "../github/client";
import { withClonedRepo } from "../utils/git";
import { getIgnoredDirForPath, normalizeIgnoredDirs } from "../utils/ignored-dirs";
import { withRetry } from "../utils/retry";

interface TriageResult {
  success: boolean;
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
  clarificationIssues: Array<{
    issue: CodeIssue;
    question: string;
    reason: string;
    githubCommentId?: number;
  }>;
  error?: string;
}

interface PullRequestInfo {
  number: number;
  head: {
    sha: string;
    ref: string;
  };
}

// Maximum number of issues to process per triage cycle to prevent runaway loops
const MAX_ISSUES_PER_CYCLE = 10;

export async function handleTriageAfterReview(
  github: GitHubClient,
  triageAgent: TriageAgent,
  pullRequest: PullRequestInfo,
  reviewIssues: CodeIssue[],
  owner: string,
  repo: string,
  botUsername: string,
  autofixEnabled: boolean,
  options?: {
    postSummary?: boolean;
    autofixIgnoredDirs?: string[];
  }
): Promise<TriageResult> {
  const result: TriageResult = {
    success: true,
    fixedIssues: [],
    skippedIssues: [],
    clarificationIssues: [],
  };

  const postSummary = options?.postSummary ?? true;
  const autofixIgnoredDirs = normalizeIgnoredDirs(options?.autofixIgnoredDirs ?? []);

  if (reviewIssues.length === 0) {
    console.log("No issues to fix");
    return result;
  }

  // Limit issues per cycle to prevent runaway loops
  const fixableIssues = reviewIssues.slice(0, MAX_ISSUES_PER_CYCLE);
  if (reviewIssues.length > MAX_ISSUES_PER_CYCLE) {
    console.log(
      `Limiting to ${MAX_ISSUES_PER_CYCLE} issues this cycle (${reviewIssues.length} total)`
    );
  }

  try {
    console.log(`Cloning ${owner}/${repo} branch ${pullRequest.head.ref} for triage`);

    await withClonedRepo(
      {
        mode: "read-write",
        github,
        owner,
        repo,
        branch: pullRequest.head.ref,
        label: `triage-${pullRequest.number}`,
        botUsername,
      },
      async (_tempDir, git) => {
        const reviewComments = await github.getReviewComments(owner, repo, pullRequest.number);
        const botComments = reviewComments.filter(
          (c) => c.user === botUsername || c.user === `${botUsername}[bot]`
        );
        const threadContextByCommentId = new Map<number, string | undefined>();
        let ignoredIssueCount = 0;

        // Process each issue one by one using the OpenCode SDK
        for (const issue of fixableIssues) {
          console.log(`Processing issue: ${issue.type} in ${issue.file}:${issue.line}`);

          try {
            const ignoredDir = getAutofixIgnoredDirForPath(issue.file, autofixIgnoredDirs);
            if (ignoredDir) {
              console.log(
                `Skipping issue matching ignored autofix path pattern ${ignoredDir}: ${issue.file}`
              );
              ignoredIssueCount += 1;
              continue;
            }

            const matchingComment = findMatchingComment(botComments, issue, new Set<number>());
            let conversationContext: string | undefined;

            if (matchingComment) {
              if (!threadContextByCommentId.has(matchingComment.id)) {
                try {
                  const thread = await github.getReviewCommentThread(
                    owner,
                    repo,
                    pullRequest.number,
                    matchingComment.id
                  );
                  threadContextByCommentId.set(
                    matchingComment.id,
                    formatThreadContext(thread.comments)
                  );
                } catch (error) {
                  console.warn(
                    `Failed to load review thread context for comment ${matchingComment.id}:`,
                    error
                  );
                  threadContextByCommentId.set(matchingComment.id, undefined);
                }
              }

              conversationContext = threadContextByCommentId.get(matchingComment.id);
            }

            // Use OpenCode SDK to fix the issue - it has full access to read/write files
            const fix = await triageAgent.fixIssue(issue, _tempDir, {
              conversationContext,
              autofixIgnoredDirs,
            });

            if (!fix.fixed) {
              if (fix.requiresClarification) {
                const question =
                  fix.clarificationQuestion || "Can you clarify the desired behavior?";
                console.log(`Issue needs clarification: ${question}`);
                result.clarificationIssues.push({
                  issue,
                  question,
                  reason: fix.explanation,
                });
                continue;
              }

              console.log(`Could not fix issue: ${fix.explanation}`);
              result.skippedIssues.push({
                issue,
                reason: fix.explanation,
              });
              continue;
            }

            console.log(`Agent fixed issue: ${fix.explanation}`);

            // Commit the fix
            const shortMessage = issue.message.slice(0, 50);
            const commitMessage = `fix(${issue.type}): ${shortMessage}${issue.message.length > 50 ? "..." : ""}`;

            // Add all modified/created files and capture the staged diff
            await git.add(".");
            const stagedFiles = (await git.diff(["--cached", "--name-only", "--no-renames"]))
              .split("\n")
              .map((file) => file.trim())
              .filter(Boolean);
            const ignoredChangedDir =
              stagedFiles
                .map((file) => getAutofixIgnoredDirForPath(file, autofixIgnoredDirs))
                .find((dir): dir is string => Boolean(dir)) ?? null;
            if (ignoredChangedDir) {
              await git.raw(["reset", "--hard"]);
              await git.raw(["clean", "-fd"]);

              const reason = `Autofix produced changes matching ignored path pattern \`${ignoredChangedDir}\`.`;
              console.log(reason);
              result.skippedIssues.push({ issue, reason });
              continue;
            }
            const stagedDiff = await git.diff(["--cached", "--no-color"]);
            const commitResult = await git.commit(commitMessage);

            console.log(`Committed fix: ${commitResult.commit}`);
            result.fixedIssues.push({
              issue,
              commitSha: commitResult.commit,
              explanation: fix.explanation,
              diff: stagedDiff,
            });
          } catch (error) {
            console.error(`Error processing issue in ${issue.file}:`, error);
            result.skippedIssues.push({
              issue,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }

        console.log(
          `Triage complete: ${result.fixedIssues.length} fixed, ${result.skippedIssues.length} skipped, ${result.clarificationIssues.length} needs clarification`
        );

        // Push all commits if any fixes were made and autofix is enabled
        if (result.fixedIssues.length > 0 && autofixEnabled) {
          console.log(`Pushing ${result.fixedIssues.length} commits to ${pullRequest.head.ref}`);
          await withRetry(() => git.push("origin", pullRequest.head.ref), "git push");
        }

        // Reply to inline comments or just match comment IDs for DB storage
        if (
          result.fixedIssues.length > 0 ||
          result.skippedIssues.length > 0 ||
          result.clarificationIssues.length > 0
        ) {
          if (autofixEnabled) {
            // Autofix ON: reply + resolve + summary (current behavior)
            const bodyOnly = await replyToInlineComments(
              github,
              owner,
              repo,
              pullRequest.number,
              result.fixedIssues,
              result.skippedIssues,
              result.clarificationIssues,
              botUsername
            );

            if (postSummary) {
              const summaryBody = formatTriageSummary(
                result.fixedIssues,
                result.skippedIssues,
                result.clarificationIssues,
                bodyOnly
              );
              await upsertTriageSummaryComment(
                github,
                owner,
                repo,
                pullRequest.number,
                botUsername,
                summaryBody
              );
              console.log(
                `Upserted triage summary: ${result.fixedIssues.length} fixed, ${result.skippedIssues.length} skipped, ${result.clarificationIssues.length} needs clarification`
              );
            }
          } else {
            // Autofix OFF: just look up comment IDs for DB storage, don't reply/resolve
            await matchGitHubCommentIds(
              github,
              owner,
              repo,
              pullRequest.number,
              result.fixedIssues,
              botUsername
            );
            console.log(
              `Matched GitHub comment IDs for ${result.fixedIssues.length} fixes (autofix off, no push/reply)`
            );
          }
        } else if (ignoredIssueCount > 0 && autofixEnabled && postSummary) {
          console.log("Skipped triage summary: all issues matched ignored autofix paths");
        }
      }
    );
  } catch (error) {
    console.error("Triage error:", error);
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export function getAutofixIgnoredDirForPath(
  filePath: string,
  ignoredDirs: string[]
): string | null {
  return getIgnoredDirForPath(filePath, ignoredDirs);
}

interface BodyOnlyResult {
  fixed: TriageResult["fixedIssues"];
  skipped: TriageResult["skippedIssues"];
  clarifications: TriageResult["clarificationIssues"];
}

interface BotComment {
  id: number;
  nodeId: string;
  path: string;
  line: number | null;
  body: string;
  user: string;
}

function formatThreadContext(
  comments: Array<{ user: string; body: string; id: number }>
): string | undefined {
  const lines = comments
    .map((comment) => {
      const body = comment.body.trim();
      return body ? `- ${comment.user}: ${body}` : "";
    })
    .filter(Boolean);

  if (lines.length === 0) {
    return undefined;
  }

  return lines.slice(-8).join("\n");
}

// Find matching comment using flexible matching:
// 1. Exact match: file + line
// 2. Fuzzy match: file + issue message appears in comment body
function findMatchingComment(
  botComments: BotComment[],
  issue: CodeIssue,
  usedCommentIds: Set<number>
): BotComment | undefined {
  // First try exact match by file and line
  let match = botComments.find(
    (c) => c.path === issue.file && c.line === issue.line && !usedCommentIds.has(c.id)
  );

  if (match) return match;

  // Fuzzy match: same file and comment contains key words from the issue message
  // Extract key words from issue message (first 30 chars, split by spaces)
  const issueKeywords = issue.message
    .slice(0, 50)
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 4); // Only words longer than 4 chars

  match = botComments.find((c) => {
    if (c.path !== issue.file || usedCommentIds.has(c.id)) return false;
    const bodyLower = c.body.toLowerCase();
    // Match if at least 2 keywords appear in the comment body
    const matchCount = issueKeywords.filter((kw) => bodyLower.includes(kw)).length;
    return matchCount >= 2;
  });

  return match;
}

function isRemediationSummaryComment(body: string): boolean {
  return body.startsWith("## Autofix Summary") || body.startsWith("## Remediation Summary");
}

async function upsertTriageSummaryComment(
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
        isRemediationSummaryComment(comment.body)
    );

  if (existingSummary) {
    await github.updateIssueComment(owner, repo, existingSummary.id, summaryBody);
    console.log(`Updated triage summary comment ${existingSummary.id}`);
    return;
  }

  await github.createIssueComment(owner, repo, pullNumber, summaryBody);
  console.log("Posted triage summary comment");
}

async function replyToInlineComments(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  fixedIssues: TriageResult["fixedIssues"],
  skippedIssues: TriageResult["skippedIssues"],
  clarificationIssues: TriageResult["clarificationIssues"],
  botUsername: string
): Promise<BodyOnlyResult> {
  const bodyOnly: BodyOnlyResult = { fixed: [], skipped: [], clarifications: [] };

  try {
    // Fetch all review comments on the PR
    const reviewComments = await github.getReviewComments(owner, repo, pullNumber);

    // Filter to only comments from the bot (the review comments we created)
    const botComments = reviewComments.filter(
      (c) => c.user === botUsername || c.user === `${botUsername}[bot]`
    );

    // Track which comments we've already replied to (avoid duplicates)
    const usedCommentIds = new Set<number>();

    // Process fixed issues
    for (const fixedItem of fixedIssues) {
      const { issue, commitSha, explanation } = fixedItem;
      const matchingComment = findMatchingComment(botComments, issue, usedCommentIds);

      if (matchingComment) {
        usedCommentIds.add(matchingComment.id);
        const replyBody = `✅ **Fixed in ${commitSha.slice(0, 7)}**\n\n${explanation}`;
        try {
          await github.replyToReviewComment(owner, repo, pullNumber, matchingComment.id, replyBody);
          console.log(`Replied to comment ${matchingComment.id} for ${issue.file}:${issue.line}`);

          const threadId = await github.getReviewThreadId(
            owner,
            repo,
            pullNumber,
            matchingComment.nodeId
          );
          if (threadId) {
            await github.resolveReviewThread(threadId);
            console.log(`Resolved thread for ${issue.file}:${issue.line}`);
          }
        } catch (error) {
          console.warn(`Failed to reply/resolve comment ${matchingComment.id}:`, error);
        }
      } else {
        // No inline comment - this was a body-only issue
        bodyOnly.fixed.push(fixedItem);
      }
    }

    // Process skipped issues
    for (const skippedItem of skippedIssues) {
      const { issue, reason } = skippedItem;
      const matchingComment = findMatchingComment(botComments, issue, usedCommentIds);

      if (matchingComment) {
        usedCommentIds.add(matchingComment.id);
        const replyBody = `⏭️ **Could not auto-fix**\n\n${reason}`;
        try {
          await github.replyToReviewComment(owner, repo, pullNumber, matchingComment.id, replyBody);
          console.log(
            `Replied to skipped comment ${matchingComment.id} for ${issue.file}:${issue.line}`
          );
        } catch (error) {
          console.warn(`Failed to reply to skipped comment ${matchingComment.id}:`, error);
        }
      } else {
        console.log(`No matching bot comment found for skipped issue ${issue.file}:${issue.line}`);
        // No inline comment - this was a body-only issue
        bodyOnly.skipped.push(skippedItem);
      }
    }

    // Process clarification-needed issues
    for (const clarificationItem of clarificationIssues) {
      const { issue, question, reason } = clarificationItem;
      const matchingComment = findMatchingComment(botComments, issue, usedCommentIds);

      if (matchingComment) {
        usedCommentIds.add(matchingComment.id);
        clarificationItem.githubCommentId = matchingComment.id;
        const replyBody = `❓ **Need clarification before auto-fixing**\n\n${reason}\n\n${question}`;
        try {
          await github.replyToReviewComment(owner, repo, pullNumber, matchingComment.id, replyBody);
          console.log(
            `Asked clarification on comment ${matchingComment.id} for ${issue.file}:${issue.line}`
          );
        } catch (error) {
          console.warn(`Failed to ask clarification on comment ${matchingComment.id}:`, error);
        }
      } else {
        bodyOnly.clarifications.push(clarificationItem);
      }
    }
  } catch (error) {
    console.error("Error replying to comments:", error);
  }

  return bodyOnly;
}

async function matchGitHubCommentIds(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  fixedIssues: TriageResult["fixedIssues"],
  botUsername: string
): Promise<void> {
  try {
    const reviewComments = await github.getReviewComments(owner, repo, pullNumber);
    const botComments = reviewComments.filter(
      (c) => c.user === botUsername || c.user === `${botUsername}[bot]`
    );
    const usedIds = new Set<number>();
    for (const item of fixedIssues) {
      const match = findMatchingComment(botComments, item.issue, usedIds);
      if (match) {
        usedIds.add(match.id);
        item.githubCommentId = match.id;
      }
    }
  } catch (error) {
    console.error("Error matching GitHub comment IDs:", error);
  }
}

function formatTriageSummary(
  fixedIssues: TriageResult["fixedIssues"],
  skippedIssues: TriageResult["skippedIssues"],
  clarificationIssues: TriageResult["clarificationIssues"],
  bodyOnly: BodyOnlyResult
): string {
  let body = "## Autofix Summary\n\n";

  // Summary counts
  const totalFixed = fixedIssues.length;
  const totalSkipped = skippedIssues.length;
  const totalClarification = clarificationIssues.length;
  const clarificationVerb = totalClarification === 1 ? "needs" : "need";

  if (totalFixed > 0 && totalSkipped === 0 && totalClarification === 0) {
    body += `${totalFixed} issue${totalFixed > 1 ? "s" : ""} fixed automatically.\n\n`;
  } else if (totalFixed === 0 && totalSkipped > 0 && totalClarification === 0) {
    body += `${totalSkipped} issue${totalSkipped > 1 ? "s" : ""} could not be auto-fixed.\n\n`;
  } else if (totalFixed === 0 && totalSkipped === 0 && totalClarification > 0) {
    body += `${totalClarification} issue${totalClarification > 1 ? "s" : ""} ${clarificationVerb} clarification.\n\n`;
  } else if (totalFixed === 0 && totalSkipped === 0 && totalClarification === 0) {
    body += "No autofix actions were needed for this push.\n\n";
  } else {
    body += `${totalFixed} fixed, ${totalSkipped} skipped, ${totalClarification} ${clarificationVerb} clarification.\n\n`;
  }

  // Fixed issues
  if (totalFixed > 0) {
    body += "### Fixed\n\n";
    for (const { issue, commitSha, explanation } of fixedIssues) {
      const details = explanation ? `: ${formatSummaryDetail(explanation)}` : "";
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\` — \`${commitSha.slice(0, 7)}\`${details}\n`;
    }
    body += "\n";
  }

  // Skipped issues
  if (totalSkipped > 0) {
    body += "### Skipped\n\n";
    for (const { issue, reason } of skippedIssues) {
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\`: ${formatSummaryDetail(reason)}\n`;
    }
    body += "\n";
  }

  // Clarification-needed issues
  if (totalClarification > 0) {
    body += "### Clarification Needed\n\n";
    for (const { issue, reason, question } of clarificationIssues) {
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\`: ${formatSummaryDetail(reason)} ${formatSummaryDetail(question)}\n`;
    }
    body += "\n";
  }

  // Note about body-only issues if any
  if (
    bodyOnly.fixed.length > 0 ||
    bodyOnly.skipped.length > 0 ||
    bodyOnly.clarifications.length > 0
  ) {
    const bodyOnlyCount =
      bodyOnly.fixed.length + bodyOnly.skipped.length + bodyOnly.clarifications.length;
    body += `---\n*${bodyOnlyCount} issue${bodyOnlyCount > 1 ? "s were" : " was"} found outside the diff (see above for details)*\n`;
  }

  return body;
}

function formatSummaryDetail(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
