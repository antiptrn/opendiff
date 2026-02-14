/** Centralized React Query key factories, scoped by organization ID for cache isolation. */
export const queryKeys = {
  stats: (orgId?: string | null) => ["stats", orgId] as const,
  repos: (orgId?: string | null, query?: string) => ["repos", orgId, query] as const,
  orgRepos: (orgId?: string | null, query?: string) => ["orgRepos", orgId, query] as const,
  orgRepo: (orgId?: string | null, owner?: string, repo?: string) =>
    ["orgRepo", orgId, owner, repo] as const,
  activatedRepos: (orgId?: string | null) => ["activatedRepos", orgId] as const,
  settings: (owner: string, repo: string) => ["settings", owner, repo] as const,
  billing: (orgId?: string | null) => ["billing", orgId] as const,
  auditLogs: (orgId?: string | null, page?: number, search?: string, action?: string) =>
    ["auditLogs", orgId, page, search, action] as const,
  notifications: (orgId?: string | null) => ["notifications", orgId] as const,
  reviews: (orgId?: string | null, page?: number, repo?: string) =>
    ["reviews", orgId, page, repo] as const,
  reviewDetail: (orgId?: string | null, reviewId?: string) =>
    ["reviewDetail", orgId, reviewId] as const,
  skills: () => ["skills"] as const,
};
