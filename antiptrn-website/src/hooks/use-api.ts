import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { SubscriptionTier, SubscriptionStatus } from "./use-auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Types
export interface Repository {
  full_name: string;
  owner: string;
  name: string;
  private: boolean;
}

export interface RepositorySettings {
  owner: string;
  repo: string;
  enabled: boolean;
  triageEnabled: boolean;
  effectiveEnabled: boolean;
  effectiveTriageEnabled: boolean;
}

export interface Stats {
  reviewCount: number;
  connectedRepos: number;
  totalRepos: number;
}

export interface SubscriptionInfo {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  polarSubscriptionId: string | null;
  subscriptionExpiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

// Query keys
export const queryKeys = {
  stats: (token?: string) => ["stats", token] as const,
  repos: (token?: string, query?: string) => ["repos", token, query] as const,
  activatedRepos: (token?: string) => ["activatedRepos", token] as const,
  settings: (owner: string, repo: string) => ["settings", owner, repo] as const,
  subscriptionStatus: (token?: string) => ["subscriptionStatus", token] as const,
};

// Fetch helpers
async function fetchWithAuth(url: string, token?: string, options?: RequestInit) {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Stats hooks
export function useStats(token?: string) {
  return useQuery({
    queryKey: queryKeys.stats(token),
    queryFn: () => fetchWithAuth(`${API_URL}/api/stats`, token),
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds
  });
}

// Repository hooks
export function useRepositories(token?: string, query?: string) {
  return useQuery<Repository[]>({
    queryKey: queryKeys.repos(token, query),
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/repos`);
      if (query) {
        url.searchParams.set("q", query);
      }
      return fetchWithAuth(url.toString(), token);
    },
    enabled: !!token,
    staleTime: 60 * 1000, // 1 minute
  });
}

// Activated repos hook
export function useActivatedRepos(token?: string) {
  return useQuery<RepositorySettings[]>({
    queryKey: queryKeys.activatedRepos(token),
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings`, token),
    enabled: !!token,
    staleTime: 30 * 1000, // 30 seconds
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

export function useUpdateSettings(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      owner,
      repo,
      enabled,
      triageEnabled,
    }: {
      owner: string;
      repo: string;
      enabled: boolean;
      triageEnabled: boolean;
    }) => {
      const response = await fetch(`${API_URL}/api/settings/${owner}/${repo}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ enabled, triageEnabled }),
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
      // Invalidate stats and activated repos since connected repos may have changed
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["activatedRepos"] });
    },
  });
}

// Subscription hooks
export function useCreateSubscription(token?: string) {
  return useMutation({
    mutationFn: async (productId: string) => {
      const response = await fetch(`${API_URL}/api/subscription/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ productId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create subscription");
      }

      return data as {
        checkoutUrl?: string;
        requiresAuth?: boolean;
        subscriptionUpdated?: boolean;
        type?: "upgrade" | "downgrade";
      };
    },
  });
}
