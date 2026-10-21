import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card, CardContent, CardHeader } from "../ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { ChartTooltip } from "./chart-tooltip";

export type TimeInterval = "hour" | "day" | "week" | "month" | "year";
export type ChartMetric = "reviews" | "issues" | "fixes";

export interface ReviewsOverTimeData {
  label: string;
  current: number;
  previous: number;
}

export interface ReviewsOverTimeResponse {
  data: ReviewsOverTimeData[];
  interval: TimeInterval;
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
}

interface ReviewsChartViewProps {
  data?: ReviewsOverTimeResponse;
  /** Shows the interval picker without letting it open, such as in a preview */
  disabled?: boolean;
  isLoading?: boolean;
  interval: TimeInterval;
  onIntervalChange: (interval: TimeInterval) => void;
}

function formatRangeLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const fmt = (d: Date, includeYear: boolean) => {
    const month = d.toLocaleString("en-US", { month: "short" });
    const day = d.getDate();
    return includeYear ? `${month} ${day}, ${d.getFullYear()}` : `${month} ${day}`;
  };
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${fmt(start, !sameYear)} – ${fmt(end, true)}`;
}

/**
 * Area chart comparing the current and previous period of a review metric, with an interval picker.
 * Takes its data as props, so it renders the same in the console and in previews.
 */
export function ReviewsChartView({
  data,
  isLoading = false,
  interval,
  onIntervalChange,
  disabled = false,
}: ReviewsChartViewProps) {
  const currentLabel = data ? formatRangeLabel(data.currentStart, data.currentEnd) : "";
  const previousLabel = data ? formatRangeLabel(data.previousStart, data.previousEnd) : "";

  // Add numeric index for proper x-axis positioning
  const chartData = (data?.data || []).map((d, i) => ({ ...d, index: i }));
  const maxIndex = Math.max(0, chartData.length - 1);

  // Calculate tick positions with exactly equal gaps
  const xTicks = (() => {
    if (chartData.length <= 7) return chartData.map((_, i) => i);

    // Find number of gaps that divides evenly into maxIndex, giving 5-8 ticks
    const targetTicks = [7, 6, 5, 8]; // Preferred tick counts
    for (const numTicks of targetTicks) {
      const numGaps = numTicks - 1;
      if (maxIndex % numGaps === 0) {
        const gap = maxIndex / numGaps;
        return Array.from({ length: numTicks }, (_, i) => i * gap);
      }
    }

    // Fallback
    return Array.from({ length: 7 }, (_, i) => Math.round((i * maxIndex) / 6));
  })();

  // Format tick value to label
  const formatTick = (index: number) => chartData[index]?.label || "";

  return (
    <Card className="pb-2">
      <CardHeader className="flex flex-row items-start justify-between -mb-1">
        <Select
          value={interval}
          onValueChange={(v) => onIntervalChange(v as TimeInterval)}
          disabled={disabled}
        >
          <SelectTrigger
            size="label"
            className="mb-2 !bg-transparent !ring-0 enabled:hover:text-muted-foreground disabled:cursor-default disabled:opacity-100"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="hour">Hourly</SelectItem>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
              <SelectItem value="year">Yearly</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2">
        {isLoading ? (
          <>
            {/* Same sizes as the legend and chart below, so nothing moves once data arrives */}
            <Skeleton muted className="mb-6 ml-4 h-5 w-64 rounded-lg" />
            <div className="w-full p-6">
              <Skeleton muted className="h-[300px] w-full rounded-3xl" />
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-6 pb-6 pl-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded-full border-2 border-[var(--yellow)]" />
                <span className="text-muted-foreground">{currentLabel}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="size-3.5 rounded-full border-2 border-[var(--chart-grid)]" />
                <span className="text-muted-foreground">{previousLabel}</span>
              </div>
            </div>
            <div className="w-full p-6 bg-background">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: -6 }}>
                  <defs>
                    <linearGradient id="colorCurrent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--yellow)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--yellow)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 8"
                    horizontal={false}
                    stroke="var(--chart-grid)"
                  />
                  <XAxis
                    dataKey="index"
                    type="number"
                    domain={[0, maxIndex]}
                    scale="linear"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "currentColor", fontSize: 12 }}
                    tickMargin={8}
                    ticks={xTicks}
                    tickFormatter={formatTick}
                    allowDataOverflow={false}
                  />

                  <Tooltip
                    cursor={{ stroke: "var(--chart-grid)", strokeWidth: 1 }}
                    content={
                      <ChartTooltip
                        labelFormatter={(index) => chartData[Number(index)]?.label || ""}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="previous"
                    name={previousLabel}
                    stroke="var(--chart-grid)"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    fillOpacity={0}
                    fill="transparent"
                    activeDot={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="current"
                    name={currentLabel}
                    stroke="var(--yellow)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorCurrent)"
                    activeDot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
