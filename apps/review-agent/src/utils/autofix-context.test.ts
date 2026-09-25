import { describe, expect, it, vi } from "vitest";
import type { GitHubClient } from "../github/client";
import { formatContextEntries, loadAutofixContext } from "./autofix-context";

describe("autofix context", () => {
  it("bounds long histories and retains recent entries in chronological order", () => {
    const result = formatContextEntries(
      Array.from({ length: 100 }, (_, i) => `${i}: ${"x".repeat(3_000)}`)
    );
    expect(result.length).toBeLessThanOrEqual(8_000);
    expect(result).toContain("older entries omitted");
    expect(result).toContain("[truncated]");
    expect(result).toContain("99: ");
    expect(result.indexOf("98: ")).toBeLessThan(result.indexOf("99: "));
    expect(result).not.toContain("0: ");
  });

  it("distinguishes empty history from unavailable context and preserves successful sources", async () => {
    const github = {
      getPullRequestCommits: vi.fn().mockResolvedValue([]),
      getIssueComments: vi.fn().mockRejectedValue(new Error("Unavailable")),
      getPullRequestReviews: vi.fn().mockResolvedValue([]),
      getReviewComments: vi.fn().mockResolvedValue([
        {
          id: 7,
          user: "reviewer",
          path: "src/a.ts",
          line: 12,
          inReplyToId: 6,
          createdAt: "2026-09-25",
          body: "Preserve behavior",
        },
      ]),
    };
    const result = await loadAutofixContext(github as unknown as GitHubClient, "owner", "repo", 42);
    expect(result.text).toContain("No entries returned.");
    expect(result.text).toContain("PR Discussion\nContext unavailable (fetch failed).");
    expect(result.text).toContain("src/a.ts:12, reply to #6");
    expect(result.text).toContain("Preserve behavior");
    expect(result.reviewComments).toHaveLength(1);
  });
});
