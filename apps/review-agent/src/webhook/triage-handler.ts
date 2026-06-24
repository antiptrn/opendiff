import type { SimpleGit } from "simple-git";
import type { CiFailureDetails, MergeConflictDetails, TriageAgent } from "../agent/triage";
import type { CodeIssue } from "../agent/types";
import type { GitHubClient } from "../github/client";
import { withClonedRepo } from "../utils/git";
import { getIgnoredDirForPath, normalizeIgnoredDirs } from "../utils/ignored-dirs";
import { withRetry } from "../utils/retry";

interface TriageResult {
  success: boolean;
  tokensUsed?: number;
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

interface MergeConflictPullRequestInfo extends PullRequestInfo {
  base: {
    sha: string;
    ref: string;
  };
}

interface MergeConflictAutofixResult extends TriageResult {
  conflictFound: boolean;
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
    if (autofixEnabled && postSummary) {
      const summaryBody = formatTriageSummary(
        result.fixedIssues,
        result.skippedIssues,
        result.clarificationIssues,
        {
          fixed: [],
          skipped: [],
          clarifications: [],
        }
      );
      await upsertTriageSummaryComment(
        github,
        owner,
        repo,
        pullRequest.number,
        botUsername,
        summaryBody
      );
      console.log("Upserted triage summary: no remediation actions were needed for this push");
    }
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

