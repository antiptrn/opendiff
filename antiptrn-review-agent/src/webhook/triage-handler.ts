import { rm, mkdir } from "node:fs/promises";
import { simpleGit, type SimpleGit } from "simple-git";
import type { TriageAgent } from "../agent/triage";
import type { CodeIssue } from "../agent/types";
import type { GitHubClient } from "../github/client";

interface TriageResult {
  success: boolean;
  fixedIssues: Array<{
    issue: CodeIssue;
    commitSha: string;
    explanation: string;
  }>;
  skippedIssues: Array<{
    issue: CodeIssue;
    reason: string;
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
  botUsername: string
): Promise<TriageResult> {
  const result: TriageResult = {
    success: true,
    fixedIssues: [],
    skippedIssues: [],
  };

  if (reviewIssues.length === 0) {
    console.log("No issues to fix");
    return result;
  }

  // Limit issues per cycle to prevent runaway loops
  const fixableIssues = reviewIssues.slice(0, MAX_ISSUES_PER_CYCLE);
  if (reviewIssues.length > MAX_ISSUES_PER_CYCLE) {
    console.log(`Limiting to ${MAX_ISSUES_PER_CYCLE} issues this cycle (${reviewIssues.length} total)`);
  }

  const tempDir = `/tmp/triage-${owner}-${repo}-${pullRequest.number}-${Date.now()}`;

  try {
    // Get installation token for authenticated git clone
    const token = await github.getInstallationToken();
    if (!token) {
      return {
        success: false,
        fixedIssues: [],
        skippedIssues: fixableIssues.map((issue) => ({
          issue,
          reason: "Could not get installation token for git operations",
        })),
        error: "Could not get installation token",
      };
    }

    // Clone the repository
    await mkdir(tempDir, { recursive: true });
    const cloneUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    const git: SimpleGit = simpleGit(tempDir);

    console.log(`Cloning ${owner}/${repo} branch ${pullRequest.head.ref} to ${tempDir}`);
    await git.clone(cloneUrl, ".", {
      "--branch": pullRequest.head.ref,
      "--depth": "1",
      "--single-branch": null,
    });

    // Configure git for commits
    await git.addConfig("user.email", `${botUsername}[bot]@users.noreply.github.com`);
    await git.addConfig("user.name", `${botUsername}[bot]`);

    // Process each issue one by one using the Claude Agent SDK
    for (const issue of fixableIssues) {
      console.log(`Processing issue: ${issue.type} in ${issue.file}:${issue.line}`);

      try {
        // Use Claude Agent SDK to fix the issue - it has full access to read/write files
        const fix = await triageAgent.fixIssue(issue, tempDir);

        if (!fix.fixed) {
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
        const commitMessage = `fix(${issue.type}): ${shortMessage}${issue.message.length > 50 ? "..." : ""}

Auto-fix for ${issue.severity} issue at ${issue.file}:${issue.line}

${fix.explanation}`;

        // Add all modified/created files
        await git.add(".");
        const commitResult = await git.commit(commitMessage);

        console.log(`Committed fix: ${commitResult.commit}`);
        result.fixedIssues.push({
          issue,
          commitSha: commitResult.commit,
          explanation: fix.explanation,
        });
      } catch (error) {
        console.error(`Error processing issue in ${issue.file}:`, error);
        result.skippedIssues.push({
          issue,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(`Triage complete: ${result.fixedIssues.length} fixed, ${result.skippedIssues.length} skipped`);

    // Push all commits if any fixes were made
    if (result.fixedIssues.length > 0) {
      console.log(`Pushing ${result.fixedIssues.length} commits to ${pullRequest.head.ref}`);
      await git.push("origin", pullRequest.head.ref);
    }

    // Reply to inline comments and collect body-only issues
    if (result.fixedIssues.length > 0 || result.skippedIssues.length > 0) {
      const bodyOnly = await replyToInlineComments(
        github,
        owner,
        repo,
        pullRequest.number,
        result.fixedIssues,
        result.skippedIssues,
        botUsername
      );

      // Post a summary comment for issues that were in the review body (not inline comments)
      if (bodyOnly.fixed.length > 0 || bodyOnly.skipped.length > 0) {
        const summaryBody = formatBodyOnlySummary(bodyOnly);
        await github.createIssueComment(owner, repo, pullRequest.number, summaryBody);
        console.log(`Posted summary for ${bodyOnly.fixed.length} fixed and ${bodyOnly.skipped.length} skipped body-only issues`);
      }

      // Note: The push will trigger a new review cycle via the 'synchronize' event.
      // If there are remaining issues, the next cycle will fix them.
      // This creates a loop until all issues are resolved.
    }
  } catch (error) {
    console.error("Triage error:", error);
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  } finally {
    // Cleanup temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      console.warn(`Failed to cleanup temp directory: ${tempDir}`);
    }
  }

  return result;
}

interface BodyOnlyResult {
  fixed: TriageResult["fixedIssues"];
  skipped: TriageResult["skippedIssues"];
}

interface BotComment {
  id: number;
  nodeId: string;
  path: string;
  line: number | null;
  body: string;
  user: string;
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

async function replyToInlineComments(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  fixedIssues: TriageResult["fixedIssues"],
  skippedIssues: TriageResult["skippedIssues"],
  botUsername: string
): Promise<BodyOnlyResult> {
  const bodyOnly: BodyOnlyResult = { fixed: [], skipped: [] };

  try {
    // Fetch all review comments on the PR
    const reviewComments = await github.getReviewComments(owner, repo, pullNumber);

    // Filter to only comments from the bot (the review comments we created)
    const botComments = reviewComments.filter((c) =>
      c.user === botUsername || c.user === `${botUsername}[bot]`
    );

    // Track which comments we've already replied to (avoid duplicates)
    const usedCommentIds = new Set<number>();

    // Process fixed issues
    for (const fixedItem of fixedIssues) {
      const { issue, commitSha, explanation } = fixedItem;
      const matchingComment = findMatchingComment(botComments, issue, usedCommentIds);

      if (matchingComment) {
        const replyBody = `✅ **Fixed in ${commitSha.slice(0, 7)}**\n\n${explanation}`;
        try {
          await github.replyToReviewComment(owner, repo, pullNumber, matchingComment.id, replyBody);
          console.log(`Replied to comment ${matchingComment.id} for ${issue.file}:${issue.line}`);

          const threadId = await github.getReviewThreadId(owner, repo, pullNumber, matchingComment.nodeId);
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
      const matchingComment = botComments.find(
        (c) => c.path === issue.file && c.line === issue.line
      );

      if (matchingComment) {
        const replyBody = `⏭️ **Skipped auto-fix**\n\n${reason}`;
        try {
          await github.replyToReviewComment(owner, repo, pullNumber, matchingComment.id, replyBody);
          console.log(`Replied to skipped comment ${matchingComment.id} for ${issue.file}:${issue.line}`);

          const threadId = await github.getReviewThreadId(owner, repo, pullNumber, matchingComment.nodeId);
          if (threadId) {
            await github.resolveReviewThread(threadId);
            console.log(`Resolved skipped thread for ${issue.file}:${issue.line}`);
          }
        } catch (error) {
          console.warn(`Failed to reply/resolve skipped comment ${matchingComment.id}:`, error);
        }
      } else {
        // No inline comment - this was a body-only issue
        bodyOnly.skipped.push(skippedItem);
      }
    }
  } catch (error) {
    console.error("Error replying to comments:", error);
  }

  return bodyOnly;
}

function formatBodyOnlySummary(bodyOnly: BodyOnlyResult): string {
  let body = "## 🔧 Auto-Fix Results (Additional Issues)\n\n";
  body += "The following issues from the review body have been processed:\n\n";

  if (bodyOnly.fixed.length > 0) {
    body += "### ✅ Fixed\n\n";
    for (const { issue, commitSha, explanation } of bodyOnly.fixed) {
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\` — Fixed in ${commitSha.slice(0, 7)}\n`;
      body += `  - ${explanation}\n`;
    }
    body += "\n";
  }

  if (bodyOnly.skipped.length > 0) {
    body += "### ⏭️ Skipped\n\n";
    for (const { issue, reason } of bodyOnly.skipped) {
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
      body += `  - ${reason}\n`;
    }
  }

  return body;
}

