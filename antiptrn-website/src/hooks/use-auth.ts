import { useQuery, useQueryClient } from "@tanstack/react-query";

export type SubscriptionTier = "FREE" | "CODE_REVIEW" | "TRIAGE" | "BYOK";
export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "CANCELLED" | "PAST_DUE";
export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  role: OrganizationRole;
}

export interface User {
  id: number;
  visitorId?: string;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
  access_token?: string;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
  polarProductId?: string | null;
  cancelAtPeriodEnd?: boolean;
  organizations?: UserOrganization[];
  hasOrganizations?: boolean;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const STORAGE_KEY = "antiptrn_user";

function getStoredUser(): User | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return null;
}

function setStoredUser(user: User | null) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["auth", "user"],
    queryFn: getStoredUser,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const login = () => {
    window.location.href = `${API_URL}/auth/github`;
  };

  const logout = () => {
    setStoredUser(null);
    queryClient.setQueryData(["auth", "user"], null);
  };

  const setUser = (newUser: User | null) => {
    setStoredUser(newUser);
    queryClient.setQueryData(["auth", "user"], newUser);
  };

  const refreshSubscription = async () => {
    if (!user?.access_token) return;

    try {
      const response = await fetch(`${API_URL}/api/subscription/status`, {
        headers: { Authorization: `Bearer ${user.access_token}` },
      });

      if (response.ok) {
        const data = await response.json();
        const updatedUser = {
          ...user,
          subscriptionTier: data.subscriptionTier,
          subscriptionStatus: data.subscriptionStatus,
          polarProductId: data.polarProductId,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        };
        setStoredUser(updatedUser);
        queryClient.setQueryData(["auth", "user"], updatedUser);
      }
    } catch (error) {
      console.error("Failed to refresh subscription:", error);
    }
  };

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    setUser,
    refreshSubscription,
  };
}
