import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Mutation hook for creating or updating an organization's subscription plan. */
export function useManageSubscription(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tier,
      billing,
      seatCount,
    }: {
      tier: "SELF_SUFFICIENT" | "PRO" | "ULTRA";
      billing: "monthly" | "yearly";
      seatCount: number;
    }) => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/subscription`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tier, billing, seatCount }),
      });

      if (!response.ok) {
        let message = "Failed to manage subscription";
        try {
          const error = (await response.json()) as { error?: string };
          message = error.error || message;
        } catch {
          // ignore JSON parse failures; fall back to status text
          message = response.statusText || message;
        }
        throw new Error(message);
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations", user?.visitorId] });
    },
  });
}

/** Mutation hook for cancelling an organization's subscription. */
export function useCancelOrgSubscription(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/subscription/cancel`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.access_token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to cancel subscription");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations", user?.visitorId] });
    },
  });
}

/** Mutation hook for reactivating a cancelled organization subscription. */
export function useReactivateSubscription(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${API_URL}/api/organizations/${orgId}/subscription/reactivate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${user?.access_token}` },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reactivate subscription");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations", user?.visitorId] });
    },
  });
}
