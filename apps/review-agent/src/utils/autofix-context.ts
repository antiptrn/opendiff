import type { GitHubClient } from "../github/client";

type ReviewComments = Awaited<ReturnType<GitHubClient["getReviewComments"]>>;

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
  pullNumber: number
): Promise<{ text: string; reviewComments: ReviewComments }> {
  // A failure in one optional source must not discard the others or prevent fixes.
  const [commits, discussion, reviews, inline] = await Promise.allSettled([
    github.getPullRequestCommits(owner, repo, pullNumber),
    github.getIssueComments(owner, repo, pullNumber),
    github.getPullRequestReviews(owner, repo, pullNumber),
    github.getReviewComments(owner, repo, pullNumber),
  ]);

  function section<T>(
    title: string,
    result: PromiseSettledResult<T[]>,
    format: (entry: T) => string,
    budget = 8_000
  ): string {
    if (result.status === "rejected") {
      console.warn(`Failed to load autofix context: ${title}`, result.reason);
      return `## ${title}\nContext unavailable (fetch failed).`;
    }
    return `## ${title}\n${formatContextEntries(result.value.map(format).filter(Boolean), budget)}`;
  }

  return {
    reviewComments: inline.status === "fulfilled" ? inline.value : [],
    text: [
      `## Pull Request Reference Context\nSource: ${owner}/${repo}#${pullNumber}. Entries are chronological within each section.`,
      section(
        "Branch Commits in This PR (GitHub returns up to 250 commits)",
        commits,
        (commit) =>
          `${commit.sha} — ${commit.author} (${commit.date || "date unknown"})\n${commit.message}`,
        12_000
      ),
      section(
        "PR Discussion",
        discussion,
        (comment) =>
          `Comment #${comment.id} — @${comment.user} (${comment.createdAt})\n${comment.body}`
      ),
      section("PR Reviews", reviews, (review) =>
        review.body.trim()
          ? `Review #${review.id} — @${review.user}, ${review.state}, commit ${review.commitId || "unknown"} (${review.submittedAt || "not submitted"})\n${review.body}`
          : ""
      ),
      section(
        "Inline Review Comments",
        inline,
        (comment) =>
          `Comment #${comment.id} — @${comment.user}, ${comment.path}:${comment.line ?? "unknown"}${comment.inReplyToId ? `, reply to #${comment.inReplyToId}` : ""} (${comment.createdAt})\n${comment.body}`
      ),
    ].join("\n\n"),
  };
}
