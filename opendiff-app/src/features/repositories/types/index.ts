export interface Repository {
  id: number; // GitHub repo ID
  full_name: string;
  owner: string;
  name: string;
  private: boolean;
  language: string | null;
  pushed_at: string | null;
  description: string | null;
}

export interface RepositorySettings {
  owner: string;
  repo: string;
  githubRepoId?: number | null;
  enabled: boolean;
  triageEnabled: boolean;
  autofixEnabled: boolean;
  sensitivity: number;
  customReviewRules?: string;
  effectiveEnabled: boolean;
  effectiveTriageEnabled: boolean;
}

// Organization repo with metadata (fetched from GitHub on-demand)
export interface OrgRepository {
  owner: string;
  repo: string;
  githubRepoId: number | null;
  fullName: string;
  description: string | null;
  isPrivate: boolean;
  avatarUrl: string | null;
  defaultBranch: string | null;
  htmlUrl: string;
  language: string | null;
  pushedAt: string | null;
  enabled: boolean;
  triageEnabled: boolean;
  autofixEnabled: boolean;
  sensitivity: number;
  customReviewRules?: string;
  effectiveEnabled: boolean;
  effectiveTriageEnabled: boolean;
}
