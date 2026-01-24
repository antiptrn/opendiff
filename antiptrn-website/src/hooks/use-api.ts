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

// Query keys - include orgId for org-scoped data
export const queryKeys = {
  stats: (orgId?: string | null) => ["stats", orgId] as const,
  repos: (orgId?: string | null, query?: string) => ["repos", orgId, query] as const,
  orgRepos: (orgId?: string | null) => ["orgRepos", orgId] as const,
  activatedRepos: (orgId?: string | null) => ["activatedRepos", orgId] as const,
  settings: (owner: string, repo: string) => ["settings", owner, repo] as const,
  billing: (orgId?: string | null) => ["billing", orgId] as const,
  auditLogs: (orgId?: string | null, page?: number, search?: string, action?: string) =>
    ["auditLogs", orgId, page, search, action] as const,
};

// Fetch helpers
async function fetchWithAuth(
  url: string,
  token?: string,
  orgId?: string | null,
  options?: RequestInit
) {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (orgId) {
    headers["X-Organization-Id"] = orgId;
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
export function useStats(token?: string, orgId?: string | null) {
  return useQuery({
    queryKey: queryKeys.stats(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/stats`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000, // 30 seconds
  });
}

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
export function useOrgRepos(token?: string, orgId?: string | null) {
  return useQuery<OrgRepository[]>({
    queryKey: queryKeys.orgRepos(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/org/repos`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
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
      // Invalidate stats and activated repos
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
export function useBilling(token?: string, orgId?: string | null) {
  return useQuery<BillingData>({
    queryKey: queryKeys.billing(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/billing`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useCancelSubscription(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/subscription/cancel`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
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

export function useResubscribe(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/subscription/resubscribe`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
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

export function useApiKeyStatus(token?: string, orgId?: string | null) {
  return useQuery<ApiKeyStatus>({
    queryKey: ["apiKey", orgId],
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings/api-key`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useUpdateApiKey(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (apiKey: string) => {
      const response = await fetch(`${API_URL}/api/settings/api-key`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
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

export function useDeleteApiKey(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/settings/api-key`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
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

// Audit log types
export interface AuditLogUser {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuditLog {
  id: string;
  action: string;
  target: string | null;
  metadata: Record<string, unknown> | null;
  user: AuditLogUser | null;
  ipAddress: string | null;
  createdAt: string;
}

export interface AuditLogsResponse {
  logs: AuditLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useReviewRules(token?: string, orgId?: string | null) {
  return useQuery<ReviewRulesStatus>({
    queryKey: ["reviewRules", orgId],
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings/review-rules`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}

export function useUpdateReviewRules(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rules: string) => {
      const response = await fetch(`${API_URL}/api/settings/review-rules`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
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
export function useExportData(token?: string, orgId?: string | null) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/account/export`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
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

// Audit logs hook
export function useAuditLogs(
  token?: string,
  orgId?: string | null,
  options?: { page?: number; search?: string; action?: string }
) {
  const page = options?.page ?? 1;
  const search = options?.search ?? "";
  const action = options?.action ?? "";

  return useQuery<AuditLogsResponse>({
    queryKey: queryKeys.auditLogs(orgId, page, search, action),
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/organizations/${orgId}/audit-logs`);
      url.searchParams.set("page", page.toString());
      url.searchParams.set("limit", "50");
      if (search) url.searchParams.set("search", search);
      if (action) url.searchParams.set("action", action);
      return fetchWithAuth(url.toString(), token);
    },
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}

// Helper to get token from storage (supports multi-account)
function getTokenFromStorage(): string | undefined {
  // Try new multi-account storage first
  const accountsStored = localStorage.getItem("antiptrn_accounts");
  if (accountsStored) {
    try {
      const { accounts, activeAccountId } = JSON.parse(accountsStored);
      const activeUser = accounts.find(
        (a: { visitorId?: string; id: string | number }) =>
          (a.visitorId || a.id) === activeAccountId
      );
      if (activeUser?.access_token) return activeUser.access_token;
    } catch {
      // ignore
    }
  }

  // Fallback to old single-user storage
  const stored = localStorage.getItem("antiptrn_user");
  if (stored) {
    try {
      const user = JSON.parse(stored);
      return user.access_token;
    } catch {
      // ignore
    }
  }

  return undefined;
}

// Hook for updating account type
export function useUpdateAccountType() {
  const token = getTokenFromStorage();

  return useMutation({
    mutationFn: async (accountType: "SOLO" | "TEAM") => {
      const response = await fetch(`${API_URL}/api/account/type`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accountType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update account type");
      }

      return data as { success: boolean; accountType: "SOLO" | "TEAM" };
    },
  });
}

// Simple API helper hook for direct fetch calls
export function useApi() {
  const token = getTokenFromStorage();

  return {
    get: (path: string) =>
      fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    post: (path: string, body?: unknown) =>
      fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    put: (path: string, body?: unknown) =>
      fetch(`${API_URL}${path}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    delete: (path: string) =>
      fetch(`${API_URL}${path}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    upload: (path: string, formData: FormData) =>
      fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }),
  };
}

// GitHub linking hook for Google users
export function useLinkGitHub(token?: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/auth/github/link`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get GitHub link URL");
      }

      return data as { url: string };
    },
  });
}
