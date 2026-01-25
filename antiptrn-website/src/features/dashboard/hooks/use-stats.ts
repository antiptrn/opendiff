import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth, API_URL, queryKeys } from "@services";
import type { Stats } from "../types";

export function useStats(token?: string, orgId?: string | null) {
  return useQuery<Stats>({
    queryKey: queryKeys.stats(orgId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/stats`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000, // 30 seconds
  });
}
