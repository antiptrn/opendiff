import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth, API_URL, queryKeys } from "@services";
import type { AuditLogsResponse } from "../types";

// Audit logs hook
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
