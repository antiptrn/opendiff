import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, fetchWithAuth } from "shared/services";
import type { ReviewRulesStatus } from "../types";

/** Fetches the current custom review rules for the organization. */
export function useReviewRules(token?: string, orgId?: string | null) {
  return useQuery<ReviewRulesStatus>({
    queryKey: ["reviewRules", orgId],
    queryFn: () => fetchWithAuth(`${API_URL}/api/settings/review-rules`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}

/** Saves or updates the custom review rules for the organization. */
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
