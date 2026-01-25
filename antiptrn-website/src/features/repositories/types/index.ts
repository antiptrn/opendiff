export interface Repository {
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
  enabled: boolean;
  triageEnabled: boolean;
  customReviewRules?: string;
  effectiveEnabled: boolean;
  effectiveTriageEnabled: boolean;
}

// Organization repo with metadata (from database, not GitHub)
export interface OrgRepository {
  owner: string;
  repo: string;
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
  customReviewRules?: string;
  effectiveEnabled: boolean;
  effectiveTriageEnabled: boolean;
}

// Repo metadata for when enabling repos
export interface RepoMetadata {
  fullName: string;
  description?: string | null;
  isPrivate: boolean;
  avatarUrl?: string | null;
  defaultBranch?: string | null;
  htmlUrl?: string;
  language?: string | null;
  pushedAt?: string | null;
}
