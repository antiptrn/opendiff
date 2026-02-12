import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth";
import type { SeatChangePreview } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Mutation hook for updating the number of seats on an organization's subscription. */
export function useUpdateOrgSeatCount(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (count: number) => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/subscription/seats`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ count }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update seat count");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", user?.visitorId] });
    },
  });
}

/** Fetches a proration preview for a seat count change before committing. */
export function usePreviewSeatChange(orgId: string | null, newSeatCount: number | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["organization", orgId, "seats", "preview", newSeatCount],
    queryFn: async (): Promise<SeatChangePreview | null> => {
      if (!orgId || !user?.access_token || newSeatCount === null) return null;

      const response = await fetch(
        `${API_URL}/api/organizations/${orgId}/subscription/seats/preview?count=${newSeatCount}`,
        {
          headers: { Authorization: `Bearer ${user.access_token}` },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to preview seat change");
      }

      return response.json();
    },
    enabled: !!orgId && !!user?.access_token && newSeatCount !== null && newSeatCount > 0,
    staleTime: 30000, // Cache preview for 30 seconds
  });
}

/** Mutation hook for assigning a paid seat to an organization member. */
export function useAssignSeat(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/seats/${userId}/assign`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user?.access_token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to assign seat");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "members"] });
    },
  });
}

/** Mutation hook for removing a paid seat from an organization member. */
export function useUnassignSeat(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(
        `${API_URL}/api/organizations/${orgId}/seats/${userId}/unassign`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${user?.access_token}` },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to unassign seat");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "members"] });
    },
  });
}

/** Mutation hook for transferring a seat from one member to another. */
export function useReassignSeat(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sourceUserId,
      targetUserId,
    }: {
      sourceUserId: string;
      targetUserId: string;
    }) => {
      const response = await fetch(
        `${API_URL}/api/organizations/${orgId}/seats/${sourceUserId}/reassign`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user?.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ targetUserId }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to reassign seat");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "members"] });
    },
  });
}
