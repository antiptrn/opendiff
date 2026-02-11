import { formatTokenQuota } from "shared/billing";

interface QuotaProgressProps {
  used: number;
  total: number;
}

/**
 * Progress bar showing quota usage
 */
export function QuotaProgress({ used, total }: QuotaProgressProps) {
  const percentage = Math.min(100, (used / total) * 100);

  return (
    <div className="pt-4 border-t">
      <p className="text-sm">
        {formatTokenQuota(used)} / {formatTokenQuota(total)} tokens used this cycle
      </p>
      <div className="w-full bg-muted rounded-full h-2 mt-2">
        <div
          className="bg-sidebar-primary h-2 rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
