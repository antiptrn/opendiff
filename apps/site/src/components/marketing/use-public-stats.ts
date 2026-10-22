import { useQuery } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

/** Platform-wide totals, counted live from Contrast's database */
export interface PublicStats {
  prsMerged: number;
  issuesFound: number;
  fixesCommitted: number;
}

async function fetchPublicStats(): Promise<PublicStats> {
  const response = await fetch(`${API_URL}/api/public/stats`);
  if (!response.ok) throw new Error(`Stats request failed: ${response.status}`);
  return response.json();
}

/** The site's live totals, shared by every section that shows them and refreshed every minute */
export function usePublicStats() {
  return useQuery({
    queryKey: ["public-stats"],
    queryFn: fetchPublicStats,
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 1,
  });
}
