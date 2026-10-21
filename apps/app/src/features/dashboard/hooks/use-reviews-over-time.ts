import { useQuery } from "@tanstack/react-query";
import type {
  ChartMetric,
  ReviewsOverTimeResponse,
  TimeInterval,
} from "components/components/console";
import { API_URL, fetchWithAuth, queryKeys } from "shared/services";

/** Fetches time-series data for reviews, issues, or fixes over a given interval with period-over-period comparison. */
export function useReviewsOverTime(
  token?: string,
  orgId?: string | null,
  interval: TimeInterval = "day",
  metric: ChartMetric = "reviews"
) {
  return useQuery<ReviewsOverTimeResponse>({
    queryKey: [...queryKeys.stats(orgId), "reviews-over-time", interval, metric],
    queryFn: () =>
      fetchWithAuth(
        `${API_URL}/api/stats/reviews-over-time?interval=${interval}&metric=${metric}`,
        token,
        orgId
      ),
    enabled: !!token && !!orgId,
    staleTime: 60 * 1000, // 1 minute
  });
}
