export interface CodeIssue {
  type: "anti-pattern" | "security" | "performance" | "style" | "bug-risk";
  severity: "critical" | "warning" | "suggestion";
  file: string;
  line: number;
  endLine?: number; // For multi-line suggestions
  message: string;
  suggestion?: string; // Text explanation of how to fix
  suggestedCode?: string; // Exact code replacement (for GitHub suggested changes)
}

export interface ReviewResult {
  summary: string;
  issues: CodeIssue[];
  verdict: "approve" | "request_changes" | "comment";
}

export interface FileToReview {
  filename: string;
  content?: string; // Optional - Agent SDK will read files itself
  patch?: string;
}
