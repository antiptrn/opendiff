// Shared type definitions used across bff, review-agent, and vscode-extension.
// This module has NO runtime dependencies — types only.

// ── Review Types ──────────────────────────────────────────────────────────────

export type IssueType = "anti-pattern" | "security" | "performance" | "style" | "bug-risk";
export type IssueSeverity = "critical" | "warning" | "suggestion";
export type ReviewVerdict = "approve" | "request_changes" | "comment";

export interface ReviewScopeEvidence {
  /** The changed code responsible for the finding, which may affect another file. */
  file: string;
  line: number;
  /** FILE anchors a rename at the new path with line 1; other sides anchor changed text. */
  side: "LEFT" | "RIGHT" | "FILE";
  before: string;
  after: string;
}

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
  scope?: ReviewScopeEvidence;
}

export interface ReviewResult {
  summary: string;
  mergeSafety: string;
  issues: CodeIssue[];
  verdict: ReviewVerdict;
  tokensUsed?: number;
  /** Internal only: excluded findings used to reconcile prior reviews without claiming a fix. */
  scopeRejectedIssues?: CodeIssue[];
}

export interface FileToReview {
  filename: string;
  previousFilename?: string;
  status?: string;
  content?: string;
  patch?: string;
}

// ── Local Review Types (VSCode Extension ↔ BFF) ──────────────────────────────

export interface FilePayload extends FileToReview {
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
  approveEnabled: boolean;
  autofixEnabled: boolean;
  reviewIncludedDirs?: string;
  autofixIncludedDirs?: string;
  reviewIgnoredDirs?: string;
  autofixIgnoredDirs?: string;
  sensitivity: number;
  disabledReason?:
    | "repository_not_configured"
    | "repository_disabled"
    | "missing_organization"
    | "quota_exhausted";
  quota?: {
    total: number;
    used: number;
    hasUnlimited: boolean;
  };
}
