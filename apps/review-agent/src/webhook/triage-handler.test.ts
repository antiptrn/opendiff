import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TriageAgent } from "../agent/triage";
import type { GitHubClient } from "../github/client";
import { handleTriageAfterReview } from "./triage-handler";

describe("handleTriageAfterReview", () => {
  let mockGitHubClient: Partial<GitHubClient>;
  let mockTriageAgent: Partial<TriageAgent>;

  beforeEach(() => {
    mockGitHubClient = {
      getIssueComments: vi.fn().mockResolvedValue([]),
      createIssueComment: vi.fn().mockResolvedValue({ id: 9001 }),
      updateIssueComment: vi.fn().mockResolvedValue({ id: 9001 }),
    };

    mockTriageAgent = {};
  });

  it("should upsert a remediation summary on a clean autofix push", async () => {
    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [],
      "owner",
      "repo",
      "opendiff-bot",
      true
    );

    expect(result.success).toBe(true);
    expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.stringContaining("## Remediation Summary")
    );
    expect(mockGitHubClient.createIssueComment).toHaveBeenCalledWith(
      "owner",
      "repo",
      42,
      expect.stringContaining("No remediation actions were needed for this push")
    );
  });

  it("should not post a remediation summary on a clean pass when autofix is off", async () => {
    const result = await handleTriageAfterReview(
      mockGitHubClient as GitHubClient,
      mockTriageAgent as TriageAgent,
      {
        number: 42,
        head: { sha: "abc123", ref: "feature-branch" },
      },
      [],
      "owner",
      "repo",
      "opendiff-bot",
      false
    );

    expect(result.success).toBe(true);
    expect(mockGitHubClient.createIssueComment).not.toHaveBeenCalled();
    expect(mockGitHubClient.updateIssueComment).not.toHaveBeenCalled();
  });
});
