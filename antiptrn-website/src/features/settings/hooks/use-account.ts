import { useMutation } from "@tanstack/react-query";
import { API_URL, getTokenFromStorage } from "@services";

// Account management hooks
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

export function useDeleteAccount(token?: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/account`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to delete account");
      }

      return data;
    },
  });
}

// Hook for updating account type
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

// GitHub linking hook for Google users
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

// GitHub unlinking hook for Google users
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
