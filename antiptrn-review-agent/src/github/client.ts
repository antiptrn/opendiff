import type { Octokit } from "@octokit/rest";
import type { PullRequest, PullRequestFile, Review } from "./types";

export class GitHubClient {
  constructor(private octokit: Octokit) {}

  async getPullRequest(owner: string, repo: string, pullNumber: number): Promise<PullRequest> {
    const { data } = await this.octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });

    return data as PullRequest;
  }

  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<PullRequestFile[]> {
    const files: PullRequestFile[] = [];
    let page = 1;

    while (true) {
      const { data } = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
        per_page: 100,
        page,
      });

      files.push(...(data as PullRequestFile[]));

      // If we got fewer than 100 files, we've reached the last page
      if (data.length < 100) {
        break;
      }
      page++;
    }

    return files;
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<string | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      // Check if it's a file (not a directory)
      if (Array.isArray(data) || data.type !== "file") {
        return null;
      }

      // Decode base64 content
      if (data.encoding === "base64" && data.content) {
        return Buffer.from(data.content, "base64").toString("utf-8");
      }

      return null;
    } catch (error: unknown) {
      // Return null for 404 (file not found)
      if (error && typeof error === "object" && "status" in error && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async submitReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    review: Review
  ): Promise<{ id: number }> {
    const { data } = await this.octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: pullNumber,
      commit_id: commitId,
      body: review.body,
      event: review.event,
      comments: review.comments?.map((c) => ({
        ...c,
        side: "RIGHT" as const, // Always comment on the new version of the file
      })),
    });

    return { id: data.id };
  }

  async replyToReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    commentId: number,
    body: string
  ): Promise<{ id: number }> {
    const { data } = await this.octokit.rest.pulls.createReplyForReviewComment({
      owner,
      repo,
      pull_number: pullNumber,
      comment_id: commentId,
      body,
    });

    return { id: data.id };
  }

  async getReviewCommentThread(
    owner: string,
    repo: string,
    pullNumber: number,
    commentId: number
  ): Promise<{ comments: Array<{ user: string; body: string; id: number }> }> {
    const { data: allComments } = await this.octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    const targetComment = allComments.find((c) => c.id === commentId);
    if (!targetComment) {
      return { comments: [] };
    }

    const rootId = targetComment.in_reply_to_id || targetComment.id;

    const threadComments = allComments
      .filter((c) => c.id === rootId || c.in_reply_to_id === rootId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((c) => ({
        user: c.user?.login || "unknown",
        body: c.body,
        id: c.id,
      }));

    return { comments: threadComments };
  }

  async createIssueComment(
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ): Promise<{ id: number }> {
    const { data } = await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    return { id: data.id };
  }

  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<Array<{ user: string; body: string; id: number }>> {
    const { data } = await this.octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    return data.map((c) => ({
      user: c.user?.login || "unknown",
      body: c.body || "",
      id: c.id,
    }));
  }
}
