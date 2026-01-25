import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchWithAuth, API_URL, queryKeys } from "@services";
import type { Repository, RepositorySettings, OrgRepository, RepoMetadata } from "../types";

// Repository hooks
export function useRepositories(token?: string, orgId?: string | null, query?: string) {
  return useQuery<Repository[]>({
    queryKey: queryKeys.repos(orgId, query),
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/repos`);
      if (query) {
        url.searchParams.set("q", query);
      }
      return fetchWithAuth(url.toString(), token, orgId);
    },
    enabled: !!token && !!orgId,
    staleTime: 60 * 1000, // 1 minute
    placeholderData: (previousData) => previousData, // Keep showing previous data while fetching
  });
}

// Activated repos hook
export function useActivatedRepos(token?: string, orgId?: string | null) {
  return useQuery<RepositorySettings[]>({
    queryKey: queryKeys.activatedRepos(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Organization repos from database (for users without GitHub access)
export function useOrgRepos(token?: string, orgId?: string | null, query?: string) {
  return useQuery<OrgRepository[]>({
    queryKey: queryKeys.orgRepos(orgId, query),
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/org/repos`);
      if (query) {
        url.searchParams.set("q", query);
      }
      return fetchWithAuth(url.toString(), token, orgId);
    },
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
    placeholderData: (previousData) => previousData, // Keep showing previous data while fetching
  });
}

// Settings hooks
export function useRepositorySettings(owner: string, repo: string) {
  return useQuery<RepositorySettings>({
    queryKey: queryKeys.settings(owner, repo),
    queryFn: () => fetch(`${API_URL}/api/settings/${owner}/${repo}`).then((r) => r.json()),
    enabled: !!owner && !!repo,
  });
}

export function useUpdateSettings(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      owner,
      repo,
      enabled,
      triageEnabled,
      customReviewRules,
      repoMetadata,
    }: {
      owner: string;
      repo: string;
      enabled: boolean;
      triageEnabled: boolean;
      customReviewRules?: string;
      repoMetadata?: RepoMetadata;
    }) => {
      const response = await fetch(`${API_URL}/api/settings/${owner}/${repo}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
        body: JSON.stringify({ enabled, triageEnabled, customReviewRules, repoMetadata }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      return data as RepositorySettings;
    },
    onSuccess: (data) => {
      // Update cache
      queryClient.setQueryData(queryKeys.settings(data.owner, data.repo), data);
      // Invalidate stats, activated repos, and org repos since connected repos may have changed
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["activatedRepos"] });
      queryClient.invalidateQueries({ queryKey: ["orgRepos"] });
    },
  });
}

export function useDeleteRepoSettings(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ owner, repo }: { owner: string; repo: string }) => {
      const url = new URL(`${API_URL}/api/settings/${owner}/${repo}`);
      if (orgId) url.searchParams.set("orgId", orgId);

      const response = await fetch(url.toString(), {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete repository");
      }

      return { owner, repo };
    },
    onSuccess: ({ owner, repo }) => {
      // Remove from cache
      queryClient.removeQueries({ queryKey: queryKeys.settings(owner, repo) });
      // Invalidate stats, activated repos, and org repos
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["activatedRepos"] });
      queryClient.invalidateQueries({ queryKey: ["orgRepos"] });
    },
  });
}
