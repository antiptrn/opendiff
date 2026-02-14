import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type OrganizationRole, useAuth } from "../../auth";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Mutation hook for updating a member's role within an organization. */
export function useUpdateMemberRole(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: OrganizationRole }) => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/members/${userId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update role");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "members"] });
    },
  });
}

/** Mutation hook for removing a member from an organization. */
export function useRemoveMember(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (userId: string) => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/members/${userId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user?.access_token}` },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to remove member");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "members"] });
    },
  });
}

/** Mutation hook for the current user to leave an organization. */
export function useLeaveOrganization(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user?.visitorId) throw new Error("Not authenticated");

      const response = await fetch(
        `${API_URL}/api/organizations/${orgId}/members/${user.visitorId}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${user.access_token}` },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to leave organization");
      }
    },
    onSuccess: () => {
      // Invalidate all organization-related queries
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "members"] });
      queryClient.invalidateQueries({ queryKey: ["organizations", user?.visitorId] });
    },
  });
}
