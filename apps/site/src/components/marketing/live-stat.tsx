import NumberFlow from "@number-flow/react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "components";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

async function fetchPublicStats(): Promise<{ prsMerged: number }> {
  const response = await fetch(`${API_URL}/api/public/stats`);
  if (!response.ok) throw new Error(`Stats request failed: ${response.status}`);
  return response.json();
}

/**
 * Uppercase label with a monospace live count of pull requests merged with Contrast (after Ramp's
 * hero). Refreshes every minute; hidden until the real number has loaded.
 */
export function LiveStat() {
  const { data } = useQuery({
    queryKey: ["public-stats"],
    queryFn: fetchPublicStats,
    refetchInterval: 60_000,
    staleTime: 60_000,
    retry: 1,
  });

  if (data === undefined) return null;

  return (
    <div className="flex items-center justify-center gap-2.5">
      <p className="text-[11px] uppercase tracking-wide leading-none text-muted-foreground">
        Pull requests merged with Contrast
      </p>
      <Badge
        variant="secondary"
        className="leading-none font-mono tabular-nums text-[11px] h-auto py-px px-1 text-foreground"
      >
        <NumberFlow value={data.prsMerged} />
      </Badge>
    </div>
  );
}
