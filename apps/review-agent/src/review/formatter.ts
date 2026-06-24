import type { CodeIssue, ReviewResult } from "../agent/types";
import type { Review, ReviewComment } from "../github/types";
import { type StoredIssueRecord, buildIssueMarker } from "../utils/issue-markers";
import type { DiffPatches } from "./types";

export type { DiffPatches };

export interface PartitionedIssues {
  inlineIssues: CodeIssue[];
  bodyOnlyIssues: CodeIssue[];
}

export interface SummaryHistory {
  unresolvedHistoricalIssues?: StoredIssueRecord[];
  newIssues?: StoredIssueRecord[];
  addressedIssues?: StoredIssueRecord[];
}

type SummaryIssue = Pick<CodeIssue, "type" | "severity" | "file" | "line" | "message"> &
  Partial<Pick<CodeIssue, "description" | "suggestion" | "suggestedCode" | "endLine">> & {
    fingerprint?: string;
  };

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

export class ReviewFormatter {
  partitionIssues(issues: CodeIssue[], patches?: DiffPatches): PartitionedIssues {
    const inlineIssues: CodeIssue[] = [];
    const bodyOnlyIssues: CodeIssue[] = [];

    for (const issue of issues) {
      if (!patches) {
        // No patches provided, all issues go inline
        inlineIssues.push(issue);
        continue;
      }

      const patch = patches[issue.file];
      if (!patch) {
        // No patch means file wasn't in the diff
        bodyOnlyIssues.push(issue);
        continue;
      }

      const validLines = parseValidLinesFromPatch(patch);
      if (validLines.has(issue.line)) {
        inlineIssues.push(issue);
      } else {
        bodyOnlyIssues.push(issue);
      }
    }

    return { inlineIssues, bodyOnlyIssues };
  }

  formatSummaryBody(result: ReviewResult, bodyOnlyIssues: CodeIssue[] = []): string {
    return this.formatSummary(result, bodyOnlyIssues);
  }

  formatReviewBody(
    result: ReviewResult,
    inlineIssues: CodeIssue[] = [],
    bodyOnlyIssues: CodeIssue[] = []
  ): string {
    const counts = this.countBySeverity(result.issues);

    if (result.issues.length === 0) {
      return `## Status Update\n\n${result.summary}\n\nNo open issues in the current review.`;
    }

    let body = "## Status Update\n\n";
    body += `${result.summary}\n\n`;
    body += "### Overview\n\n";

    if (counts.critical > 0) {
      body += `- 🚨 ${counts.critical} critical\n`;
    }
    if (counts.warning > 0) {
      body += `- ⚠️ ${counts.warning} warning${counts.warning > 1 ? "s" : ""}\n`;
    }
    if (counts.suggestion > 0) {
      body += `- 💡 ${counts.suggestion} suggestion${counts.suggestion > 1 ? "s" : ""}\n`;
    }

    if (inlineIssues.length > 0) {
      body += "\n### Highlighted In This Review\n\n";
      for (const issue of inlineIssues.slice(0, 5)) {
        body += `- \`${issue.file}:${issue.line}\` ${issue.message}\n`;
      }
      if (inlineIssues.length > 5) {
        body += `- ...and ${inlineIssues.length - 5} more inline issue${inlineIssues.length - 5 > 1 ? "s" : ""}\n`;
      }
    }

    if (bodyOnlyIssues.length > 0) {
      body += "\n### Kept In Summary Only\n\n";
      for (const issue of bodyOnlyIssues.slice(0, 5)) {
        body += `- \`${issue.file}:${issue.line}\` ${issue.message}\n`;
      }
      if (bodyOnlyIssues.length > 5) {
        body += `- ...and ${bodyOnlyIssues.length - 5} more summary-only issue${bodyOnlyIssues.length - 5 > 1 ? "s" : ""}\n`;
      }
    }

    const issueMarkers = [...inlineIssues, ...bodyOnlyIssues].map((issue) =>
      buildIssueMarker(issue)
    );
    if (issueMarkers.length > 0) {
      body += `\n\n${issueMarkers.join("\n")}`;
    }

    return body.trim();
  }

