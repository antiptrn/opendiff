import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, fetchWithAuth, queryKeys } from "../../services";
import type { BillingData } from "../types";

/** Fetches billing data including subscription status and order history for an organization. */
export function useBilling(token?: string, orgId?: string | null) {
  return useQuery<BillingData>({
    queryKey: queryKeys.billing(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/billing`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}

/** Creates a new subscription checkout or upgrades/downgrades an existing plan. */
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

/** Cancels the active subscription for the current user or organization. */
export function useCancelSubscription(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Use organization endpoint if orgId is provided, otherwise use solo user endpoint
      const url = orgId
        ? `${API_URL}/api/organizations/${orgId}/subscription/cancel`
        : `${API_URL}/api/subscription/cancel`;

      const response = await fetch(url, {
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
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });
}

/** Reactivates a previously cancelled subscription before it expires. */
export function useResubscribe(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Use organization endpoint if orgId is provided, otherwise use solo user endpoint
      const url = orgId
        ? `${API_URL}/api/organizations/${orgId}/subscription/reactivate`
        : `${API_URL}/api/subscription/resubscribe`;

      const response = await fetch(url, {
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
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });
}

/** Retrieves the invoice download URL for a given order. */
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
