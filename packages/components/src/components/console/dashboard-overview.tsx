import { ErrorAlert } from "../ui/alert";
import { Card, CardContent } from "../ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { PageTitle } from "./page-title";
import {
  type ChartMetric,
  type ReviewsOverTimeResponse,
  ReviewsChartView,
  type TimeInterval,
} from "./reviews-chart-view";

export interface DashboardStats {
  reviewCount: number;
  connectedRepos: number;
  totalRepos: number;
  issuesFound: number;
  issuesFixed: number;
}

interface DashboardOverviewProps {
  stats?: DashboardStats;
  /** Shows the metric and interval pickers without letting them open, such as in a preview */
  disabled?: boolean;
  isLoading?: boolean;
  error?: string | null;
  metric: ChartMetric;
  onMetricChange: (metric: ChartMetric) => void;
  chart?: ReviewsOverTimeResponse;
  chartLoading?: boolean;
  interval: TimeInterval;
  onIntervalChange: (interval: TimeInterval) => void;
}

const STAT_CARDS: { label: string; key: keyof DashboardStats }[] = [
  { label: "Repositories", key: "connectedRepos" },
  { label: "Reviews Completed", key: "reviewCount" },
  { label: "Issues Found", key: "issuesFound" },
  { label: "Issues Fixed", key: "issuesFixed" },
];

/** One headline number; while loading, a skeleton of the same size holds its place */
function StatCard({ label, value }: { label: string; value?: number }) {
  return (
    <Card>
      <CardContent>
        <div className="flex flex-col items-start gap-4">
          <p className="text-sm font-normal text-muted-foreground leading-none">{label}</p>
          {value === undefined ? (
            <Skeleton muted className="h-6 w-16 rounded-md" />
          ) : (
            <h3 className="text-2xl leading-none">{value.toLocaleString("en-US")}</h3>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Console dashboard: headline stats and the metric chart. Takes its data as props, so it renders
 * the same in the console and in previews.
 */
export function DashboardOverview({
  stats,
  isLoading = false,
  error,
  metric,
  onMetricChange,
  chart,
  chartLoading = false,
  interval,
  onIntervalChange,
  disabled = false,
}: DashboardOverviewProps) {
  return (
    <div className="p-8">
      <PageTitle>Dashboard</PageTitle>
      <div className="grid gap-2">
        {error && <ErrorAlert>{error}</ErrorAlert>}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4">
          {(isLoading || stats) &&
            STAT_CARDS.map(({ label, key }) => (
              <StatCard key={key} label={label} value={isLoading ? undefined : stats?.[key]} />
            ))}
        </div>
        <Select
          value={metric}
          onValueChange={(v) => onMetricChange(v as ChartMetric)}
          disabled={disabled}
        >
          <SelectTrigger
            size="title"
            className="mb-3 w-fit !bg-transparent !ring-0 enabled:hover:text-muted-foreground disabled:cursor-default disabled:opacity-100"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="reviews">Reviews</SelectItem>
              <SelectItem value="issues">Issues</SelectItem>
              <SelectItem value="fixes">Fixes</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <ReviewsChartView
          disabled={disabled}
          data={chart}
          isLoading={chartLoading}
          interval={interval}
          onIntervalChange={onIntervalChange}
        />
      </div>
    </div>
  );
}
