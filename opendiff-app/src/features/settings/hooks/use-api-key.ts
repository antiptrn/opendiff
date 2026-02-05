import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, fetchWithAuth } from "opendiff-shared/services";
import type { ApiKeyStatus } from "../types";

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
