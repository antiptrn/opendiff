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

export interface Order {
  id: string;
  createdAt: string;
  amount: number;
  currency: string;
  status: string;
  productName: string;
}

export interface BillingData {
  subscription: {
    tier: SubscriptionTier;
    status: SubscriptionStatus;
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
  };
  orders: Order[];
}

// Query keys
export const queryKeys = {
  stats: (token?: string) => ["stats", token] as const,
  repos: (token?: string, query?: string) => ["repos", token, query] as const,
  activatedRepos: (token?: string) => ["activatedRepos", token] as const,
  settings: (owner: string, repo: string) => ["settings", owner, repo] as const,
  billing: (token?: string) => ["billing", token] as const,
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

// Billing hooks - single endpoint for subscription + orders
export function useBilling(token?: string) {
  return useQuery<BillingData>({
    queryKey: queryKeys.billing(token),
    queryFn: () => fetchWithAuth(`${API_URL}/api/billing`, token),
    enabled: !!token,
    staleTime: 30 * 1000,
  });
}

export function useCancelSubscription(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/subscription/cancel`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to cancel subscription");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

export function useResubscribe(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/subscription/resubscribe`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to reactivate subscription");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    },
  });
}

export function useGetInvoice(token?: string) {
  return useMutation({
    mutationFn: async (orderId: string) => {
      const response = await fetch(`${API_URL}/api/billing/invoice/${orderId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get invoice");
      }

      return data as { invoiceUrl: string };
    },
  });
}

// BYOK API key hooks
export interface ApiKeyStatus {
  hasKey: boolean;
  maskedKey: string | null;
  tier: string;
}

export function useApiKeyStatus(token?: string) {
  return useQuery<ApiKeyStatus>({
    queryKey: ["apiKey", token],
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings/api-key`, token),
    enabled: !!token,
    staleTime: 30 * 1000,
  });
}

export function useUpdateApiKey(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await fetch(`${API_URL}/api/settings/api-key`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ apiKey }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save API key");
      }

      return data as { success: boolean; maskedKey: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKey"] });
    },
  });
}

export function useDeleteApiKey(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/settings/api-key`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete API key");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKey"] });
    },
  });
}

// Custom review rules hooks
export interface ReviewRulesStatus {
  rules: string;
}

export function useReviewRules(token?: string) {
  return useQuery<ReviewRulesStatus>({
    queryKey: ["reviewRules", token],
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings/review-rules`, token),
    enabled: !!token,
    staleTime: 30 * 1000,
  });
}

export function useUpdateReviewRules(token?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rules: string) => {
      const response = await fetch(`${API_URL}/api/settings/review-rules`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ rules }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save review rules");
      }

      return data as { success: boolean; rules: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewRules"] });
    },
  });
}

// Account management hooks
export function useExportData(token?: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/account/export`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to export data");
      }

      return data;
    },
  });
}

export function useDeleteAccount(token?: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/account`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      return data;
    },
  });
}
