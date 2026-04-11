import { useMutation } from "@tanstack/react-query";
import { API_URL, getTokenFromStorage } from "shared/services";

/** Exports all account data for the authenticated user. */
export function useExportData(token?: string, orgId?: string | null) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/account/export`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to export data");
      }

      return data;
    },
  });
}

/** Permanently deletes the authenticated user's account. */
export function useDeleteAccount(token?: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/account`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      // Handle non-JSON responses (e.g., plain text error messages)
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || "Failed to delete account");
        }
        return { success: true };
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      return data;
    },
  });
}

/** Updates the account type between SOLO and TEAM modes. */
export function useUpdateAccountType() {
  const token = getTokenFromStorage();

  return useMutation({
    mutationFn: async (accountType: "SOLO" | "TEAM") => {
      const response = await fetch(`${API_URL}/api/account/type`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ accountType }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update account type");
      }

      return data as { success: boolean; accountType: "SOLO" | "TEAM" };
    },
  });
}

/** Initiates GitHub account linking for users authenticated via Google. */
export function useLinkGitHub(token?: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/auth/github/link`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to get GitHub link URL");
      }

      return data as { url: string };
    },
  });
}

/** Unlinks a previously connected GitHub account from the user's profile. */
export function useUnlinkGitHub(token?: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/auth/github/unlink`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to unlink GitHub account");
      }

      return data as { success: boolean };
    },
  });
}
