import { ErrorAlert } from "../ui/alert";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

export interface DashboardStats {
  reviewCount: number;
  connectedRepos: number;
  totalRepos: number;
  issuesFound: number;
  issuesFixed: number;
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
          <p className="text-sm font-normal text-muted-foreground leading-none truncate">{label}</p>
          {value === undefined ? (
            <Skeleton muted className="h-6 w-16 rounded-md" />
          ) : (
            <h3 className="text-2xl leading-none truncate">{value.toLocaleString("en-US")}</h3>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** The dashboard's headline stats, with an error above them if they failed to load */
export function DashboardStatCards({
  stats,
  isLoading = false,
  error,
}: {
  stats?: DashboardStats;
  isLoading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="grid gap-2">
      {error && <ErrorAlert>{error}</ErrorAlert>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {(isLoading || stats) &&
          STAT_CARDS.map(({ label, key }) => (
            <StatCard key={key} label={label} value={isLoading ? undefined : stats?.[key]} />
          ))}
      </div>
    </div>
  );
}

/**
 * Console dashboard overview: the headline stats. Takes its data as props, so it
 * renders the same in the console and in previews.
 */
export function DashboardOverview({
  stats,
  isLoading = false,
  error,
}: {
  stats?: DashboardStats;
  isLoading?: boolean;
  error?: string | null;
}) {
  return (
    <div className="mx-auto w-full max-w-7xl p-4">
      <DashboardStatCards stats={stats} isLoading={isLoading} error={error} />
    </div>
  );
}
