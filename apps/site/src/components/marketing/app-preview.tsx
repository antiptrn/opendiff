import {
  AppSidebar,
  type ChartMetric,
  DashboardOverview,
  type DashboardStats,
  getConsoleNavGroups,
  NotificationButton,
  type ReviewsOverTimeResponse,
  type TimeInterval,
} from "components/components/console";
import { SidebarInset, SidebarProvider } from "components/components/ui/sidebar";
import { useMemo, useState } from "react";

const PREVIEW_STATS: DashboardStats = {
  connectedRepos: 24,
  totalRepos: 31,
  reviewCount: 1284,
  issuesFound: 3917,
  issuesFixed: 3260,
};

/** How big each metric runs per interval, so switching the pickers changes the chart believably */
const METRIC_SCALE: Record<ChartMetric, number> = { reviews: 1, issues: 3, fixes: 2.4 };
const INTERVAL_POINTS: Record<TimeInterval, { count: number; scale: number }> = {
  hour: { count: 24, scale: 0.15 },
  day: { count: 30, scale: 1 },
  week: { count: 12, scale: 6 },
  month: { count: 12, scale: 26 },
  year: { count: 5, scale: 300 },
};

/** Deterministic, gently rising sample series for the chart */
function previewChart(metric: ChartMetric, interval: TimeInterval): ReviewsOverTimeResponse {
  const { count, scale } = INTERVAL_POINTS[interval];
  const base = 40 * METRIC_SCALE[metric] * scale;
  const end = new Date(2026, 9, 20);
  const data = Array.from({ length: count }, (_, i) => {
    const wave = Math.sin(i * 0.9) * 0.18 + Math.sin(i * 0.37 + 1) * 0.12;
    const trend = 0.75 + (i / count) * 0.45;
    const date = new Date(end);
    date.setDate(end.getDate() - (count - 1 - i));
    return {
      label:
        interval === "hour"
          ? `${String(i).padStart(2, "0")}:00`
          : date.toLocaleString("en-US", { month: "short", day: "numeric" }),
      current: Math.round(base * (trend + wave)),
      previous: Math.round(base * (0.7 + wave * 0.6 - (i / count) * 0.05)),
    };
  });
  const start = new Date(end);
  start.setDate(end.getDate() - (count - 1));
  const previousEnd = new Date(start);
  previousEnd.setDate(start.getDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setDate(previousEnd.getDate() - (count - 1));
  return {
    data,
    interval,
    currentStart: start.toISOString(),
    currentEnd: end.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
  };
}

const NAV_GROUPS = getConsoleNavGroups();

/**
 * The console as it looks signed in, built from the same sidebar and dashboard components as the
 * app, with sample data. The pickers work; links stay put so the page doesn't navigate away.
 */
export function AppPreview() {
  const [metric, setMetric] = useState<ChartMetric>("reviews");
  const [interval, setInterval] = useState<TimeInterval>("day");
  const chart = useMemo(() => previewChart(metric, interval), [metric, interval]);

  return (
    <SidebarProvider keyboardShortcut={null} className="h-full min-h-0 overflow-hidden">
      <AppSidebar
        collapsible="none"
        navGroups={NAV_GROUPS}
        pathname="/console"
        userName="Ada Lovelace"
        organizationName="Acme"
        footerAction={<NotificationButton hasUnread />}
        // biome-ignore lint/a11y/useAnchorContent: the sidebar fills in each link's label and icon
        renderLink={(href) => <a href={href} onClick={(event) => event.preventDefault()} />}
      />
      <SidebarInset className="min-h-0 overflow-y-auto">
        <DashboardOverview
          disabled
          stats={PREVIEW_STATS}
          metric={metric}
          onMetricChange={setMetric}
          chart={chart}
          interval={interval}
          onIntervalChange={setInterval}
        />
      </SidebarInset>
    </SidebarProvider>
  );
}
