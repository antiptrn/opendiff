import { useQuery, useQueryClient } from "@tanstack/react-query";

export type SubscriptionTier = "FREE" | "CODE_REVIEW" | "TRIAGE" | "BYOK";
export type SubscriptionStatus = "INACTIVE" | "ACTIVE" | "CANCELLED" | "PAST_DUE";
export type OrganizationRole = "OWNER" | "ADMIN" | "MEMBER";
export type AccountType = "SOLO" | "TEAM";

export interface SeatInfo {
  tier: SubscriptionTier;
  status: SubscriptionStatus | null;
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface UserOrganization {
  id: string;
  name: string;
  slug: string;
  avatarUrl: string | null;
  role: OrganizationRole;
  isPersonal?: boolean;  // True for solo user's auto-created org
  // Per-seat subscription info
  seat: SeatInfo | null;
}

export type AuthProvider = "github" | "google";

export interface User {
  id: number | string;
  visitorId?: string;
  login: string;
  name: string | null;
  avatar_url: string;
  email: string | null;
  access_token?: string;
  auth_provider?: AuthProvider;
  hasGithubLinked?: boolean;  // For Google users who have linked their GitHub
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
  polarProductId?: string | null;
  cancelAtPeriodEnd?: boolean;
  accountType?: AccountType | null;
  onboardingCompletedAt?: string | null;
  personalOrgId?: string | null;  // The org created for solo users (hidden from switcher)
  organizations?: UserOrganization[];
  hasOrganizations?: boolean;
}

// Multi-account storage structure
interface AccountsStorage {
  accounts: User[];
  activeAccountId: string | number | null;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const STORAGE_KEY = "antiptrn_user";
const ACCOUNTS_STORAGE_KEY = "antiptrn_accounts";

// Get unique identifier for a user (visitorId is the database ID)
function getUserId(user: User): string | number {
  return user.visitorId || user.id;
}

// Migrate from old single-user storage to new multi-account storage
function migrateStorage(): AccountsStorage {
  const oldStorage = localStorage.getItem(STORAGE_KEY);
  if (oldStorage) {
    try {
      const user = JSON.parse(oldStorage) as User;
      const accounts: AccountsStorage = {
        accounts: [user],
        activeAccountId: getUserId(user),
      };
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
      localStorage.removeItem(STORAGE_KEY);
      return accounts;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }
  return { accounts: [], activeAccountId: null };
}

function getStoredAccounts(): AccountsStorage {
  const stored = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      localStorage.removeItem(ACCOUNTS_STORAGE_KEY);
    }
  }
  // Check for old storage format and migrate
  return migrateStorage();
}

function setStoredAccounts(accounts: AccountsStorage) {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function getActiveUser(): User | null {
  const { accounts, activeAccountId } = getStoredAccounts();
  if (!activeAccountId) return null;
  return accounts.find((a) => getUserId(a) === activeAccountId) || null;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: authData, isLoading } = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: () => {
      const storage = getStoredAccounts();
      const activeUser = storage.activeAccountId
        ? storage.accounts.find((a) => getUserId(a) === storage.activeAccountId) || null
        : null;
      return {
        accounts: storage.accounts,
        activeUser,
      };
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });

  const user = authData?.activeUser ?? null;
  const accounts = authData?.accounts ?? [];

  const login = (redirectUrl?: string) => {
    const url = new URL(`${API_URL}/auth/github`);
    if (redirectUrl) {
      url.searchParams.set("redirectUrl", redirectUrl);
    }
    window.location.href = url.toString();
  };

  const loginWithGoogle = (redirectUrl?: string) => {
    const url = new URL(`${API_URL}/auth/google`);
    if (redirectUrl) {
      url.searchParams.set("redirectUrl", redirectUrl);
    }
    window.location.href = url.toString();
  };

  // Mark that we're adding an account (call before login)
  const setAddingAccount = () => {
    sessionStorage.setItem("antiptrn_add_account", "true");
  };

  // Switch to a different account
  const switchAccount = (accountId: string | number) => {
    const storage = getStoredAccounts();
    const account = storage.accounts.find((a) => getUserId(a) === accountId);
    if (account) {
      storage.activeAccountId = accountId;
      setStoredAccounts(storage);
      queryClient.setQueryData(["auth", "accounts"], {
        accounts: storage.accounts,
        activeUser: account,
      });
      // Invalidate org-related queries when switching accounts
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["orgRepos"] });
      queryClient.invalidateQueries({ queryKey: ["activatedRepos"] });
      queryClient.invalidateQueries({ queryKey: ["billing"] });
    }
  };

  // Remove an account from the list
  const removeAccount = (accountId: string | number) => {
    const storage = getStoredAccounts();
    storage.accounts = storage.accounts.filter((a) => getUserId(a) !== accountId);

    // If removing the active account, switch to another or clear
    if (storage.activeAccountId === accountId) {
      storage.activeAccountId = storage.accounts.length > 0
        ? getUserId(storage.accounts[0])
        : null;
    }

    setStoredAccounts(storage);
    queryClient.setQueryData(["auth", "accounts"], {
      accounts: storage.accounts,
      activeUser: storage.activeAccountId
        ? storage.accounts.find((a) => getUserId(a) === storage.activeAccountId) || null
        : null,
    });
  };

  // Logout current account (remove from list)
  const logout = () => {
    if (user) {
      removeAccount(getUserId(user));
    }
  };

  // Logout all accounts
  const logoutAll = () => {
    setStoredAccounts({ accounts: [], activeAccountId: null });
    queryClient.setQueryData(["auth", "accounts"], {
      accounts: [],
      activeUser: null,
    });
  };

  // Set/update the current user (used by auth callback)
  const setUser = (newUser: User | null) => {
    if (!newUser) {
      logout();
      return;
    }

    const storage = getStoredAccounts();
    const userId = getUserId(newUser);
    const existingIndex = storage.accounts.findIndex((a) => getUserId(a) === userId);

    // Check if we're adding a new account
    const isAddingAccount = sessionStorage.getItem("antiptrn_add_account") === "true";
    sessionStorage.removeItem("antiptrn_add_account");

    if (existingIndex >= 0) {
      // Update existing account
      storage.accounts[existingIndex] = newUser;
    } else {
      // Add new account
      storage.accounts.push(newUser);
    }

    // Set as active account
    storage.activeAccountId = userId;

    setStoredAccounts(storage);
    queryClient.setQueryData(["auth", "accounts"], {
      accounts: storage.accounts,
      activeUser: newUser,
    });
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
        setUser(updatedUser);
      }
    } catch (error) {
      console.error("Failed to refresh subscription:", error);
    }
  };

  return {
    user,
    accounts,
    isLoading,
    isAuthenticated: !!user,
    login,
    loginWithGoogle,
    setAddingAccount,
    switchAccount,
    removeAccount,
    logout,
    logoutAll,
    setUser,
    refreshSubscription,
  };
}
