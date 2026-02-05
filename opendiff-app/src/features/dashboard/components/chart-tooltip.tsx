interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; name?: string; value?: number; color?: string }>;
  label?: string | number;
  labelFormatter?: (label: string) => string;
}

export function ChartTooltip({ active, payload, label, labelFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  const displayLabel = labelFormatter ? labelFormatter(String(label)) : label;

  return (
    <div className="rounded-xl bg-popover p-4 shadow-md dark:shadow-none">
      <p className="text-sm font-medium text-foreground">{displayLabel}</p>
      <div className="mt-1 space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <span className="size-3 rounded-full border-2" style={{ borderColor: entry.color }} />
            <span className="text-foreground text-xs">{entry.name}</span>
            <span className="ml-auto text-xs pl-6 font-medium text-foreground tabular-nums">{entry.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
