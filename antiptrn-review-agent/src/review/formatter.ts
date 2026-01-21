import type { CodeIssue, ReviewResult } from '../agent/types';
import type { Review, ReviewComment } from '../github/types';

const SEVERITY_EMOJI = {
  critical: '🚨',
  warning: '⚠️',
  suggestion: '💡',
} as const;

const TYPE_LABELS = {
  'anti-pattern': '🔄 Anti-pattern',
  security: '🔒 Security',
  performance: '⚡ Performance',
  style: '✨ Style',
  'bug-risk': '🐛 Bug Risk',
} as const;

export class ReviewFormatter {
  formatReview(result: ReviewResult): Review {
    const event = this.mapVerdict(result.verdict);
    const body = this.formatSummary(result);

    // Only include comments if there are issues
    const comments =
      result.issues.length > 0
        ? result.issues.map((issue) => this.formatComment(issue))
        : undefined;

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

  private mapVerdict(verdict: ReviewResult['verdict']): Review['event'] {
    switch (verdict) {
      case 'approve':
        return 'APPROVE';
      case 'request_changes':
        return 'REQUEST_CHANGES';
      default:
        return 'COMMENT';
    }
  }

  private formatSummary(result: ReviewResult): string {
    const counts = this.countBySeverity(result.issues);
    let summary = '## AI Code Review\n\n';
    summary += `${result.summary}\n\n`;

    if (result.issues.length > 0) {
      summary += '### Issues Found\n\n';

      if (counts.critical > 0) {
        summary += `- 🚨 **${counts.critical} critical** issue${counts.critical > 1 ? 's' : ''}\n`;
      }
      if (counts.warning > 0) {
        summary += `- ⚠️ **${counts.warning} warning${counts.warning > 1 ? 's' : ''}**\n`;
      }
      if (counts.suggestion > 0) {
        summary += `- 💡 **${counts.suggestion} suggestion${counts.suggestion > 1 ? 's' : ''}**\n`;
      }
    }

    summary +=
      '\n---\n*Reviewed by [antiptrn-review-agent](https://github.com/JuliusWallblom/antiptrn-review-agent)*';

    return summary;
  }

  private countBySeverity(issues: CodeIssue[]): Record<CodeIssue['severity'], number> {
    return issues.reduce(
      (acc, issue) => {
        acc[issue.severity]++;
        return acc;
      },
      { critical: 0, warning: 0, suggestion: 0 }
    );
  }
}
