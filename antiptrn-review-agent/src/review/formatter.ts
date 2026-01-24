import type { CodeIssue, ReviewResult } from "../agent/types";
import type { Review, ReviewComment } from "../github/types";

const SEVERITY_EMOJI = {
  critical: "🚨",
  warning: "⚠️",
  suggestion: "💡",
} as const;

const TYPE_LABELS = {
  "anti-pattern": "🔄 Anti-pattern",
  security: "🔒 Security",
  performance: "⚡ Performance",
  style: "✨ Style",
  "bug-risk": "🐛 Bug Risk",
} as const;

// Parse a unified diff patch to extract valid line numbers for comments
// Returns a Set of line numbers (in the new file) that are within the diff
function parseValidLinesFromPatch(patch: string): Set<number> {
  const validLines = new Set<number>();
  const lines = patch.split("\n");
  let currentNewLine = 0;

  for (const line of lines) {
    // Parse hunk header: @@ -old_start,old_count +new_start,new_count @@
    const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentNewLine = Number.parseInt(hunkMatch[1], 10);
      continue;
    }

    // Skip diff header lines
    if (
      line.startsWith("diff ") ||
      line.startsWith("index ") ||
      line.startsWith("---") ||
      line.startsWith("+++")
    ) {
      continue;
    }

    // Context line (unchanged) - valid for comments
    if (line.startsWith(" ")) {
      validLines.add(currentNewLine);
      currentNewLine++;
      continue;
    }

    // Added line - valid for comments
    if (line.startsWith("+")) {
      validLines.add(currentNewLine);
      currentNewLine++;
      continue;
    }

    // Deleted line - skip (doesn't exist in new file)
    if (line.startsWith("-")) {
      continue;
    }

    // Any other line (empty, etc.) - advance counter if we're in a hunk
    if (currentNewLine > 0 && line !== "") {
      currentNewLine++;
    }
  }

  return validLines;
}

export interface DiffPatches {
  [filename: string]: string;
}

export class ReviewFormatter {
  formatReview(result: ReviewResult, patches?: DiffPatches): Review {
    const event = this.mapVerdict(result.verdict);

    // Filter issues to only include those with valid line numbers in the diff
    const validIssues = patches
      ? result.issues.filter((issue) => {
          const patch = patches[issue.file];
          if (!patch) {
            // No patch means file wasn't in the diff - skip inline comment
            return false;
          }
          const validLines = parseValidLinesFromPatch(patch);
          return validLines.has(issue.line);
        })
      : result.issues;

    const body = this.formatSummary(
      result,
      validIssues.length < result.issues.length ? result.issues.length - validIssues.length : 0
    );

    // Only include comments if there are valid issues
    const comments =
      validIssues.length > 0 ? validIssues.map((issue) => this.formatComment(issue)) : undefined;

    return {
      body,
      event,
      comments,
    };
  }

  formatComment(issue: CodeIssue): ReviewComment {
    const emoji = SEVERITY_EMOJI[issue.severity];
    const typeLabel = TYPE_LABELS[issue.type];

    let body = `${emoji} **${typeLabel}**\n\n`;
    body += issue.message;

    if (issue.suggestion) {
      body += `\n\n**Suggestion:** ${issue.suggestion}`;
    }

    return {
      path: issue.file,
      line: issue.line,
      body,
    };
  }

  private mapVerdict(verdict: ReviewResult["verdict"]): Review["event"] {
    switch (verdict) {
      case "approve":
        return "APPROVE";
      case "request_changes":
        return "REQUEST_CHANGES";
      default:
        return "COMMENT";
    }
  }

  private formatSummary(result: ReviewResult, filteredCount = 0): string {
    const counts = this.countBySeverity(result.issues);
    let summary = "## AI Code Review\n\n";
    summary += `${result.summary}\n\n`;

    if (result.issues.length > 0) {
      summary += "### Issues Found\n\n";

      if (counts.critical > 0) {
        summary += `- 🚨 **${counts.critical} critical** issue${counts.critical > 1 ? "s" : ""}\n`;
      }
      if (counts.warning > 0) {
        summary += `- ⚠️ **${counts.warning} warning${counts.warning > 1 ? "s" : ""}**\n`;
      }
      if (counts.suggestion > 0) {
        summary += `- 💡 **${counts.suggestion} suggestion${counts.suggestion > 1 ? "s" : ""}**\n`;
      }

      if (filteredCount > 0) {
        summary += `\n*Note: ${filteredCount} issue${filteredCount > 1 ? "s" : ""} could not be shown as inline comment${filteredCount > 1 ? "s" : ""} (referenced lines not in diff).*\n`;
      }
    }

    summary +=
      "\n---\n*Reviewed by [antiptrn-review-agent](https://github.com/JuliusWallblom/antiptrn-review-agent)*";

    return summary;
  }

  private countBySeverity(issues: CodeIssue[]): Record<CodeIssue["severity"], number> {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.severity]++;
        return acc;
      },
      { critical: 0, warning: 0, suggestion: 0 }
    );
  }
}