        // Process each issue one by one using the OpenCode SDK
        for (const issue of fixableIssues) {
          console.log(`Processing issue: ${issue.type} in ${issue.file}:${issue.line}`);

          try {
            const ignoredDir = getAutofixIgnoredDirForPath(issue.file, autofixIgnoredDirs);
            if (ignoredDir) {
              const reason = `Autofix is configured to ignore \`${ignoredDir}\`.`;
              console.log(
                `Skipping issue matching ignored autofix path pattern ${ignoredDir}: ${issue.file}`
              );
              result.skippedIssues.push({ issue, reason });
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
            result.tokensUsed = (result.tokensUsed ?? 0) + (fix.tokensUsed ?? 0);

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

export async function handleCiFailureAutofix(
  github: GitHubClient,
  triageAgent: TriageAgent,
  pullRequest: PullRequestInfo,
  failure: CiFailureDetails,
  owner: string,
  repo: string,
  botUsername: string,
  autofixEnabled: boolean,
  options?: {
    autofixIgnoredDirs?: string[];
  }
): Promise<TriageResult> {
  const result: TriageResult = {
    success: true,
    fixedIssues: [],
    skippedIssues: [],
    clarificationIssues: [],
  };
  const autofixIgnoredDirs = normalizeIgnoredDirs(options?.autofixIgnoredDirs ?? []);
  const issue = createCiFailureIssue(failure);

  try {
    console.log(`Cloning ${owner}/${repo} branch ${pullRequest.head.ref} for CI autofix`);

    await withClonedRepo(
      {
        mode: "read-write",
        github,
        owner,
        repo,
        branch: pullRequest.head.ref,
        label: `ci-autofix-${pullRequest.number}`,
        botUsername,
      },
      async (_tempDir, git) => {
        const fix = await triageAgent.fixCiFailure(failure, _tempDir, {
          autofixIgnoredDirs,
        });
        result.tokensUsed = (result.tokensUsed ?? 0) + (fix.tokensUsed ?? 0);

        if (!fix.fixed) {
          if (fix.requiresClarification) {
            result.clarificationIssues.push({
              issue,
              question:
                fix.clarificationQuestion || "Can you clarify how this CI failure should be fixed?",
              reason: fix.explanation,
            });
          } else {
            result.skippedIssues.push({
              issue,
              reason: fix.explanation,
            });
          }
          return;
        }

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

          result.skippedIssues.push({
            issue,
            reason: `Autofix produced changes matching ignored path pattern \`${ignoredChangedDir}\`.`,
          });
          return;
        }

        const stagedDiff = await git.diff(["--cached", "--no-color"]);
        const shortName = failure.name.slice(0, 50);
        const commitMessage = `fix(ci): ${shortName}${failure.name.length > 50 ? "..." : ""}`;
        const commitResult = await git.commit(commitMessage);

        console.log(`Committed CI autofix: ${commitResult.commit}`);
        result.fixedIssues.push({
          issue,
          commitSha: commitResult.commit,
          explanation: fix.explanation,
          diff: stagedDiff,
        });

        if (autofixEnabled) {
          console.log(`Pushing CI autofix commit to ${pullRequest.head.ref}`);
          await withRetry(() => git.push("origin", pullRequest.head.ref), "git push");
        }
      }
    );

    if (autofixEnabled) {
      await upsertCiAutofixSummaryComment(
        github,
        owner,
        repo,
        pullRequest.number,
        botUsername,
        failure,
        result
      );
    }
  } catch (error) {
    console.error("CI autofix error:", error);
    result.success = false;
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

export async function handleMergeConflictAutofix(
  github: GitHubClient,
  triageAgent: TriageAgent,
  pullRequest: MergeConflictPullRequestInfo,
  owner: string,
  repo: string,
  botUsername: string,
  autofixEnabled: boolean,
  options?: {
    autofixIgnoredDirs?: string[];
  }
): Promise<MergeConflictAutofixResult> {
  const result: MergeConflictAutofixResult = {
    success: true,
    conflictFound: false,
    fixedIssues: [],
    skippedIssues: [],
    clarificationIssues: [],
  };
  const autofixIgnoredDirs = normalizeIgnoredDirs(options?.autofixIgnoredDirs ?? []);
  let conflictDetails: MergeConflictDetails | null = null;

  try {
    console.log(
      `Checking ${owner}/${repo}#${pullRequest.number} for merge conflicts with ${pullRequest.base.ref}`
    );

    await withClonedRepo(
      {
        mode: "read-write",
        github,
        owner,
        repo,
        branch: pullRequest.head.ref,
        label: `merge-autofix-${pullRequest.number}`,
        botUsername,
      },
      async (_tempDir, git) => {
        const mergeAttempt = await attemptBaseMergeForConflicts(git, pullRequest.base.ref);

        if (!mergeAttempt.conflictFound) {
          await abortMergeIfPossible(git);
          console.log(
            `No merge conflicts found for ${owner}/${repo}#${pullRequest.number} against ${pullRequest.base.ref}`
          );
          return;
        }

        result.conflictFound = true;
        conflictDetails = await buildMergeConflictDetails(git, pullRequest, mergeAttempt.files);
        const issue = createMergeConflictIssue(conflictDetails);

        console.log(
          `Merge conflicts found in ${mergeAttempt.files.length} file(s): ${mergeAttempt.files.join(", ")}`
        );

        const fix = await triageAgent.fixMergeConflict(conflictDetails, _tempDir, {
          autofixIgnoredDirs,
        });
        result.tokensUsed = (result.tokensUsed ?? 0) + (fix.tokensUsed ?? 0);

        if (!fix.fixed) {
          if (fix.requiresClarification) {
            result.clarificationIssues.push({
              issue,
              question:
                fix.clarificationQuestion ||
                "Can you clarify how these merge conflicts should be resolved?",
              reason: fix.explanation,
            });
          } else {
            result.skippedIssues.push({
              issue,
              reason: fix.explanation,
            });
          }
          return;
        }

        const postFixStatus = await git.status();
        if (postFixStatus.conflicted.length > 0) {
          result.skippedIssues.push({
            issue,
            reason: `Autofix left unresolved merge conflicts in ${postFixStatus.conflicted.join(", ")}.`,
          });
          return;
        }

        const filesWithMarkers = await findConflictMarkerFiles(
          git,
          conflictDetails.conflictedFiles
        );
        if (filesWithMarkers.length > 0) {
          result.skippedIssues.push({
            issue,
            reason: `Autofix left conflict markers in ${filesWithMarkers.join(", ")}.`,
          });
          return;
        }

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
          await abortMergeIfPossible(git);
          await git.raw(["reset", "--hard"]);
          await git.raw(["clean", "-fd"]);

          result.skippedIssues.push({
            issue,
            reason: `Autofix produced changes matching ignored path pattern \`${ignoredChangedDir}\`.`,
          });
          return;
        }

        const stagedDiff = await git.diff(["--cached", "--no-color"]);
        const commitMessage = `fix(merge): resolve ${pullRequest.base.ref} conflicts`;
        const commitResult = await git.commit(commitMessage);

        console.log(`Committed merge conflict autofix: ${commitResult.commit}`);
        result.fixedIssues.push({
          issue,
          commitSha: commitResult.commit,
          explanation: fix.explanation,
          diff: stagedDiff,
        });

        if (autofixEnabled) {
          console.log(`Pushing merge conflict autofix commit to ${pullRequest.head.ref}`);
          await withRetry(() => git.push("origin", pullRequest.head.ref), "git push");
        }
      }
    );

    if (result.conflictFound && autofixEnabled && conflictDetails) {
      await upsertMergeConflictAutofixSummaryComment(
        github,
        owner,
        repo,
        pullRequest.number,
        botUsername,
        conflictDetails,
        result
      );
    }
  } catch (error) {
    console.error("Merge conflict autofix error:", error);
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

function createCiFailureIssue(failure: CiFailureDetails): CodeIssue {
  return {
    type: "bug-risk",
    severity: "warning",
    file: "CI",
    line: 1,
    message: `CI failed: ${failure.name}`,
    suggestion: failure.url ? `Inspect failing CI details: ${failure.url}` : undefined,
  };
}

function createMergeConflictIssue(conflict: MergeConflictDetails): CodeIssue {
  const primaryFile = conflict.conflictedFiles[0] ?? "merge-conflict";
  return {
    type: "bug-risk",
    severity: "critical",
    file: primaryFile,
    line: 1,
    message: `Merge conflicts with ${conflict.baseBranch}`,
    suggestion: `Resolve conflicts between ${conflict.headBranch} and ${conflict.baseBranch}.`,
  };
}

interface BaseMergeAttemptResult {
  conflictFound: boolean;
  files: string[];
  retryWithFullHistory?: boolean;
}

async function attemptBaseMergeForConflicts(
  git: SimpleGit,
  baseBranch: string
): Promise<BaseMergeAttemptResult> {
  const baseRef = `refs/remotes/origin/${baseBranch}`;
  await fetchBaseBranchForMerge(git, baseBranch, true);

  const firstAttempt = await runBaseMergeAttempt(git, baseRef);
  if (!firstAttempt.retryWithFullHistory) {
    return firstAttempt;
  }

  await abortMergeIfPossible(git);
  await fetchFullHistoryForMerge(git);
  await fetchBaseBranchForMerge(git, baseBranch, false);
  return runBaseMergeAttempt(git, baseRef);
}

async function fetchBaseBranchForMerge(
  git: SimpleGit,
  baseBranch: string,
  shallow: boolean
): Promise<void> {
  const refspec = `${baseBranch}:refs/remotes/origin/${baseBranch}`;
  const args = ["fetch", "origin", refspec];
  if (shallow) {
    args.push("--depth=100");
  }

  await withRetry(() => git.raw(args), "git fetch base branch");
}

async function fetchFullHistoryForMerge(git: SimpleGit): Promise<void> {
  try {
    await git.raw(["fetch", "--unshallow", "origin"]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("does not make sense") && !message.includes("not a shallow repository")) {
      throw error;
    }
  }
}

async function runBaseMergeAttempt(
  git: SimpleGit,
  baseRef: string
): Promise<BaseMergeAttemptResult> {
  try {
    await git.raw(["merge", "--no-commit", "--no-ff", baseRef]);
    return { conflictFound: false, files: [] };
  } catch (error) {
    const status = await git.status().catch(() => null);
    if (status?.conflicted.length) {
      return {
        conflictFound: true,
        files: status.conflicted,
      };
    }

    if (isShallowMergeFailure(error)) {
      return {
        conflictFound: false,
        files: [],
        retryWithFullHistory: true,
      };
    }

    throw error;
  }
}

function isShallowMergeFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("refusing to merge unrelated histories") ||
    message.includes("shallow") ||
    message.includes("no merge base")
  );
}

async function abortMergeIfPossible(git: SimpleGit): Promise<void> {
  try {
    await git.raw(["merge", "--abort"]);
  } catch {
    try {
      await git.raw(["reset", "--hard", "HEAD"]);
    } catch {
      // Best-effort cleanup in a disposable clone.
    }
  }
}

async function buildMergeConflictDetails(
  git: SimpleGit,
  pullRequest: MergeConflictPullRequestInfo,
  conflictedFiles: string[]
): Promise<MergeConflictDetails> {
  const status = await git.raw(["status", "--short"]).catch(() => "");
  const diffArgs = ["diff", "--no-color", "--cc"];
  if (conflictedFiles.length > 0) {
    diffArgs.push("--", ...conflictedFiles);
  }
  const diff = await git.raw(diffArgs).catch(() => git.diff(["--no-color"]));

  return {
    baseBranch: pullRequest.base.ref,
    baseSha: pullRequest.base.sha,
    headBranch: pullRequest.head.ref,
    headSha: pullRequest.head.sha,
    conflictedFiles,
    status,
    diff,
  };
}

async function findConflictMarkerFiles(git: SimpleGit, files: string[]): Promise<string[]> {
  if (files.length === 0) {
    return [];
  }

  try {
    const output = await git.raw([
      "grep",
      "-n",
      "-E",
      "^(<<<<<<<|=======|>>>>>>>)",
      "--",
      ...files,
    ]);
    return [
      ...new Set(
        output
          .split("\n")
          .map((line) => line.split(":")[0]?.trim())
          .filter((file): file is string => Boolean(file))
      ),
    ];
  } catch {
    return [];
  }
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
  return body.startsWith("## Remediation Summary");
}

function getCiAutofixMarker(failure: CiFailureDetails): string {
  const checkSlug = failure.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `<!-- opendiff-ci-autofix:${failure.headSha}:${checkSlug || "check"} -->`;
}

function isCiAutofixSummaryComment(body: string, failure: CiFailureDetails): boolean {
  return body.includes(getCiAutofixMarker(failure));
}

function getMergeConflictAutofixMarker(conflict: MergeConflictDetails): string {
  return `<!-- opendiff-merge-autofix:${conflict.headSha}:${conflict.baseSha} -->`;
}

function isMergeConflictAutofixSummaryComment(
  body: string,
  conflict: MergeConflictDetails
): boolean {
  return body.includes(getMergeConflictAutofixMarker(conflict));
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

async function upsertCiAutofixSummaryComment(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string,
  failure: CiFailureDetails,
  result: TriageResult
): Promise<void> {
  const body = formatCiAutofixSummary(failure, result);
  const issueComments = await github.getIssueComments(owner, repo, pullNumber);
  const existingSummary = [...issueComments]
    .reverse()
    .find(
      (comment) =>
        (comment.user === botUsername || comment.user === `${botUsername}[bot]`) &&
        isCiAutofixSummaryComment(comment.body, failure)
    );

  if (existingSummary) {
    await github.updateIssueComment(owner, repo, existingSummary.id, body);
    console.log(`Updated CI autofix summary comment ${existingSummary.id}`);
    return;
  }

  await github.createIssueComment(owner, repo, pullNumber, body);
  console.log("Posted CI autofix summary comment");
}

async function upsertMergeConflictAutofixSummaryComment(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  botUsername: string,
  conflict: MergeConflictDetails,
  result: TriageResult
): Promise<void> {
  const body = formatMergeConflictAutofixSummary(conflict, result);
  const issueComments = await github.getIssueComments(owner, repo, pullNumber);
  const existingSummary = [...issueComments]
    .reverse()
    .find(
      (comment) =>
        (comment.user === botUsername || comment.user === `${botUsername}[bot]`) &&
        isMergeConflictAutofixSummaryComment(comment.body, conflict)
    );

  if (existingSummary) {
    await github.updateIssueComment(owner, repo, existingSummary.id, body);
    console.log(`Updated merge conflict autofix summary comment ${existingSummary.id}`);
    return;
  }

  await github.createIssueComment(owner, repo, pullNumber, body);
  console.log("Posted merge conflict autofix summary comment");
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
  let body = "## Remediation Summary\n\n";

  // Summary counts
  const totalFixed = fixedIssues.length;
  const totalSkipped = skippedIssues.length;
  const totalClarification = clarificationIssues.length;

  if (totalFixed > 0 && totalSkipped === 0 && totalClarification === 0) {
    body += `✅ **${totalFixed} issue${totalFixed > 1 ? "s" : ""} fixed automatically**\n\n`;
  } else if (totalFixed === 0 && totalSkipped > 0 && totalClarification === 0) {
    body += `⏭️ **${totalSkipped} issue${totalSkipped > 1 ? "s" : ""} could not be auto-fixed**\n\n`;
  } else if (totalFixed === 0 && totalSkipped === 0 && totalClarification > 0) {
    body += `❓ **${totalClarification} issue${totalClarification > 1 ? "s" : ""} need clarification**\n\n`;
  } else if (totalFixed === 0 && totalSkipped === 0 && totalClarification === 0) {
    body += "ℹ️ **No remediation actions were needed for this push**\n\n";
  } else {
    body += `✅ **${totalFixed} fixed** · ⏭️ **${totalSkipped} skipped** · ❓ **${totalClarification} needs clarification**\n\n`;
  }

  // Fixed issues
  if (totalFixed > 0) {
    body += "### ✅ Fixed\n\n";
    for (const { issue, commitSha, explanation } of fixedIssues) {
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\` — \`${commitSha.slice(0, 7)}\`\n`;
      if (explanation) {
        body += `  > ${explanation}\n`;
      }
    }
    body += "\n";
  }

  // Skipped issues
  if (totalSkipped > 0) {
    body += "### ⏭️ Skipped\n\n";
    for (const { issue, reason } of skippedIssues) {
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
      body += `  > ${reason}\n`;
    }
    body += "\n";
  }

  // Clarification-needed issues
  if (totalClarification > 0) {
    body += "### ❓ Clarification Needed\n\n";
    for (const { issue, reason, question } of clarificationIssues) {
      body += `- **${issue.type}** in \`${issue.file}:${issue.line}\`\n`;
      body += `  > ${reason}\n`;
      body += `  > ${question}\n`;
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

function formatCiAutofixSummary(failure: CiFailureDetails, result: TriageResult): string {
  let body = `${getCiAutofixMarker(failure)}\n## CI Autofix Summary\n\n`;
  body += `**Check:** ${failure.name}\n`;
  body += `**Conclusion:** ${failure.conclusion}\n`;
  body += `**Commit:** \`${failure.headSha.slice(0, 7)}\`\n`;
  if (failure.url) {
    body += `**Details:** ${failure.url}\n`;
  }
  body += "\n";

  const fixed = result.fixedIssues[0];
  if (fixed) {
    body += `✅ **Fixed automatically in ${fixed.commitSha.slice(0, 7)}**\n\n`;
    if (fixed.explanation) {
      body += `${fixed.explanation}\n`;
    }
    return body;
  }

  const clarification = result.clarificationIssues[0];
  if (clarification) {
    body += "❓ **Need clarification before auto-fixing**\n\n";
    body += `${clarification.reason}\n\n${clarification.question}\n`;
    return body;
  }

  const skipped = result.skippedIssues[0];
  if (skipped) {
    body += "⏭️ **Could not auto-fix this CI failure**\n\n";
    body += `${skipped.reason}\n`;
    return body;
  }

  body += "ℹ️ **No remediation actions were needed for this CI failure**\n";
  return body;
}

function formatMergeConflictAutofixSummary(
  conflict: MergeConflictDetails,
  result: TriageResult
): string {
  let body = `${getMergeConflictAutofixMarker(conflict)}\n## Merge Conflict Autofix Summary\n\n`;
  body += `**Head:** ${conflict.headBranch} (\`${conflict.headSha.slice(0, 7)}\`)\n`;
  body += `**Base:** ${conflict.baseBranch} (\`${conflict.baseSha.slice(0, 7)}\`)\n`;
  body += `**Conflicted files:** ${conflict.conflictedFiles.map((file) => `\`${file}\``).join(", ")}\n\n`;

  const fixed = result.fixedIssues[0];
  if (fixed) {
    body += `✅ **Resolved automatically in ${fixed.commitSha.slice(0, 7)}**\n\n`;
    if (fixed.explanation) {
      body += `${fixed.explanation}\n`;
    }
    return body;
  }

  const clarification = result.clarificationIssues[0];
  if (clarification) {
    body += "❓ **Need clarification before resolving these conflicts**\n\n";
    body += `${clarification.reason}\n\n${clarification.question}\n`;
    return body;
  }

  const skipped = result.skippedIssues[0];
  if (skipped) {
    body += "⏭️ **Could not auto-resolve these merge conflicts**\n\n";
    body += `${skipped.reason}\n`;
    return body;
  }

  body += "ℹ️ **No merge conflict remediation action was needed**\n";
  return body;
}
