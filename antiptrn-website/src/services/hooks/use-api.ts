import { API_URL, getTokenFromStorage } from "../lib/fetch";

// Simple API helper hook for direct fetch calls
export function useApi() {
  const token = getTokenFromStorage();

  return {
    get: (path: string) =>
      fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    post: (path: string, body?: unknown) =>
      fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    put: (path: string, body?: unknown) =>
      fetch(`${API_URL}${path}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
    delete: (path: string) =>
      fetch(`${API_URL}${path}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }),
    upload: (path: string, formData: FormData) =>
      fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      }),
  };
}
