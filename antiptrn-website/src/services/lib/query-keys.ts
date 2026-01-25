// Query keys - include orgId for org-scoped data
export const queryKeys = {
  stats: (orgId?: string | null) => ["stats", orgId] as const,
  repos: (orgId?: string | null, query?: string) => ["repos", orgId, query] as const,
  orgRepos: (orgId?: string | null, query?: string) => ["orgRepos", orgId, query] as const,
  activatedRepos: (orgId?: string | null) => ["activatedRepos", orgId] as const,
  settings: (owner: string, repo: string) => ["settings", owner, repo] as const,
  billing: (orgId?: string | null) => ["billing", orgId] as const,
  auditLogs: (orgId?: string | null, page?: number, search?: string, action?: string) =>
    ["auditLogs", orgId, page, search, action] as const,
};
