import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, fetchWithAuth } from "shared/services";
import type { AiAuthMethod, AiConfigStatus, AiModelOption, AiProvider } from "../types";

/** Fetches the current AI config status for the organization. */
export function useAiConfigStatus(token?: string, orgId?: string | null) {
  return useQuery<AiConfigStatus>({
    queryKey: ["aiConfig", orgId],
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings/ai-config`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}

/** Fetches OpenCode models for a provider. */
export function useAiModels(provider: AiProvider, token?: string, orgId?: string | null) {
  return useQuery<{ provider: AiProvider; models: AiModelOption[] }>({
    queryKey: ["aiModels", provider, orgId],
    queryFn: () =>
      fetchWithAuth(
        `${API_URL}/api/settings/ai-models?provider=${encodeURIComponent(provider)}`,
        token,
        orgId
      ),
    enabled: !!token && !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Saves or updates the AI config for the organization. */
export function useUpdateAiConfig(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      provider: AiProvider;
      authMethod: AiAuthMethod;
      model: string;
      credential: string;
      refreshToken?: string;
      accountId?: string;
    }) => {
      const response = await fetch(`${API_URL}/api/settings/ai-config`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
        body: JSON.stringify(input),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save AI config");
      }

      return data as {
        success: boolean;
        provider: AiProvider;
        authMethod: AiAuthMethod;
        model: string;
        maskedCredential: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiConfig"] });
    },
  });
}

/** Deletes the stored AI config for the organization. */
export function useDeleteAiConfig(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/settings/ai-config`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete AI config");
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aiConfig"] });
    },
  });
}
