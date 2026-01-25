export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

// Fetch helper with auth and org headers
export async function fetchWithAuth(
  url: string,
  token?: string,
  orgId?: string | null,
  options?: RequestInit
) {
  const headers: Record<string, string> = {
    ...((options?.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (orgId) {
    headers["X-Organization-Id"] = orgId;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(error.error || "Request failed");
  }

  return response.json();
}

// Helper to get token from storage (supports multi-account)
export function getTokenFromStorage(): string | undefined {
  // Try new multi-account storage first
  const accountsStored = localStorage.getItem("antiptrn_accounts");
  if (accountsStored) {
    try {
      const { accounts, activeAccountId } = JSON.parse(accountsStored);
      const activeUser = accounts.find(
        (a: { visitorId?: string; id: string | number }) =>
          String(a.visitorId || a.id) === String(activeAccountId)
      );
      if (activeUser?.access_token) return activeUser.access_token;
    } catch {
      // ignore
    }
  }

  // Fallback to old single-user storage
  const stored = localStorage.getItem("antiptrn_user");
  if (stored) {
    try {
      const user = JSON.parse(stored);
      return user.access_token;
    } catch {
      // ignore
    }
  }

  return undefined;
}