  formatReview(result: ReviewResult, patches?: DiffPatches): Review {
    const event = this.mapVerdict(result.verdict);
    const { inlineIssues, bodyOnlyIssues } = this.partitionIssues(result.issues, patches);
    const body = this.formatReviewBody(result, inlineIssues, bodyOnlyIssues);

    // Only include comments if there are valid issues
    const comments =
      inlineIssues.length > 0 ? inlineIssues.map((issue) => this.formatComment(issue)) : undefined;

    return {
      body,
      event,
      comments,
    };
  }

  formatComment(issue: CodeIssue): ReviewComment {
    const emoji = SEVERITY_EMOJI[issue.severity];
    const typeLabel = TYPE_LABELS[issue.type];

    let body = `${emoji} **${typeLabel}**: ${issue.message}\n\n`;
    body += issue.description || issue.message;

    // If there's exact replacement code, format as GitHub suggested change
    if (issue.suggestedCode !== undefined) {
      body += "\n\n```suggestion\n";
      body += issue.suggestedCode;
      // Ensure the suggestion ends with a newline for proper formatting
      if (!issue.suggestedCode.endsWith("\n")) {
        body += "\n";
      }
      body += "```";
    } else if (issue.suggestion) {
      // Fall back to text suggestion if no code replacement
      body += `\n\n**Suggestion:** ${issue.suggestion}`;
    }

    body += `\n\n${buildIssueMarker(issue)}`;

    const comment: ReviewComment = {
      path: issue.file,
      line: issue.line,
      body,
    };

    // Support multi-line suggestions
    if (issue.endLine && issue.endLine > issue.line) {
      comment.start_line = issue.line;
      comment.line = issue.endLine;
    }

    return comment;
  }

  private mapVerdict(verdict: ReviewResult["verdict"]): Review["event"] {
    if (verdict === "approve") {
      return "APPROVE";
    }

    return "COMMENT";
  }

