import { useQuery } from "@tanstack/react-query";
import { API_URL, fetchWithAuth, queryKeys } from "shared/services";
import type { AuditLogsResponse } from "../types";

/** Fetches paginated audit logs for the organization, optionally filtered by search term or action type. */
export function useAuditLogs(
  token?: string,
  orgId?: string | null,
  options?: { page?: number; search?: string; action?: string }
) {
  const page = options?.page ?? 1;
  const search = options?.search ?? "";
  const action = options?.action ?? "";

  return useQuery<AuditLogsResponse>({
    queryKey: queryKeys.auditLogs(orgId, page, search, action),
    queryFn: async () => {
      const url = new URL(`${API_URL}/api/organizations/${orgId}/audit-logs`);
      url.searchParams.set("page", page.toString());
      url.searchParams.set("limit", "50");
      if (search) url.searchParams.set("search", search);
      if (action) url.searchParams.set("action", action);
      return fetchWithAuth(url.toString(), token);
    },
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
  });
}
