import {
  type ChartMetric,
  DashboardOverview,
  type TimeInterval,
} from "components/components/console";
import { useState } from "react";
import { useAuth } from "shared/auth";
import { useOrganization } from "shared/organizations";
import { useReviewsOverTime, useStats } from "../hooks";

export function ConsolePage() {
  const { user } = useAuth();
  const { currentOrgId } = useOrganization();
  const [chartMetric, setChartMetric] = useState<ChartMetric>("reviews");
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("day");
  const { data: stats, isLoading, error } = useStats(user?.access_token, currentOrgId);
  const { data: chart, isLoading: chartLoading } = useReviewsOverTime(
    user?.access_token,
    currentOrgId,
    timeInterval,
    chartMetric
  );

  return (
    <DashboardOverview
      stats={stats}
      isLoading={isLoading}
      error={error?.message}
      metric={chartMetric}
      onMetricChange={setChartMetric}
      chart={chart}
      chartLoading={chartLoading}
      interval={timeInterval}
      onIntervalChange={setTimeInterval}
    />
  );
}
