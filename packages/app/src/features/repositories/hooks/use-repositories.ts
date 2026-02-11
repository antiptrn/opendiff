import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, fetchWithAuth, queryKeys } from "shared/services";
import type { OrgRepository, Repository, RepositorySettings } from "../types";

/** Fetches the list of GitHub repositories available to the authenticated user. */
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

/** Fetches repositories that have review or triage enabled for the organization. */
export function useActivatedRepos(token?: string, orgId?: string | null) {
  return useQuery<RepositorySettings[]>({
    queryKey: queryKeys.activatedRepos(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

/** Fetches organization repositories from the database (for users without direct GitHub access). */
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

/** Fetches a single organization repository by owner and repo name. */
export function useOrgRepoByName(
  token?: string,
  orgId?: string | null,
  owner?: string,
  repo?: string
) {
  return useQuery<OrgRepository | null>({
    queryKey: queryKeys.orgRepo(orgId, owner, repo),
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/org/repos/${owner}/${repo}`);
      return fetchWithAuth(url.toString(), token, orgId);
    },
    enabled: !!token && !!orgId && !!owner && !!repo,
    staleTime: 30 * 1000,
  });
}

/** Fetches review and triage settings for a specific repository. */
export function useRepositorySettings(owner: string, repo: string) {
  return useQuery<RepositorySettings>({
    queryKey: queryKeys.settings(owner, repo),
    queryFn: () => fetch(`${API_URL}/api/settings/${owner}/${repo}`).then((r) => r.json()),
    enabled: !!owner && !!repo,
  });
}

/** Mutation hook for updating a repository's review and triage settings. */
export function useUpdateSettings(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      owner,
      repo,
      enabled,
      triageEnabled,
      autofixEnabled,
      sensitivity,
      customReviewRules,
      githubRepoId,
    }: {
      owner: string;
      repo: string;
      enabled: boolean;
      triageEnabled: boolean;
      autofixEnabled?: boolean;
      sensitivity?: number;
      customReviewRules?: string;
      githubRepoId?: number;
    }) => {
      const response = await fetch(`${API_URL}/api/settings/${owner}/${repo}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
        body: JSON.stringify({
          enabled,
          triageEnabled,
          autofixEnabled,
          sensitivity,
          customReviewRules,
          githubRepoId,
        }),
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
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Mutation hook for deleting a repository's settings and disconnecting it. */
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
      const fullName = `${owner}/${repo}`;

      // Optimistically remove from activated repos cache
      queryClient.setQueryData<RepositorySettings[]>(queryKeys.activatedRepos(orgId), (old) =>
        old?.filter((r) => `${r.owner}/${r.repo}` !== fullName)
      );

      // Optimistically remove from all org repos cache variants (any search query)
      queryClient.setQueriesData<OrgRepository[]>({ queryKey: ["orgRepos", orgId] }, (old) =>
        old?.filter((r) => r.fullName !== fullName)
      );

      // Remove individual repo query from cache
      queryClient.removeQueries({ queryKey: queryKeys.settings(owner, repo) });
      queryClient.removeQueries({ queryKey: queryKeys.orgRepo(orgId, owner, repo) });

      // Invalidate stats (for counts) - this can refetch in background
      queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

/** Mutation hook for fetching documentation files (README, LICENSE, etc.) from GitHub. */
export function useFetchDocs(token?: string, orgId?: string | null, githubToken?: string) {
  return useMutation({
    mutationFn: async ({ owner, repo }: { owner: string; repo: string }) => {
      const response = await fetch(`${API_URL}/api/org/repos/${owner}/${repo}/sync-readme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
          ...(githubToken ? { "X-GitHub-Token": githubToken } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch docs");
      }

      return data as {
        success: boolean;
        hasReadme: boolean;
        hasLicense: boolean;
        hasSecurity: boolean;
        hasContributing: boolean;
        readme: string | null;
        license: string | null;
        security: string | null;
        contributing: string | null;
      };
    },
  });
}
