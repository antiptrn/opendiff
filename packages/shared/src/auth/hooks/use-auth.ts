import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountsStorage, User } from "../types";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const STORAGE_KEY = "opendiff_user";
const ACCOUNTS_STORAGE_KEY = "opendiff_accounts";

// Get unique identifier for a user (visitorId is the database ID)
// Always return string to avoid type mismatches in comparisons
function getUserId(user: User): string {
  return String(user.visitorId || user.id);
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

/** Provides authentication state and methods for login, logout, and multi-account management. */
export function useAuth() {
  const queryClient = useQueryClient();

  const { data: authData, isLoading } = useQuery({
    queryKey: ["auth", "accounts"],
    queryFn: () => {
      const storage = getStoredAccounts();
      const activeUser = storage.activeAccountId
        ? storage.accounts.find((a) => getUserId(a) === String(storage.activeAccountId)) || null
        : null;
      return {
        accounts: storage.accounts,
        activeUser,
      };
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  // Always use localStorage as source of truth for auth state
  // This ensures we never show stale state when localStorage has been updated
  // (e.g., after login, after adding accounts, after switching accounts)
  const storage = getStoredAccounts();
  const localStorageUser = storage.activeAccountId
    ? storage.accounts.find((a) => getUserId(a) === String(storage.activeAccountId)) || null
    : null;

  // Always use localStorage values to ensure immediate updates
  const user = localStorageUser ?? authData?.activeUser ?? null;
  const accounts = storage.accounts;

  const login = (redirectUrl?: string, turnstileToken?: string) => {
    const url = new URL(`${API_URL}/auth/github`);
    if (redirectUrl) {
      url.searchParams.set("redirectUrl", redirectUrl);
    }
    if (turnstileToken) {
      url.searchParams.set("turnstileToken", turnstileToken);
    }
    window.location.href = url.toString();
  };

  const loginWithGoogle = (redirectUrl?: string, turnstileToken?: string) => {
    const url = new URL(`${API_URL}/auth/google`);
    if (redirectUrl) {
      url.searchParams.set("redirectUrl", redirectUrl);
    }
    if (turnstileToken) {
      url.searchParams.set("turnstileToken", turnstileToken);
    }
    window.location.href = url.toString();
  };

  const loginWithMicrosoft = (redirectUrl?: string, turnstileToken?: string) => {
    const url = new URL(`${API_URL}/auth/microsoft`);
    if (redirectUrl) {
      url.searchParams.set("redirectUrl", redirectUrl);
    }
    if (turnstileToken) {
      url.searchParams.set("turnstileToken", turnstileToken);
    }
    window.location.href = url.toString();
  };

  // Mark that we're adding an account (call before login)
  const setAddingAccount = () => {
    sessionStorage.setItem("opendiff_add_account", "true");
  };

  // Switch to a different account
  const switchAccount = (accountId: string | number) => {
    const storage = getStoredAccounts();
    const stringId = String(accountId);
    const account = storage.accounts.find((a) => getUserId(a) === stringId);
    if (account) {
      storage.activeAccountId = stringId;
      setStoredAccounts(storage);

      // Clear the stored org ID since it belongs to the previous account
      localStorage.removeItem("opendiff_current_org");

      // Update auth state - this triggers OrganizationProvider remount via key change
      queryClient.setQueryData(["auth", "accounts"], {
        accounts: storage.accounts,
        activeUser: account,
      });
    }
  };

  // Remove an account from the list
  const removeAccount = (accountId: string | number) => {
    const storage = getStoredAccounts();
    const stringId = String(accountId);
    storage.accounts = storage.accounts.filter((a) => getUserId(a) !== stringId);

    // If removing the active account, switch to another or clear
    if (storage.activeAccountId === stringId) {
      storage.activeAccountId = storage.accounts.length > 0 ? getUserId(storage.accounts[0]) : null;
    }

    setStoredAccounts(storage);
    queryClient.setQueryData(["auth", "accounts"], {
      accounts: storage.accounts,
      activeUser: storage.activeAccountId
        ? storage.accounts.find((a) => getUserId(a) === String(storage.activeAccountId)) || null
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

    // Clear the adding account flag if it was set
    sessionStorage.removeItem("opendiff_add_account");

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
          // Backend returns `productId`; keep storing under the legacy key for now.
          polarProductId: data.productId ?? data.polarProductId,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        };
        setUser(updatedUser);
      }
    } catch (error) {
      console.error("Failed to refresh subscription:", error);
    }
  };

  // Refresh an account's access token using the stored refresh token
  // Returns the updated account with new token, or null if refresh failed
  const refreshAccountToken = async (account: User): Promise<User | null> => {
    // GitHub tokens don't expire, so no refresh needed
    if (account.auth_provider === "github") {
      return account;
    }

    const visitorId = account.visitorId || account.id;

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorId,
          authProvider: account.auth_provider,
        }),
      });

      if (!response.ok) {
        console.error("Token refresh failed:", await response.text());
        return null;
      }

      const data = await response.json();

      // Update the account with new token
      const updatedAccount: User = {
        ...account,
        access_token: data.access_token,
        hasGithubLinked: data.hasGithubLinked,
        accountType: data.accountType,
        onboardingCompletedAt: data.onboardingCompletedAt,
        personalOrgId: data.personalOrgId,
      };

      // Update in storage
      const storage = getStoredAccounts();
      const accountIndex = storage.accounts.findIndex((a) => getUserId(a) === String(visitorId));
      if (accountIndex >= 0) {
        storage.accounts[accountIndex] = updatedAccount;
        setStoredAccounts(storage);

        // Update query cache if this is the active user
        if (storage.activeAccountId === String(visitorId)) {
          queryClient.setQueryData(["auth", "accounts"], {
            accounts: storage.accounts,
            activeUser: updatedAccount,
          });
        }
      }

      return updatedAccount;
    } catch (error) {
      console.error("Token refresh error:", error);
      return null;
    }
  };

  return {
    user,
    accounts,
    isLoading,
    isAuthenticated: !!user,
    login,
    loginWithGoogle,
    loginWithMicrosoft,
    setAddingAccount,
    switchAccount,
    removeAccount,
    logout,
    logoutAll,
    setUser,
    refreshSubscription,
    refreshAccountToken,
  };
}
