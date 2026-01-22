import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth, type UserOrganization, type OrganizationRole } from "./use-auth";
import { useOrganizationContext } from "@/contexts/organization-context";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface OrganizationMember {
  userId: string;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  role: OrganizationRole;
  joinedAt: string;
}

export interface OrganizationInvite {
  id: string;
  email: string | null;
  token: string;
  role: OrganizationRole;
  invitedBy: string;
  expiresAt: string;
  createdAt: string;
}

export interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  seatCount: number;
  membersCount: number;
  role: OrganizationRole;
  createdAt: string;
}

export function useOrganization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Use shared context for selected org ID
  const { selectedOrgId, setSelectedOrgId } = useOrganizationContext();

  // Fetch organizations from API
  const { data: organizations = [], isLoading: isLoadingOrgs } = useQuery({
    queryKey: ["organizations"],
    queryFn: async (): Promise<UserOrganization[]> => {
      if (!user?.access_token) return [];

      const response = await fetch(`${API_URL}/api/organizations`, {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });

      if (!response.ok) {
        return [];
      }

      return response.json();
    },
    enabled: !!user?.access_token,
  });

  // Find current org from list, or use first one if selected is invalid
  const currentOrgId = selectedOrgId && organizations.find(o => o.id === selectedOrgId)
    ? selectedOrgId
    : organizations[0]?.id || null;

  // Sync state if currentOrgId differs (e.g., selected org was deleted)
  useEffect(() => {
    if (currentOrgId && currentOrgId !== selectedOrgId) {
      setSelectedOrgId(currentOrgId);
    }
  }, [currentOrgId, selectedOrgId, setSelectedOrgId]);

  const currentOrg = organizations.find(o => o.id === currentOrgId) || null;

  // Fetch detailed organization info
  const { data: orgDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["organization", currentOrgId],
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
    mutationFn: async (name: string) => {
      const response = await fetch(`${API_URL}/api/organizations`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create organization");
      }

      return response.json();
    },
    onSuccess: (data) => {
      // Immediately add the new org to the cache so hasOrganizations is true
      queryClient.setQueryData<UserOrganization[]>(["organizations"], (old) => {
        const newOrg: UserOrganization = {
          id: data.id,
          name: data.name,
          slug: data.slug,
          avatarUrl: data.avatarUrl || null,
          role: "OWNER",
          subscriptionTier: data.subscriptionTier || "FREE",
          subscriptionStatus: data.subscriptionStatus || "INACTIVE",
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

  return {
    organizations,
    currentOrg,
    currentOrgId,
    orgDetails,
    isLoadingOrgs,
    isLoadingDetails,
    switchOrg,
    createOrg: createOrgMutation.mutateAsync,
    isCreating: createOrgMutation.isPending,
    hasOrganizations: organizations.length > 0,
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
    queryFn: async (): Promise<OrganizationMember[]> => {
      if (!orgId || !user?.access_token) return [];

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
