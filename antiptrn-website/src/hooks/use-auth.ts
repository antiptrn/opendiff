import { useQuery, useQueryClient } from "@tanstack/react-query";

export type SubscriptionTier = "FREE" | "CODE_REVIEW" | "TRIAGE";
export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "CANCELLED" | "PAST_DUE";

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

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    setUser,
  };
}
