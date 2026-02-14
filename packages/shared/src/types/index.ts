// Shared type definitions used across bff, review-agent, and vscode-extension.
// This module has NO runtime dependencies — types only.

// ── Review Types ──────────────────────────────────────────────────────────────

export type IssueType = "anti-pattern" | "security" | "performance" | "style" | "bug-risk";
export type IssueSeverity = "critical" | "warning" | "suggestion";
export type ReviewVerdict = "approve" | "request_changes" | "comment";

export interface CodeIssue {
  type: IssueType;
  severity: IssueSeverity;
  file: string;
  line: number;
  endLine?: number;
  message: string;
  description?: string;
  suggestion?: string;
  suggestedCode?: string;
}

export interface ReviewResult {
  summary: string;
  issues: CodeIssue[];
  verdict: ReviewVerdict;
  tokensUsed?: number;
}

export interface FileToReview {
  filename: string;
  content?: string;
  patch?: string;
}

// ── Local Review Types (VSCode Extension ↔ BFF) ──────────────────────────────

export interface FilePayload {
  filename: string;
  content: string;
  patch: string;
}

export interface LocalReviewRequest {
  files: FilePayload[];
  title: string;
  sensitivity?: number;
}

// ── Repository Settings (BFF ↔ Review Agent) ─────────────────────────────────

export interface RepositorySettings {
  owner: string;
  repo: string;
  enabled: boolean;
  effectiveEnabled: boolean;
  autofixEnabled: boolean;
  sensitivity: number;
}