  formatHistoricalSummaryBody(
    result: ReviewResult,
    bodyOnlyIssues: CodeIssue[] = [],
    history?: SummaryHistory
  ): string {
    const hasHistoricalContext =
      (history?.unresolvedHistoricalIssues?.length ?? 0) > 0 ||
      (history?.addressedIssues?.length ?? 0) > 0;
    const newIssues: SummaryIssue[] = history?.newIssues ?? result.issues;
    const unresolvedHistoricalIssues: SummaryIssue[] = history?.unresolvedHistoricalIssues ?? [];
    const openIssues = [
      ...unresolvedHistoricalIssues,
      ...newIssues.filter(
        (issue) =>
          !unresolvedHistoricalIssues.some((existing) => existing.fingerprint === issue.fingerprint)
      ),
    ];
    const counts = this.countBySeverity(openIssues.length > 0 ? openIssues : result.issues);
    let summary = "## OpenDiff Summary\n\n";
    summary += this.formatChangeSummary(result.summary);
    summary += "### Findings\n\n";
    summary += `${this.formatFindings(result, counts)}\n\n`;

    if (history?.unresolvedHistoricalIssues && history.unresolvedHistoricalIssues.length > 0) {
      summary += "\n### Still Open From Earlier Reviews\n\n";
      for (const issue of history.unresolvedHistoricalIssues.slice(0, 10)) {
        summary += this.formatDetailedIssue(issue);
      }
      if (history.unresolvedHistoricalIssues.length > 10) {
        summary += `- ...and ${history.unresolvedHistoricalIssues.length - 10} more\n`;
      }
    }

    if (newIssues.length > 0) {
      summary += `\n### ${hasHistoricalContext ? "New Issues" : "Open Issues"}\n\n`;
      for (const issue of newIssues.slice(0, 10)) {
        summary += this.formatDetailedIssue(issue);
      }
      if (newIssues.length > 10) {
        summary += `- ...and ${newIssues.length - 10} more\n`;
      }
    }

    if (history?.addressedIssues && history.addressedIssues.length > 0) {
      summary += "\n### Addressed Since Earlier Reviews\n\n";
      for (const issue of history.addressedIssues.slice(0, 10)) {
        summary += `- ~~\`${this.formatIssueLocation(issue)}\` ${issue.message}~~\n`;
        summary += `${buildIssueMarker(issue)}\n`;
      }
      if (history.addressedIssues.length > 10) {
        summary += `- ...and ${history.addressedIssues.length - 10} more\n`;
      }
    }

    // Include full details for issues that couldn't be shown as inline comments
    if (bodyOnlyIssues.length > 0) {
      summary += "\n### Not in diff\n\n";
      summary += "The following issues were found in code outside the changed lines:\n\n";

      for (const issue of bodyOnlyIssues) {
        const emoji = SEVERITY_EMOJI[issue.severity];
        const typeLabel = TYPE_LABELS[issue.type];
        summary += `#### ${emoji} ${typeLabel} in \`${issue.file}:${issue.line}\`\n\n`;
        summary += `${issue.description || issue.message}\n\n`;
        if (issue.suggestion) {
          summary += `**Suggestion:** ${issue.suggestion}\n\n`;
        }
        summary += `${buildIssueMarker(issue)}\n\n`;
      }
    }

    const rating = this.calculateRatingScore(result, history);
    const confidence = this.calculateConfidenceScore(result, history);

    summary += "\n---\n";
    summary += `**Rating:** ${rating}/100\n`;
    summary += `**Confidence:** ${confidence}/100\n\n`;
    summary += "*Reviewed by [opendiff](https://opendiff.dev)*";

    return summary;
  }

  private formatFindings(
    result: ReviewResult,
    counts: Record<CodeIssue["severity"], number>
  ): string {
    const issueSummary = this.formatIssueCountSummary(counts);
    const issueTotal = counts.critical + counts.warning + counts.suggestion;

    if (issueSummary === "no open issues") {
      return "OpenDiff found no issues that require changes in this review.";
    }

    if (result.verdict === "approve") {
      return `OpenDiff's current pass is clean, but ${issueSummary} ${
        issueTotal === 1 ? "remains" : "remain"
      } tracked across reviews.`;
    }

    if (result.verdict === "request_changes") {
      return `OpenDiff is requesting changes because it found ${issueSummary}.`;
    }

    return `OpenDiff completed the review and found ${issueSummary} to consider before merging.`;
  }

  private formatIssueCountSummary(counts: Record<CodeIssue["severity"], number>): string {
    const parts = [
      this.formatIssueCount(counts.critical, "critical issue"),
      this.formatIssueCount(counts.warning, "warning"),
      this.formatIssueCount(counts.suggestion, "suggestion"),
    ].filter((part): part is string => Boolean(part));

    if (parts.length === 0) {
      return "no open issues";
    }

    if (parts.length === 1) {
      return parts[0];
    }

    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  }

  private formatIssueCount(count: number, label: string): string | null {
    if (count === 0) {
      return null;
    }

    return `${count} ${label}${count === 1 ? "" : "s"}`;
  }

  private formatChangeSummary(summary: string): string {
    const normalized = summary.trim();

    if (!normalized) {
      return "";
    }

    const lines = normalized.split(/\r?\n/);
    const hasExistingList = lines.some((line) => /^(\s*[-*]\s+|\s*\d+\.\s+)/.test(line));

    if (hasExistingList) {
      return `${normalized}\n\n`;
    }

    const sentences = this.splitSummarySentences(normalized);
    if (sentences.length <= 2) {
      return `${normalized}\n\n`;
    }

    return `${sentences[0]}\n\n${sentences
      .slice(1)
      .map((sentence) => `- ${sentence}`)
      .join("\n")}\n\n`;
  }

