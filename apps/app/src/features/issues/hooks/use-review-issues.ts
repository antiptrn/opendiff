import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { API_URL, fetchWithAuth, queryKeys } from "shared/services";
import type { TablePagination } from "@/components/paginated-table";
import type { PullRequestFixDetail } from "@/features/pull-requests";

/** One issue a review flagged, with where it is and the state of its fix */
export interface ReviewIssue {
  id: string;
  reviewId: string;
  title: string;
  path: string | null;
  line: number | null;
  owner: string | null;
  repo: string | null;
  pullNumber: number;
  fixStatus: PullRequestFixDetail["status"] | null;
  createdAt: string;
}

/** Open issues have no fix yet or one still in progress; closed ones had their fix accepted or rejected */
export type ReviewIssueStatus = "open" | "closed";

/** Fetches one page of issues found in reviews for the current organization, newest first,
 * optionally only open or closed ones, and matching `search` against the issue text, file path
 * or repository */
export function useReviewIssues(
  token?: string,
  orgId?: string | null,
  page = 1,
  search = "",
  status?: ReviewIssueStatus
) {
  return useQuery<{ issues: ReviewIssue[]; pagination: TablePagination }>({
    queryKey: queryKeys.reviewIssues(orgId, page, search, status),
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("q", search);
      if (status) params.set("status", status);
      return fetchWithAuth(`${API_URL}/api/review-issues?${params}`, token, orgId);
    },
    enabled: !!token && !!orgId,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
}
