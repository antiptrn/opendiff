import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, type UserOrganization, type OrganizationRole } from "@features/auth";
import { useOrganizationContext } from "../context";
import type {
  OrganizationDetails,
  MembersResponse,
  OrganizationInvite,
  SeatChangePreview,
} from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export function useOrganization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Use shared context for selected org ID
  const { selectedOrgId, setSelectedOrgId } = useOrganizationContext();

  // Fetch organizations from API
  // Include user ID in query key so each account has its own cache
  const {
    data: orgsData,
    isLoading: isLoadingOrgs,
    isFetched: hasFetchedOrgs,
    error: orgsError,
  } = useQuery({
    queryKey: ["organizations", user?.visitorId],
    queryFn: async (): Promise<UserOrganization[]> => {
      if (!user?.access_token) return [];

      const response = await fetch(`${API_URL}/api/organizations`, {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid - throw to trigger error state
          throw new Error("UNAUTHORIZED");
        }
        throw new Error("Failed to fetch organizations");
      }

      const data = await response.json();
      // Ensure we always return an array
      return Array.isArray(data) ? data : [];
    },
    enabled: !!user?.access_token,
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Ensure allOrganizations is always an array (defensive against race conditions)
  const allOrganizations = Array.isArray(orgsData) ? orgsData : [];

  // Filter out personal orgs from the visible list (for org switcher)
  // but keep allOrganizations for finding the current org
  const visibleOrganizations = allOrganizations.filter((org) => !org.isPersonal);

  // Find current org - prefer visible orgs, but fall back to personal org for solo users with no team orgs
  // If selected org is visible, use it. Otherwise, prefer first visible org, then fall back to any org.
  const selectedOrgIsVisible =
    selectedOrgId && visibleOrganizations.find((o) => o.id === selectedOrgId);
  const selectedOrgExists = selectedOrgId && allOrganizations.find((o) => o.id === selectedOrgId);

  let currentOrgId: string | null;
  if (selectedOrgIsVisible) {
    // Selected org is visible - use it
    currentOrgId = selectedOrgId;
  } else if (visibleOrganizations.length > 0) {
    // Selected org is hidden (personal) but user has visible orgs - switch to first visible
    currentOrgId = visibleOrganizations[0].id;
  } else if (selectedOrgExists) {
    // No visible orgs but selected org exists (solo user with only personal org) - use it
    currentOrgId = selectedOrgId;
  } else {
    // Fall back to first org available
    currentOrgId = allOrganizations[0]?.id || null;
  }

  // Sync state if currentOrgId differs (e.g., selected org was deleted)
  useEffect(() => {
    if (currentOrgId && currentOrgId !== selectedOrgId) {
      setSelectedOrgId(currentOrgId);
    }
  }, [currentOrgId, selectedOrgId, setSelectedOrgId]);

  const currentOrg = allOrganizations.find((o) => o.id === currentOrgId) || null;

  // Fetch detailed organization info
  const { data: orgDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["organization", user?.visitorId, currentOrgId],
    queryFn: async (): Promise<OrganizationDetails | null> => {
      if (!currentOrgId || !user?.access_token) return null;

      const response = await fetch(`${API_URL}/api/organizations/${currentOrgId}`, {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch organization");
      }

      return response.json();
    },
    enabled: !!currentOrgId && !!user?.access_token,
  });

  // Switch organization - context handles query removal and localStorage
  const switchOrg = (orgId: string) => {
    setSelectedOrgId(orgId);
  };

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async ({ name, isPersonal }: { name: string; isPersonal?: boolean }) => {
      const response = await fetch(`${API_URL}/api/organizations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, isPersonal }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create organization");
      }

      return response.json();
    },
    onSuccess: (data, variables) => {
      // Immediately add the new org to the cache so hasOrganizations is true
      queryClient.setQueryData<UserOrganization[]>(["organizations"], (old) => {
        const newOrg: UserOrganization = {
          id: data.id,
          name: data.name,
          slug: data.slug,
          avatarUrl: data.avatarUrl || null,
          role: "OWNER",
          isPersonal: variables.isPersonal,
          seat: null, // New org starts with no seat assigned
        };
        return old ? [...old, newOrg] : [newOrg];
      });
      setSelectedOrgId(data.id);
      // Also invalidate to ensure we have fresh data
      queryClient.invalidateQueries({ queryKey: ["organization"] });
    },
  });

  // Helper to check permissions
  const canManageMembers = currentOrg?.role === "OWNER" || currentOrg?.role === "ADMIN";
  const canManageBilling = currentOrg?.role === "OWNER";
  const canUpdateOrg = currentOrg?.role === "OWNER" || currentOrg?.role === "ADMIN";
  const canDeleteOrg = currentOrg?.role === "OWNER";

  // Get current user's seat status
  const hasSeat = orgDetails?.hasSeat ?? false;
  const subscription = orgDetails?.subscription ?? null;

  // Create currentSeat object for user's seat (if they have one)
  const currentSeat =
    hasSeat && subscription
      ? {
          tier: subscription.tier,
          status: subscription.status,
          expiresAt: subscription.expiresAt,
          cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        }
      : null;

  // Check if we got an unauthorized error (token expired)
  const isUnauthorized = orgsError instanceof Error && orgsError.message === "UNAUTHORIZED";

  return {
    // visibleOrganizations is for the org switcher (excludes personal org)
    organizations: visibleOrganizations,
    currentOrg,
    currentOrgId,
    orgDetails,
    isLoadingOrgs,
    isLoadingDetails,
    hasFetchedOrgs,
    switchOrg,
    createOrg: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
    // hasOrganizations uses allOrganizations (includes personal org for redirect logic)
    hasOrganizations: allOrganizations.length > 0,
    // Auth state
    isUnauthorized,
    // Subscription info (org-level)
    subscription,
    hasSeat,
    currentSeat,
    quotaPool: orgDetails?.quotaPool ?? null,
    seats: orgDetails?.seats ?? null,
    // Permissions
    canManageMembers,
    canManageBilling,
    canUpdateOrg,
    canDeleteOrg,
  };
}

// Hook for fetching organization members
export function useOrganizationMembers(orgId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["organization", orgId, "members"],
    queryFn: async (): Promise<MembersResponse> => {
      if (!orgId || !user?.access_token)
        return {
          members: [],
          quotaPool: { total: 0, used: 0, hasUnlimited: false },
          seats: { total: 0, assigned: 0, available: 0 },
        };

      const response = await fetch(`${API_URL}/api/organizations/${orgId}/members`, {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch members");
      }

      return response.json();
    },
    enabled: !!orgId && !!user?.access_token,
  });
}

// Hook for managing invites
export function useOrganizationInvites(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: ["organization", orgId, "invites"],
    queryFn: async (): Promise<OrganizationInvite[]> => {
      if (!orgId || !user?.access_token) return [];

      const response = await fetch(`${API_URL}/api/organizations/${orgId}/invites`, {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch invites");
      }

      return response.json();
    },
    enabled: !!orgId && !!user?.access_token,
  });

  const createInvite = useMutation({
    mutationFn: async ({ email, role }: { email?: string; role: OrganizationRole }) => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/invites`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create invite");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "invites"] });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: async (inviteId: string) => {
      const response = await fetch(`${API_URL}/api/organizations/${orgId}/invites/${inviteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${user?.access_token}` },
      });

      if (!response.ok) {
        throw new Error("Failed to revoke invite");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", orgId, "invites"] });
    },
  });

  return {
    invites: invitesQuery.data || [],
    isLoading: invitesQuery.isLoading,
    createInvite: createInvite.mutateAsync,
    isCreatingInvite: createInvite.isPending,
    revokeInvite: revokeInvite.mutateAsync,
    isRevokingInvite: revokeInvite.isPending,
  };
}

// Hook for updating member roles
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

// Hook for removing members
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

// Hook for leaving an organization (current user removes themselves)
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

// ==================== SUBSCRIPTION MANAGEMENT HOOKS ====================

// Hook for managing org subscription (create/update)
export function useManageSubscription(orgId: string | null) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      tier,
      billing,
      seatCount,
    }: {
      tier: "BYOK" | "CODE_REVIEW" | "TRIAGE";
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
        const error = await response.json();
        throw new Error(error.error || "Failed to manage subscription");
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organization", user?.visitorId, orgId] });
      queryClient.invalidateQueries({ queryKey: ["organizations", user?.visitorId] });
    },
  });
}

// Hook for cancelling org subscription
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

// Hook for reactivating a cancelled subscription
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

// ==================== SEAT COUNT MANAGEMENT HOOKS ====================

// Hook for updating seat count
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

// Hook for previewing seat change proration
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

// ==================== SEAT ASSIGNMENT HOOKS ====================

// Hook for assigning a seat to a member
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

// Hook for unassigning a seat from a member
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

// Hook for reassigning a seat from one member to another
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
