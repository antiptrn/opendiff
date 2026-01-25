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

  // Filter to only critical and warning issues (not suggestions)
  const allFixableIssues = reviewIssues.filter(
    (issue) => issue.severity === "critical" || issue.severity === "warning"
  );

  if (allFixableIssues.length === 0) {
    console.log("No fixable issues found (only suggestions)");
    return result;
  }

  // Limit issues per cycle to prevent runaway loops
  const fixableIssues = allFixableIssues.slice(0, MAX_ISSUES_PER_CYCLE);
  if (allFixableIssues.length > MAX_ISSUES_PER_CYCLE) {
    console.log(`Limiting to ${MAX_ISSUES_PER_CYCLE} issues this cycle (${allFixableIssues.length} total)`);
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

    // Track files that have been modified to read updated content
    const modifiedFiles = new Map<string, string>();

    // Process each issue one by one
    for (const issue of fixableIssues) {
      console.log(`Processing issue: ${issue.type} in ${issue.file}:${issue.line}`);

      try {
        // Read the current file content (may have been modified by previous fixes)
        let fileContent: string;
        if (modifiedFiles.has(issue.file)) {
          fileContent = modifiedFiles.get(issue.file)!;
        } else {
          const filePath = `${tempDir}/${issue.file}`;
          const file = Bun.file(filePath);
          if (!(await file.exists())) {
            result.skippedIssues.push({
              issue,
              reason: `File not found: ${issue.file}`,
            });
            continue;
          }
          fileContent = await file.text();
        }

        // Validate if the issue should be fixed
        const validation = await triageAgent.validateIssue(issue, fileContent);
        if (!validation.valid) {
          console.log(`Issue skipped: ${validation.reason}`);
          result.skippedIssues.push({
            issue,
            reason: validation.reason,
          });
          continue;
        }

        // Generate the fix
        const fix = await triageAgent.fixIssue(issue, fileContent);
        if (!fix.fixed || !fix.newContent) {
          console.log(`Could not fix issue: ${fix.explanation}`);
          result.skippedIssues.push({
            issue,
            reason: fix.explanation,
          });
          continue;
        }

        // Write the fixed file
        const filePath = `${tempDir}/${issue.file}`;
        await Bun.write(filePath, fix.newContent);
        modifiedFiles.set(issue.file, fix.newContent);

        // Commit the fix
        const shortMessage = issue.message.slice(0, 50);
        const commitMessage = `fix(${issue.type}): ${shortMessage}${issue.message.length > 50 ? "..." : ""}

Auto-fix for ${issue.severity} issue at ${issue.file}:${issue.line}

${fix.explanation}`;

        await git.add(issue.file);
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

    // Push all commits if any fixes were made
    if (result.fixedIssues.length > 0) {
      console.log(`Pushing ${result.fixedIssues.length} commits to ${pullRequest.head.ref}`);
      await git.push("origin", pullRequest.head.ref);

      // Reply to individual review comments with fix explanations
      await replyToFixedComments(github, owner, repo, pullRequest.number, result.fixedIssues, botUsername);

      // Post a summary comment only if there were skipped issues (so user knows what couldn't be fixed)
      if (result.skippedIssues.length > 0) {
        const summaryBody = formatSkippedSummary(result.skippedIssues, botUsername);
        await github.createIssueComment(owner, repo, pullRequest.number, summaryBody);
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

async function replyToFixedComments(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  fixedIssues: TriageResult["fixedIssues"],
  botUsername: string
): Promise<void> {
  try {
    // Fetch all review comments on the PR
    const reviewComments = await github.getReviewComments(owner, repo, pullNumber);

    // Filter to only comments from the bot (the review comments we created)
    const botComments = reviewComments.filter((c) =>
      c.user === botUsername || c.user === `${botUsername}[bot]`
    );

    // For each fixed issue, find the matching comment and reply
    for (const { issue, commitSha, explanation } of fixedIssues) {
      // Find comment matching this issue by file and line
      const matchingComment = botComments.find(
        (c) => c.path === issue.file && c.line === issue.line
      );

      if (matchingComment) {
        const replyBody = `✅ **Fixed in ${commitSha.slice(0, 7)}**\n\n${explanation}`;
        try {
          await github.replyToReviewComment(owner, repo, pullNumber, matchingComment.id, replyBody);
          console.log(`Replied to comment ${matchingComment.id} for ${issue.file}:${issue.line}`);
        } catch (error) {
          console.warn(`Failed to reply to comment ${matchingComment.id}:`, error);
        }
      } else {
        console.log(`No matching comment found for ${issue.file}:${issue.line}`);
      }
    }
  } catch (error) {
    console.error("Error replying to fixed comments:", error);
  }
}

function formatSkippedSummary(
  skippedIssues: TriageResult["skippedIssues"],
  botUsername: string
): string {
  let body = `## ⏭️ Auto-Fix Skipped Issues\n\n`;
  body += `The following issues could not be automatically fixed:\n\n`;

  for (const { issue, reason } of skippedIssues) {
    body += `- **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
    body += `  - ${issue.message}\n`;
    body += `  - Reason: ${reason}\n`;
  }

  body += `\n---\n*@${botUsername}*`;

  return body;
}
