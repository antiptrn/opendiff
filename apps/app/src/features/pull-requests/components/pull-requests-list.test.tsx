import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PullRequestSummary } from "../hooks/use-pull-requests";
import { PullRequestsList } from "./pull-requests-list";

function createPullRequest(overrides: Partial<PullRequestSummary> = {}): PullRequestSummary {
  return {
    id: "review-1",
    owner: "owner",
    repo: "repo",
    pullNumber: 124,
    pullTitle: "Improve PR title display",
    pullUrl: null,
    pullAuthor: "octocat",
    reviewType: "initial",
    commentCount: 0,
    fixCount: 0,
    acceptedCount: 0,
    rejectedCount: 0,
    pendingCount: 0,
    createdAt: "2026-06-24T12:00:00.000Z",
    ...overrides,
  };
}

describe("PullRequestsList", () => {
  it("renders the pull request number with the actual title", () => {
    render(
      <PullRequestsList
        pullRequests={[createPullRequest()]}
        page={1}
        onPageChange={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByText("#124 Improve PR title display")).toBeInTheDocument();
  });

  it("does not duplicate the fallback title", () => {
    render(
      <PullRequestsList
        pullRequests={[createPullRequest({ pullTitle: "PR #124" })]}
        page={1}
        onPageChange={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByText("PR #124")).toBeInTheDocument();
    expect(screen.queryByText("#124 PR #124")).not.toBeInTheDocument();
  });
});
