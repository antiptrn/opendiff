import { describe, expect, it } from "vitest";
import type { CodeIssue, ReviewResult } from "../agent/types";
import { ReviewFormatter } from "./formatter";

describe("ReviewFormatter", () => {
  const formatter = new ReviewFormatter();

  describe("formatReview", () => {
    it("should convert request-changes verdicts into conversational comment reviews", () => {
      const reviewResult: ReviewResult = {
        summary: "Found some issues that need attention.",
        issues: [
          {
            type: "security",
            severity: "critical",
            file: "src/auth.ts",
            line: 10,
            message: "SQL injection vulnerability",
            suggestion: "Use parameterized queries",
          },
        ],
        verdict: "request_changes",
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.event).toBe("COMMENT");
      expect(review.body).toContain("## Status Update");
      expect(review.body).not.toContain("Found some issues that need attention.");
      expect(review.comments).toHaveLength(1);
      expect(review.comments?.[0].path).toBe("src/auth.ts");
      expect(review.comments?.[0].line).toBe(10);
    });

    it("should format the review body as a current issues breakdown", () => {
      const reviewResult: ReviewResult = {
        summary: "Found some issues that need attention.",
        issues: [
          {
            type: "security",
            severity: "critical",
            file: "src/auth.ts",
            line: 10,
            message: "SQL injection vulnerability",
          },
        ],
        verdict: "comment",
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.body).toContain("## Status Update");
      expect(review.body).toContain("### Overview");
      expect(review.body).toContain("src/auth.ts:10");
      expect(review.body).not.toContain("Found some issues that need attention.");
      expect(review.body).not.toContain("*Reviewed by [opendiff]");
    });

    it("should format approval correctly", () => {
      const reviewResult: ReviewResult = {
        summary: "Code looks great!",
        issues: [],
        verdict: "approve",
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.event).toBe("APPROVE");
      expect(review.body).toBe("## Status Update\n\nNo open issues in the current review.");
      expect(review.comments).toBeUndefined();
    });

    it("should format comment-only review", () => {
      const reviewResult: ReviewResult = {
        summary: "A few suggestions for improvement.",
        issues: [
          {
            type: "style",
            severity: "suggestion",
            file: "src/utils.ts",
            line: 5,
            message: "Consider using const",
          },
        ],
        verdict: "comment",
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.event).toBe("COMMENT");
    });

    it("should include severity emoji in comments", () => {
      const reviewResult: ReviewResult = {
        summary: "Issues found.",
        issues: [
          {
            type: "security",
            severity: "critical",
            file: "a.ts",
            line: 1,
            message: "Critical issue",
          },
          {
            type: "style",
            severity: "warning",
            file: "b.ts",
            line: 2,
            message: "Warning issue",
          },
          {
            type: "style",
            severity: "suggestion",
            file: "c.ts",
            line: 3,
            message: "Suggestion",
          },
        ],
        verdict: "request_changes",
      };

      const review = formatter.formatReview(reviewResult);
      const comments = review.comments ?? [];

      expect(comments[0].body).toMatch(/🚨|⛔|❌/); // Critical emoji
      expect(comments[1].body).toMatch(/⚠️|🔶/); // Warning emoji
      expect(comments[2].body).toMatch(/💡|ℹ️/); // Suggestion emoji
    });

    it("should include suggestion in code block when provided", () => {
      const reviewResult: ReviewResult = {
        summary: "Issue found.",
        issues: [
          {
            type: "bug-risk",
            severity: "warning",
            file: "src/calc.ts",
            line: 15,
            message: "Off-by-one error",
            suggestion: "Use `i <= length` instead of `i < length`",
          },
        ],
        verdict: "comment",
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.comments?.[0].body).toContain("**Suggestion:**");
      expect(review.comments?.[0].body).toContain("i <= length");
    });

    it("should add issue type badge", () => {
      const reviewResult: ReviewResult = {
        summary: "Multiple issue types.",
        issues: [
          {
            type: "security",
            severity: "critical",
            file: "a.ts",
            line: 1,
            message: "Security issue",
          },
          {
            type: "performance",
            severity: "warning",
            file: "b.ts",
            line: 2,
            message: "Performance issue",
          },
        ],
        verdict: "request_changes",
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.comments?.[0].body.toLowerCase()).toContain("security");
      expect(review.comments?.[1].body.toLowerCase()).toContain("performance");
    });

    it("should format summary with issue counts", () => {
      const reviewResult: ReviewResult = {
        summary: "Multiple issues found.",
        issues: [
          { type: "security", severity: "critical", file: "a.ts", line: 1, message: "x" },
          { type: "security", severity: "critical", file: "b.ts", line: 2, message: "y" },
          { type: "style", severity: "warning", file: "c.ts", line: 3, message: "z" },
        ],
        verdict: "request_changes",
      };

      const review = formatter.formatReview(reviewResult);

      // Should include count summary
      expect(review.body).toMatch(/2.*critical/i);
      expect(review.body).toMatch(/1.*warning/i);
    });
  });

  describe("formatSummaryBody", () => {
    it("should keep the full PR summary format for the durable summary comment", () => {
      const reviewResult: ReviewResult = {
        summary: "Overall PR summary.",
        issues: [
          {
            type: "security",
            severity: "critical",
            file: "a.ts",
            line: 1,
            message: "x",
            description: "The `login()` path accepts unsafe input.",
            suggestion: "Validate the input before querying.",
          },
        ],
        verdict: "comment",
      };

      const body = formatter.formatSummaryBody(reviewResult);

      expect(body).toContain("## OpenDiff Summary");
      expect(body).toContain("Overall PR summary.");
      expect(body).not.toContain("### What This PR Changes");
      expect(body).not.toContain("### Merge Safety");
      expect(body).not.toContain("Proof:");
      expect(body).not.toContain("- Evidence:");
      expect(body).toContain("Not safe to merge yet.");
      expect(body).toContain(
        "OpenDiff returned a `comment` verdict and the durable summary still tracks 1 critical issue."
      );
      expect(body).toContain("`a.ts:1` is flagged as 🔒 Security for 'x'");
      expect(body).toContain("### Findings");
      expect(body).not.toContain("### Review Judgement");
      expect(body).toContain("OpenDiff completed the review");
      expect(body).not.toContain("### Open Issue Summary");
      expect(body).toContain("### Open Issues");
      expect(body).toContain("| Finding | Code | Issue | Suggestion |");
      expect(body).toContain(
        "| 🔒 Security | `a.ts:1` | x The `login()` path accepts unsafe input. | Validate the input before querying. |"
      );
      expect(body).not.toContain("#### 🔒 Security in `a.ts:1`");
      expect(body).not.toContain("**Code reference:**");
      expect(body).toContain("**Rating:**");
      expect(body).toContain("**Confidence:**");
      expect(body).toContain("*Reviewed by [opendiff]");
    });

    it("should use non-historical headings on the first review", () => {
      const reviewResult: ReviewResult = {
        summary: "Initial review summary.",
        issues: [{ type: "style", severity: "warning", file: "src/a.ts", line: 4, message: "x" }],
        verdict: "comment",
      };

      const body = formatter.formatHistoricalSummaryBody(reviewResult, [], {
        newIssues: [
          {
            fingerprint: "abc",
            type: "style",
            severity: "warning",
            file: "src/a.ts",
            line: 4,
            message: "x",
          },
        ],
        unresolvedHistoricalIssues: [],
        addressedIssues: [],
      });

      expect(body).toContain("## OpenDiff Summary");
      expect(body).not.toContain("### What This PR Changes");
      expect(body).not.toContain("### Merge Safety");
      expect(body).not.toContain("Proof:");
      expect(body).toContain("Merge with caution.");
      expect(body).toContain(
        "OpenDiff returned a `comment` verdict and the durable summary still tracks 1 warning."
      );
      expect(body).toContain("`src/a.ts:4` is flagged as ✨ Style for 'x'");
      expect(body).toContain("### Findings");
      expect(body).not.toContain("### Review Judgement");
      expect(body).not.toContain("### Open Issue Summary");
      expect(body).not.toContain("### Open Issues Across Reviews");
      expect(body).toContain("### Open Issues");
      expect(body).toContain("| ✨ Style | `src/a.ts:4` | x |  |");
      expect(body).not.toContain("#### ✨ Style in `src/a.ts:4`");
      expect(body).not.toContain("**Code reference:**");
      expect(body).not.toContain("### New Issues");
      expect(body).toContain("**Rating:**");
      expect(body).toContain("**Confidence:**");
    });

    it("should include findings for clean PR summaries", () => {
      const reviewResult: ReviewResult = {
        summary: "This PR updates the login flow and keeps existing session behavior intact.",
        issues: [],
        verdict: "approve",
      };

      const body = formatter.formatSummaryBody(reviewResult);

      expect(body).toContain("## OpenDiff Summary");
      expect(body).not.toContain("### What This PR Changes");
      expect(body).toContain(
        "Safe to merge based on this review because OpenDiff returned an `approve` verdict and found no open issues"
      );
      expect(body).toContain("zero critical, warning, or suggestion findings");
      expect(body).not.toContain("### Merge Safety");
      expect(body).not.toContain("Proof:");
      expect(body).not.toContain("- Verdict:");
      expect(body).toContain("### Findings");
      expect(body).not.toContain("### Review Judgement");
      expect(body).toContain("OpenDiff found no issues that require changes");
      expect(body).not.toContain("### Open Issue Summary");
    });

    it("should use historical headings on re-review", () => {
      const reviewResult: ReviewResult = {
        summary: "Rereview summary.",
        issues: [{ type: "style", severity: "warning", file: "src/b.ts", line: 8, message: "y" }],
        verdict: "comment",
      };

      const body = formatter.formatHistoricalSummaryBody(reviewResult, [], {
        unresolvedHistoricalIssues: [
          {
            fingerprint: "old",
            type: "bug-risk",
            severity: "warning",
            file: "src/old.ts",
            line: 2,
            message: "old issue",
          },
        ],
        newIssues: [
          {
            fingerprint: "new",
            type: "style",
            severity: "warning",
            file: "src/b.ts",
            line: 8,
            message: "y",
          },
        ],
        addressedIssues: [],
      });

      expect(body).not.toContain("### Open Issues Across Reviews");
      expect(body).not.toContain("### Merge Safety");
      expect(body).not.toContain("Proof:");
      expect(body).toContain("Merge with caution.");
      expect(body).toContain(
        "OpenDiff returned a `comment` verdict and the durable summary still tracks 2 warnings."
      );
      expect(body).toContain("`src/b.ts:8` is flagged as ✨ Style for 'y'");
      expect(body).toContain("`src/old.ts:2` is flagged as 🐛 Bug Risk for 'old issue'");
      expect(body).toContain("### Still Open From Earlier Reviews");
      expect(body).toContain("### New Issues");
      expect(body).toContain("| 🐛 Bug Risk | `src/old.ts:2` | old issue |  |");
      expect(body).toContain("| ✨ Style | `src/b.ts:8` | y |  |");
      expect(body).not.toContain("#### 🐛 Bug Risk in `src/old.ts:2`");
      expect(body).not.toContain("**Code reference:**");
      expect(body).toContain("**Rating:**");
      expect(body).toContain("**Confidence:**");
      expect(body).toContain("<!-- opendiff-issue:");
    });

    it("should preserve hidden issue markers for addressed findings in the living summary", () => {
      const reviewResult: ReviewResult = {
        summary: "Everything from earlier passes is now fixed.",
        issues: [],
        verdict: "approve",
      };

      const body = formatter.formatHistoricalSummaryBody(reviewResult, [], {
        unresolvedHistoricalIssues: [],
        newIssues: [],
        addressedIssues: [
          {
            fingerprint: "done",
            type: "bug-risk",
            severity: "warning",
            file: "src/c.ts",
            line: 12,
            message: "already fixed",
          },
        ],
      });

      expect(body).toContain("### Addressed Since Earlier Reviews");
      expect(body).toContain("- ~~`src/c.ts:12` already fixed~~");
      expect(body).toContain("<!-- opendiff-issue:");
    });

    it("should render summary changes as an overview plus bullets when possible", () => {
      const reviewResult: ReviewResult = {
        summary:
          "This PR wires the billing dialog into the settings flow. It adds the `BillingDialog` component. It updates `settings-page.tsx` to open the dialog from the plan card.",
        issues: [],
        verdict: "approve",
      };

      const body = formatter.formatSummaryBody(reviewResult);

      expect(body).toContain("This PR wires the billing dialog into the settings flow.");
      expect(body).toContain("- It adds the `BillingDialog` component.");
      expect(body).toContain(
        "- It updates `settings-page.tsx` to open the dialog from the plan card."
      );
    });
  });

  describe("formatComment", () => {
    it("should format a single issue as a comment", () => {
      const issue: CodeIssue = {
        type: "anti-pattern",
        severity: "warning",
        file: "src/service.ts",
        line: 42,
        message: "God object detected - class has too many responsibilities",
        suggestion: "Split into smaller, focused classes",
      };

      const comment = formatter.formatComment(issue);

      expect(comment.path).toBe("src/service.ts");
      expect(comment.line).toBe(42);
      expect(comment.body).toContain("God object");
      expect(comment.body).toContain("Split into smaller");
    });

    it("should format suggestedCode as GitHub suggestion block", () => {
      const issue: CodeIssue = {
        type: "bug-risk",
        severity: "warning",
        file: "src/utils.ts",
        line: 10,
        message: "Variable should be const since it is never reassigned",
        suggestedCode: "const value = 42;",
      };

      const comment = formatter.formatComment(issue);

      expect(comment.body).toContain("```suggestion");
      expect(comment.body).toContain("const value = 42;");
      expect(comment.body).toContain("```");
      // Should NOT contain text suggestion format
      expect(comment.body).not.toContain("**Suggestion:**");
    });

    it("should prefer suggestedCode over suggestion text", () => {
      const issue: CodeIssue = {
        type: "style",
        severity: "suggestion",
        file: "src/app.ts",
        line: 5,
        message: "Use const instead of let",
        suggestion: "Change let to const",
        suggestedCode: "const x = 1;",
      };

      const comment = formatter.formatComment(issue);

      expect(comment.body).toContain("```suggestion");
      expect(comment.body).toContain("const x = 1;");
      // Text suggestion should not appear when suggestedCode is present
      expect(comment.body).not.toContain("**Suggestion:**");
    });

    it("should handle multi-line suggestions with endLine", () => {
      const issue: CodeIssue = {
        type: "anti-pattern",
        severity: "warning",
        file: "src/handler.ts",
        line: 20,
        endLine: 25,
        message: "This function can be simplified",
        suggestedCode: "function simplified() {\n  return true;\n}",
      };

      const comment = formatter.formatComment(issue);

      expect(comment.start_line).toBe(20);
      expect(comment.line).toBe(25);
      expect(comment.body).toContain("```suggestion");
      expect(comment.body).toContain("function simplified()");
    });

    it("should handle empty suggestedCode (delete line)", () => {
      const issue: CodeIssue = {
        type: "style",
        severity: "suggestion",
        file: "src/app.ts",
        line: 10,
        message: "This line is unnecessary and can be removed",
        suggestedCode: "",
      };

      const comment = formatter.formatComment(issue);

      expect(comment.body).toContain("```suggestion");
      // Empty suggestion = delete the line
      expect(comment.body).toMatch(/```suggestion\n\n```/);
    });
  });
});
