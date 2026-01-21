import { describe, expect, it } from 'vitest';
import type { CodeIssue, ReviewResult } from '../agent/types';
import { ReviewFormatter } from './formatter';

describe('ReviewFormatter', () => {
  const formatter = new ReviewFormatter();

  describe('formatReview', () => {
    it('should convert review result to GitHub review format', () => {
      const reviewResult: ReviewResult = {
        summary: 'Found some issues that need attention.',
        issues: [
          {
            type: 'security',
            severity: 'critical',
            file: 'src/auth.ts',
            line: 10,
            message: 'SQL injection vulnerability',
            suggestion: 'Use parameterized queries',
          },
        ],
        verdict: 'request_changes',
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.event).toBe('REQUEST_CHANGES');
      expect(review.body).toContain('Found some issues');
      expect(review.comments).toHaveLength(1);
      expect(review.comments?.[0].path).toBe('src/auth.ts');
      expect(review.comments?.[0].line).toBe(10);
    });

    it('should format approval correctly', () => {
      const reviewResult: ReviewResult = {
        summary: 'Code looks great!',
        issues: [],
        verdict: 'approve',
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.event).toBe('APPROVE');
      expect(review.body).toContain('Code looks great');
      expect(review.comments).toBeUndefined();
    });

    it('should format comment-only review', () => {
      const reviewResult: ReviewResult = {
        summary: 'A few suggestions for improvement.',
        issues: [
          {
            type: 'style',
            severity: 'suggestion',
            file: 'src/utils.ts',
            line: 5,
            message: 'Consider using const',
          },
        ],
        verdict: 'comment',
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.event).toBe('COMMENT');
    });

    it('should include severity emoji in comments', () => {
      const reviewResult: ReviewResult = {
        summary: 'Issues found.',
        issues: [
          {
            type: 'security',
            severity: 'critical',
            file: 'a.ts',
            line: 1,
            message: 'Critical issue',
          },
          {
            type: 'style',
            severity: 'warning',
            file: 'b.ts',
            line: 2,
            message: 'Warning issue',
          },
          {
            type: 'style',
            severity: 'suggestion',
            file: 'c.ts',
            line: 3,
            message: 'Suggestion',
          },
        ],
        verdict: 'request_changes',
      };

      const review = formatter.formatReview(reviewResult);
      const comments = review.comments!;

      expect(comments[0].body).toMatch(/🚨|⛔|❌/); // Critical emoji
      expect(comments[1].body).toMatch(/⚠️|🔶/); // Warning emoji
      expect(comments[2].body).toMatch(/💡|ℹ️/); // Suggestion emoji
    });

    it('should include suggestion in code block when provided', () => {
      const reviewResult: ReviewResult = {
        summary: 'Issue found.',
        issues: [
          {
            type: 'bug-risk',
            severity: 'warning',
            file: 'src/calc.ts',
            line: 15,
            message: 'Off-by-one error',
            suggestion: 'Use `i <= length` instead of `i < length`',
          },
        ],
        verdict: 'comment',
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.comments?.[0].body).toContain('**Suggestion:**');
      expect(review.comments?.[0].body).toContain('i <= length');
    });

    it('should add issue type badge', () => {
      const reviewResult: ReviewResult = {
        summary: 'Multiple issue types.',
        issues: [
          {
            type: 'security',
            severity: 'critical',
            file: 'a.ts',
            line: 1,
            message: 'Security issue',
          },
          {
            type: 'performance',
            severity: 'warning',
            file: 'b.ts',
            line: 2,
            message: 'Performance issue',
          },
        ],
        verdict: 'request_changes',
      };

      const review = formatter.formatReview(reviewResult);

      expect(review.comments?.[0].body.toLowerCase()).toContain('security');
      expect(review.comments?.[1].body.toLowerCase()).toContain('performance');
    });

    it('should format summary with issue counts', () => {
      const reviewResult: ReviewResult = {
        summary: 'Multiple issues found.',
        issues: [
          { type: 'security', severity: 'critical', file: 'a.ts', line: 1, message: 'x' },
          { type: 'security', severity: 'critical', file: 'b.ts', line: 2, message: 'y' },
          { type: 'style', severity: 'warning', file: 'c.ts', line: 3, message: 'z' },
        ],
        verdict: 'request_changes',
      };

      const review = formatter.formatReview(reviewResult);

      // Should include count summary
      expect(review.body).toMatch(/2.*critical/i);
      expect(review.body).toMatch(/1.*warning/i);
    });
  });

  describe('formatComment', () => {
    it('should format a single issue as a comment', () => {
      const issue: CodeIssue = {
        type: 'anti-pattern',
        severity: 'warning',
        file: 'src/service.ts',
        line: 42,
        message: 'God object detected - class has too many responsibilities',
        suggestion: 'Split into smaller, focused classes',
      };

      const comment = formatter.formatComment(issue);

      expect(comment.path).toBe('src/service.ts');
      expect(comment.line).toBe(42);
      expect(comment.body).toContain('God object');
      expect(comment.body).toContain('Split into smaller');
    });
  });
});
