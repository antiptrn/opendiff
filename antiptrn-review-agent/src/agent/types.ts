export interface CodeIssue {
  type: 'anti-pattern' | 'security' | 'performance' | 'style' | 'bug-risk';
  severity: 'critical' | 'warning' | 'suggestion';
  file: string;
  line: number;
  message: string;
  suggestion?: string;
}

export interface ReviewResult {
  summary: string;
  issues: CodeIssue[];
  verdict: 'approve' | 'request_changes' | 'comment';
}

export interface FileToReview {
  filename: string;
  content: string;
  patch?: string;
}
