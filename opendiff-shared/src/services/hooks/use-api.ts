import { API_URL, getTokenFromStorage } from "../fetch";

/** Provides authenticated HTTP methods (get, post, put, delete, upload) bound to the API base URL. */
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
