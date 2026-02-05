import { useQuery } from "@tanstack/react-query";
import { API_URL, fetchWithAuth, queryKeys } from "opendiff-shared/services";

export type TimeInterval = "hour" | "day" | "week" | "month" | "year";

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

export function useReviewsOverTime(
  token?: string,
  orgId?: string | null,
  interval: TimeInterval = "day"
) {
  return useQuery<ReviewsOverTimeResponse>({
    queryKey: [...queryKeys.stats(orgId), "reviews-over-time", interval],
    queryFn: () =>
      fetchWithAuth(`${API_URL}/api/stats/reviews-over-time?interval=${interval}`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 60 * 1000, // 1 minute
  });
}
