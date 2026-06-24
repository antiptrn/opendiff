import type { InstallationAccessTokenAuthentication } from "@octokit/auth-app";
import type { Octokit } from "@octokit/rest";
import type { PullRequest, PullRequestFile, Review } from "./types";

interface FileWithSha {
  content: string;
  sha: string;
}

export interface CheckRunAnnotation {
  path: string;
  startLine: number;
  endLine: number;
  annotationLevel: string;
  message: string;
  title: string | null;
  rawDetails: string | null;
}

type PendingReviewComment = NonNullable<Review["comments"]>[number];

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

  async getPullRequestsForCommit(owner: string, repo: string, sha: string): Promise<PullRequest[]> {
    const { data } = await this.octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: sha,
    });

    return data.map((pull) => ({
      number: pull.number,
      title: pull.title,
      body: pull.body,
      draft: pull.draft,
      state: pull.state,
      head: {
        sha: pull.head.sha,
        ref: pull.head.ref,
      },
      base: {
        sha: pull.base.sha,
        ref: pull.base.ref,
      },
      user: {
        login: pull.user?.login || "unknown",
      },
    }));
  }

  async getCheckRunAnnotations(
    owner: string,
    repo: string,
    checkRunId: number
  ): Promise<CheckRunAnnotation[]> {
    const annotations: CheckRunAnnotation[] = [];
    let page = 1;

    while (annotations.length < 50) {
      const { data } = await this.octokit.rest.checks.listAnnotations({
        owner,
        repo,
        check_run_id: checkRunId,
        per_page: 100,
        page,
      });

      annotations.push(
        ...data.slice(0, Math.max(0, 50 - annotations.length)).map((annotation) => ({
          path: annotation.path,
          startLine: annotation.start_line,
          endLine: annotation.end_line,
          annotationLevel: annotation.annotation_level ?? "notice",
          message: annotation.message ?? "",
          title: annotation.title ?? null,
          rawDetails: annotation.raw_details ?? null,
        }))
      );

      if (data.length < 100) {
        break;
      }
      page++;
    }

    return annotations;
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

  async validateReviewComments(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    comments: PendingReviewComment[]
  ): Promise<{ validComments: PendingReviewComment[]; invalidComments: PendingReviewComment[] }> {
    if (comments.length === 0) {
      return { validComments: [], invalidComments: [] };
    }

    const allValid = await this.tryCreatePendingReview(owner, repo, pullNumber, commitId, comments);
    if (allValid) {
      return { validComments: comments, invalidComments: [] };
    }

    const { validComments, invalidComments } = await this.partitionValidReviewComments(
      owner,
      repo,
      pullNumber,
      commitId,
      comments,
      true
    );

    return { validComments, invalidComments };
  }

  private async partitionValidReviewComments(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    comments: PendingReviewComment[],
    skipWholeSetValidation = false
  ): Promise<{ validComments: PendingReviewComment[]; invalidComments: PendingReviewComment[] }> {
    if (comments.length === 0) {
      return { validComments: [], invalidComments: [] };
    }

    if (!skipWholeSetValidation) {
      const valid = await this.tryCreatePendingReview(owner, repo, pullNumber, commitId, comments);
      if (valid) {
        return { validComments: comments, invalidComments: [] };
      }
    }

    if (comments.length === 1) {
      return { validComments: [], invalidComments: comments };
    }

    const midpoint = Math.floor(comments.length / 2);
    const left = await this.partitionValidReviewComments(
      owner,
      repo,
      pullNumber,
      commitId,
      comments.slice(0, midpoint)
    );
    const right = await this.partitionValidReviewComments(
      owner,
      repo,
      pullNumber,
      commitId,
      comments.slice(midpoint)
    );

    return {
      validComments: [...left.validComments, ...right.validComments],
      invalidComments: [...left.invalidComments, ...right.invalidComments],
    };
  }

  private async tryCreatePendingReview(
    owner: string,
    repo: string,
    pullNumber: number,
    commitId: string,
    comments: PendingReviewComment[]
  ): Promise<boolean> {
    let reviewId: number | null = null;

    try {
      const { data } = await this.octokit.rest.pulls.createReview({
        owner,
        repo,
        pull_number: pullNumber,
        commit_id: commitId,
        comments: comments.map((c) => ({
          ...c,
          side: "RIGHT" as const,
        })),
      });
      reviewId = data.id;
      return true;
    } catch (error: unknown) {
      if (this.isUnresolvableReviewLineError(error)) {
        return false;
      }
      throw error;
    } finally {
      if (reviewId) {
        try {
          await this.octokit.rest.pulls.deletePendingReview({
            owner,
            repo,
            pull_number: pullNumber,
            review_id: reviewId,
          });
        } catch (error) {
          console.warn(`Failed to delete pending review ${reviewId}:`, error);
        }
      }
    }
  }

  private isUnresolvableReviewLineError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
      return false;
    }

    if (!("status" in error) || error.status !== 422) {
      return false;
    }

    if (!("message" in error) || typeof error.message !== "string") {
      return false;
    }

    return error.message.includes("Line could not be resolved");
  }

  async replyToReviewComment(
    owner: string,
    repo: string,
    pullNumber: number,
    commentId: number,
    body: string
  ): Promise<{ id: number; nodeId: string }> {
    const { data } = await this.octokit.rest.pulls.createReplyForReviewComment({
      owner,
      repo,
      pull_number: pullNumber,
      comment_id: commentId,
      body,
    });

    return { id: data.id, nodeId: data.node_id };
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

  async updateIssueComment(
    owner: string,
    repo: string,
    commentId: number,
    body: string
  ): Promise<{ id: number }> {
    const { data } = await this.octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body,
    });

    return { id: data.id };
  }

  async createPullRequestEyesReaction(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<{ id: number }> {
    const { data } = await this.octokit.rest.reactions.createForIssue({
      owner,
      repo,
      issue_number: pullNumber,
      content: "eyes",
    });

    return { id: data.id };
  }

  async deletePullRequestEyesReaction(
    owner: string,
    repo: string,
    pullNumber: number,
    reactionId: number
  ): Promise<void> {
    await this.octokit.rest.reactions.deleteForIssue({
      owner,
      repo,
      issue_number: pullNumber,
      reaction_id: reactionId,
    });
  }

  async updatePullRequestReview(
    owner: string,
    repo: string,
    pullNumber: number,
    reviewId: number,
    body: string
  ): Promise<{ id: number }> {
    const { data } = await this.octokit.rest.pulls.updateReview({
      owner,
      repo,
      pull_number: pullNumber,
      review_id: reviewId,
      body,
    });

    return { id: data.id };
  }

  async getIssueComments(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<Array<{ user: string; body: string; id: number; createdAt: string }>> {
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
      createdAt: c.created_at,
    }));
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<
    Array<{
      id: number;
      user: string;
      body: string;
      state: string;
      submittedAt: string | null;
      commitId: string | null;
    }>
  > {
    const { data } = await this.octokit.rest.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    return data.map((review) => ({
      id: review.id,
      user: review.user?.login || "unknown",
      body: review.body || "",
      state: review.state || "",
      submittedAt: review.submitted_at || null,
      commitId: review.commit_id || null,
    }));
  }

  async getFileWithSha(
    owner: string,
    repo: string,
    path: string,
    ref: string
  ): Promise<FileWithSha | null> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if (Array.isArray(data) || data.type !== "file") {
        return null;
      }

      if (data.encoding === "base64" && data.content) {
        return {
          content: Buffer.from(data.content, "base64").toString("utf-8"),
          sha: data.sha,
        };
      }

      return null;
    } catch (error: unknown) {
      if (error && typeof error === "object" && "status" in error && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async createOrUpdateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string,
    fileSha?: string
  ): Promise<{ sha: string }> {
    const { data } = await this.octokit.rest.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message,
      content: Buffer.from(content).toString("base64"),
      branch,
      sha: fileSha,
    });

    return { sha: data.commit.sha ?? "" };
  }

  async getInstallationToken(): Promise<string | null> {
    try {
      // The octokit instance is authenticated with installation auth
      // We need to explicitly request an installation token
      const auth = (await this.octokit.auth({
        type: "installation",
      })) as InstallationAccessTokenAuthentication;
      return auth.token || null;
    } catch (error) {
      console.error("Failed to get installation token:", error);
      return null;
    }
  }

  async getReviewComments(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<
    Array<{
      id: number;
      nodeId: string;
      pullRequestReviewId: number | null;
      inReplyToId: number | null;
      path: string;
      line: number | null;
      body: string;
      user: string;
      createdAt: string;
    }>
  > {
    const { data } = await this.octokit.rest.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    });

    return data.map((c) => ({
      id: c.id,
      nodeId: c.node_id,
      pullRequestReviewId: c.pull_request_review_id ?? null,
      inReplyToId: c.in_reply_to_id ?? null,
      path: c.path,
      line: c.line ?? c.original_line ?? null,
      body: c.body,
      user: c.user?.login || "unknown",
      createdAt: c.created_at,
    }));
  }

  async deleteReviewComment(owner: string, repo: string, commentId: number): Promise<void> {
    await this.octokit.rest.pulls.deleteReviewComment({
      owner,
      repo,
      comment_id: commentId,
    });
  }

  async resolveReviewThread(threadId: string): Promise<void> {
    try {
      await this.octokit.graphql(
        `mutation($threadId: ID!) {
          resolveReviewThread(input: { threadId: $threadId }) {
            thread {
              isResolved
            }
          }
        }`,
        { threadId }
      );
    } catch (error) {
      console.warn("Failed to resolve review thread:", error);
    }
  }

  async getReviewThreadId(
    owner: string,
    repo: string,
    pullNumber: number,
    commentNodeId: string
  ): Promise<string | null> {
    try {
      const result = await this.octokit.graphql<{
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: Array<{
                id: string;
                comments: {
                  nodes: Array<{ id: string }>;
                };
              }>;
            };
          };
        };
      }>(
        `query($owner: String!, $repo: String!, $pullNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $pullNumber) {
              reviewThreads(first: 100) {
                nodes {
                  id
                  comments(first: 10) {
                    nodes {
                      id
                    }
                  }
                }
              }
            }
          }
        }`,
        { owner, repo, pullNumber }
      );

      // Find the thread that contains this comment
      const threads = result.repository.pullRequest.reviewThreads.nodes;
      for (const thread of threads) {
        if (thread.comments.nodes.some((c) => c.id === commentNodeId)) {
          return thread.id;
        }
      }
      return null;
    } catch (error) {
      console.warn("Failed to get review thread ID:", error);
      return null;
    }
  }

  async getCollaboratorPermission(
    owner: string,
    repo: string,
    username: string
  ): Promise<"admin" | "write" | "read" | "none" | "maintain" | "triage"> {
    try {
      const { data } = await this.octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
      });
      return data.permission as "admin" | "write" | "read" | "none" | "maintain" | "triage";
    } catch (error: unknown) {
      if (error && typeof error === "object" && "status" in error && error.status === 404) {
        return "none";
      }
      throw error;
    }
  }
}