  private splitSummarySentences(summary: string): string[] {
    const codeSpans: string[] = [];
    const protectedSummary = summary.replace(/`[^`]+`/g, (match) => {
      const token = `__OPENDIFF_CODE_SPAN_${codeSpans.length}__`;
      codeSpans.push(match);
      return token;
    });

    return (
      protectedSummary
        .replace(/\s+/g, " ")
        .match(/[^.!?]+(?:[.!?]+|$)/g)
        ?.map((sentence) =>
          sentence
            .trim()
            .replace(
              /__OPENDIFF_CODE_SPAN_(\d+)__/g,
              (_token, index) => codeSpans[Number(index)] ?? ""
            )
        )
        .filter(Boolean) ?? [summary]
    );
  }

  private formatDetailedIssue(issue: SummaryIssue): string {
    let body = `#### ${TYPE_LABELS[issue.type]} in \`${this.formatIssueLocation(issue)}\`\n\n`;
    body += `**Code reference:** \`${this.formatIssueLocation(issue)}\`\n\n`;
    body += `**Issue:** ${issue.message}\n\n`;

    if (issue.description && issue.description !== issue.message) {
      body += `${issue.description}\n\n`;
    }

    if (issue.suggestion) {
      body += `**Suggestion:** ${issue.suggestion}\n\n`;
    }

    if (issue.suggestedCode) {
      body += "```suggestion\n";
      body += issue.suggestedCode.endsWith("\n") ? issue.suggestedCode : `${issue.suggestedCode}\n`;
      body += "```\n\n";
    }

    body += `${buildIssueMarker(issue)}\n\n`;
    return body;
  }

  private formatIssueLocation(issue: Pick<CodeIssue, "file" | "line" | "endLine">): string {
    return issue.endLine && issue.endLine > issue.line
      ? `${issue.file}:${issue.line}-${issue.endLine}`
      : `${issue.file}:${issue.line}`;
  }

  private formatSummary(result: ReviewResult, bodyOnlyIssues: CodeIssue[] = []): string {
    return this.formatHistoricalSummaryBody(result, bodyOnlyIssues);
  }

  private countBySeverity(
    issues: Array<Pick<CodeIssue, "severity">>
  ): Record<CodeIssue["severity"], number> {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.severity]++;
        return acc;
      },
      { critical: 0, warning: 0, suggestion: 0 }
    );
  }

  private calculateConfidenceScore(result: ReviewResult, history?: SummaryHistory): number {
    let score = 88;

    for (const issue of result.issues) {
      switch (issue.severity) {
        case "critical":
          score -= 12;
          break;
        case "warning":
          score -= 5;
          break;
        case "suggestion":
          score -= 2;
          break;
      }
    }

    score -= Math.min((history?.unresolvedHistoricalIssues?.length ?? 0) * 2, 10);
    score += Math.min((history?.addressedIssues?.length ?? 0) * 2, 6);

    if (result.verdict === "approve" && result.issues.length === 0) {
      score += 6;
    }

    return Math.max(35, Math.min(99, score));
  }

  private calculateRatingScore(result: ReviewResult, history?: SummaryHistory): number {
    let score = 92;

    for (const issue of result.issues) {
      switch (issue.severity) {
        case "critical":
          score -= 20;
          break;
        case "warning":
          score -= 8;
          break;
        case "suggestion":
          score -= 3;
          break;
      }
    }

    score -= Math.min((history?.unresolvedHistoricalIssues?.length ?? 0) * 3, 15);
    score += Math.min((history?.addressedIssues?.length ?? 0) * 2, 8);

    if (result.verdict === "approve" && result.issues.length === 0) {
      score += 5;
    }

    return Math.max(1, Math.min(100, score));
  }
}
