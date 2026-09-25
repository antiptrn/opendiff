import type { GitHubClient } from "../github/client";

type ReviewComments = Awaited<ReturnType<GitHubClient["getReviewComments"]>>;

interface AutofixContextOptions {
  pullRequestAuthor?: string;
  trustedUsers?: string[];
}

const TRUNCATED = "… [truncated]";

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : value.slice(0, limit - TRUNCATED.length) + TRUNCATED;
}

/** Keep recent entries intact and explicitly indicate omitted history. */
export function formatContextEntries(entries: string[], budget = 8_000): string {
  if (entries.length === 0) return "No entries returned.";

  const selected: string[] = [];
  let remaining = budget - 100; // Reserve space for the omission notice and separators.
  for (let index = entries.length - 1; index >= 0; index--) {
    if (remaining < 200) break;
    const entry = truncate(entries[index], Math.min(2_000, remaining));
    selected.unshift(entry);
    remaining -= entry.length + 2;
  }

  const omitted = entries.length - selected.length;
  return [
    ...(omitted ? [`[${omitted} older entries omitted; most recent entries follow.]`] : []),
    ...selected,
  ].join("\n\n");
}

export async function loadAutofixContext(
  github: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  options: AutofixContextOptions = {}
): Promise<{ text: string; reviewComments: ReviewComments }> {
  // A failure in one optional source must not discard the others or prevent fixes.
  const [commits, discussion, reviews, inline, pullRequestAuthor] = await Promise.allSettled([
    github.getPullRequestCommits(owner, repo, pullNumber),
    github.getIssueComments(owner, repo, pullNumber),
    github.getPullRequestReviews(owner, repo, pullNumber),
    github.getReviewComments(owner, repo, pullNumber),
    options.pullRequestAuthor
      ? Promise.resolve(options.pullRequestAuthor)
      : github.getPullRequest(owner, repo, pullNumber).then((pullRequest) => pullRequest.user.login),
  ]);

  if (pullRequestAuthor.status === "rejected") {
    console.warn("Failed to load autofix context: pull request author", pullRequestAuthor.reason);
  }

  const trustedUsers = new Set((options.trustedUsers ?? []).map((user) => user.toLowerCase()));
  if (pullRequestAuthor.status === "fulfilled") {
    trustedUsers.add(pullRequestAuthor.value.toLowerCase());
  }

  const participants = new Set<string>();
  for (const result of [discussion, reviews, inline]) {
    if (result.status === "fulfilled") {
      for (const entry of result.value) participants.add(entry.user.toLowerCase());
    }
  }

  await Promise.all(
    [...participants]
      .filter((user) => !trustedUsers.has(user) && user !== "unknown")
      .map(async (user) => {
        try {
          const permission = await github.getCollaboratorPermission(owner, repo, user);
          if (permission === "admin" || permission === "maintain" || permission === "write") {
            trustedUsers.add(user);
          }
        } catch (error) {
          // Permission lookup failures must fail closed: the participant remains untrusted.
          console.warn(`Failed to verify autofix context participant @${user}`, error);
        }
      })
  );

  function section<T>(
    title: string,
    result: PromiseSettledResult<T[]>,
    format: (entry: T) => string,
    budget = 8_000,
    restrictToTrustedParticipants = true
  ): string {
    if (result.status === "rejected") {
      console.warn(`Failed to load autofix context: ${title}`, result.reason);
      return `## ${title}\nContext unavailable (fetch failed).`;
    }
    const included = restrictToTrustedParticipants
      ? result.value.filter(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            "user" in entry &&
            typeof entry.user === "string" &&
            trustedUsers.has(entry.user.toLowerCase())
        )
      : result.value;
    const excluded = result.value.length - included.length;
    const exclusionNotice = excluded
      ? `[${excluded} entries excluded because their authors are not trusted for write-enabled runs.]\n\n`
      : "";
    return `## ${title}\n${exclusionNotice}${formatContextEntries(included.map(format).filter(Boolean), budget)}`;
  }

  const trustedReviewComments =
    inline.status === "fulfilled"
      ? inline.value.filter((comment) => trustedUsers.has(comment.user.toLowerCase()))
      : [];

  return {
    reviewComments: trustedReviewComments,
    text: [
      `## Pull Request Reference Context\nSource: ${owner}/${repo}#${pullNumber}. Entries are chronological within each section.`,
      section(
        "Branch Commits in This PR (GitHub returns up to 250 commits)",
        commits,
        (commit) =>
          `${commit.sha} — ${commit.author} (${commit.date || "date unknown"})\n${commit.message}`,
        12_000,
        false
      ),
      section(
        "PR Discussion",
        discussion,
        (comment) =>
          `Comment #${comment.id} — @${comment.user} (${comment.createdAt})\n${comment.body}`
      ),
      section("PR Reviews", reviews, (review) => {
        const body = review.body.trim();
        return `Review #${review.id} — @${review.user}, ${review.state}, commit ${review.commitId || "unknown"} (${review.submittedAt || "not submitted"})${body ? `\n${body}` : ""}`;
      }),
      section(
        "Inline Review Comments",
        inline,
        (comment) =>
          `Comment #${comment.id} — @${comment.user}, ${comment.path}:${comment.line ?? "unknown"}${comment.inReplyToId ? `, reply to #${comment.inReplyToId}` : ""} (${comment.createdAt})\n${comment.body}`
      ),
    ].join("\n\n"),
  };
}
