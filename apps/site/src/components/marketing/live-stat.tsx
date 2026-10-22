import NumberFlow from "@number-flow/react";
import { Badge } from "components";
import { usePublicStats } from "./use-public-stats";

/**
 * Uppercase label with a monospace live count of pull requests merged with Contrast (after Ramp's
 * hero). Refreshes every minute; hidden until the real number has loaded.
 */
export function LiveStat() {
  const { data } = usePublicStats();

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
