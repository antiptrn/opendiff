import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { API_URL, fetchWithAuth } from "opendiff-shared/services";

const NOTIFICATIONS_LIMIT = 10;

export interface Notification {
  id: string;
  organizationId: string;
  type: "REVIEW_STARTED" | "REVIEW_COMPLETED" | "FIX_APPLIED" | "FIX_FAILED" | "REPO_ADDED";
  title: string;
  body: string;
  reviewId: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function useNotifications(token?: string, orgId?: string | null) {
  return useInfiniteQuery({
    queryKey: ["notifications", orgId] as const,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        limit: String(NOTIFICATIONS_LIMIT),
      });
      return fetchWithAuth(
        `${API_URL}/api/notifications?${params}`,
        token,
        orgId
      ) as Promise<NotificationsResponse>;
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.pagination.page < lastPage.pagination.totalPages) {
        return lastPage.pagination.page + 1;
      }
      return undefined;
    },
    enabled: !!token && !!orgId,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

export function useMarkNotificationRead(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const response = await fetch(`${API_URL}/api/notifications/${notificationId}/read`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to mark notification as read");
      }
      return data;
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });

      const now = new Date().toISOString();
      queryClient.setQueriesData<InfiniteData<NotificationsResponse>>(
        { queryKey: ["notifications"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => {
              const wasUnread = page.notifications.some(
                (n) => n.id === notificationId && !n.readAt
              );
              return {
                ...page,
                unreadCount: wasUnread ? Math.max(0, page.unreadCount - 1) : page.unreadCount,
                notifications: page.notifications.map((n) =>
                  n.id === notificationId ? { ...n, readAt: n.readAt ?? now } : n
                ),
              };
            }),
          };
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useMarkAllRead(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_URL}/api/notifications/read-all`, {
        method: "POST",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to mark all as read");
      }
      return data;
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["notifications"] });

      const now = new Date().toISOString();
      queryClient.setQueriesData<InfiniteData<NotificationsResponse>>(
        { queryKey: ["notifications"] },
        (old) => {
          if (!old) return old;
          return {
            ...old,
            pages: old.pages.map((page) => ({
              ...page,
              unreadCount: 0,
              notifications: page.notifications.map((n) => ({
                ...n,
                readAt: n.readAt ?? now,
              })),
            })),
          };
        }
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}
