import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_URL, fetchWithAuth } from "shared/services";
import { queryKeys } from "shared/services";

/** Details of a suggested code fix attached to a pull request comment. */
export interface PullRequestFixDetail {
  id: string;
  commentId: string;
  status: "PENDING" | "WAITING_FOR_USER" | "APPLYING" | "ACCEPTED" | "FAILED" | "REJECTED";
  diff: string | null;
  commitSha: string | null;
  summary: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A single pull request comment with optional file path, line number, and fix. */
export interface PullRequestCommentDetail {
  id: string;
  reviewId: string;
  githubCommentId: number | null;
  body: string;
  path: string | null;
  line: number | null;
  side: string | null;
  fix: PullRequestFixDetail | null;
  createdAt: string;
}

/** Summary of a pull request review including comment and fix counts. */
export interface PullRequestSummary {
  id: string;
  owner: string;
  repo: string;
  pullNumber: number;
  pullTitle: string | null;
  pullUrl: string | null;
  pullAuthor: string | null;
  authorAvatarUrl: string | null;
  /** From GitHub; null when it couldn't be asked */
  state: "open" | "closed" | "merged" | null;
  draft: boolean;
  labels: Array<{ name: string; color: string }>;
  /** Conversation and inline comments on GitHub; null when GitHub couldn't be asked */
  githubCommentCount: number | null;
  /** When the pull request was opened on GitHub */
  openedAt: string | null;
  reviewType: string;
  commentCount: number;
  fixCount: number;
  acceptedCount: number;
  rejectedCount: number;
  pendingCount: number;
  createdAt: string;
}

/** Paginated response for the pull requests list endpoint. */
export interface PullRequestListResponse {
  reviews: PullRequestSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  /** Open and closed pull requests matching the author, repository and text filters */
  counts: { open: number; closed: number };
  /** Every author and repository in the list, for the filter menus */
  facets: { authors: string[]; repos: string[] };
}

export type PullRequestStateFilter = "open" | "closed" | "all";
export type PullRequestSort = "reviewed" | "newest" | "oldest" | "issues" | "comments";

/** What the pull request list is narrowed and ordered by */
export interface PullRequestFilters {
  page?: number;
  state?: PullRequestStateFilter;
  authors?: string[];
  repos?: string[];
  q?: string;
  sort?: PullRequestSort;
}

/** Full pull request detail including PR metadata, summary, and all comments. */
export interface PullRequestDetailResponse {
  review: {
    id: string;
    owner: string;
    repo: string;
    pullNumber: number;
    pullTitle: string | null;
    pullUrl: string | null;
    pullAuthor: string | null;
    pullBody: string | null;
    headBranch: string | null;
    baseBranch: string | null;
    pullStatus: string | null;
    assignees: string[];
    labels: string[];
    reviewType: string;
    organizationId: string | null;
    summary: string | null;
    summaryStatus: number;
    fileTitles: Record<string, string> | null;
    fileTitlesStatus: number;
    createdAt: string;
    comments: PullRequestCommentDetail[];
  };
}

/** Fetches a paginated list of pull requests for the current organization, optionally filtered by repo. */
export function usePullRequests(
  token?: string,
  orgId?: string | null,
  filters: PullRequestFilters = {}
) {
  const params = new URLSearchParams({ page: String(filters.page ?? 1) });
  if (filters.state) params.set("state", filters.state);
  if (filters.authors?.length) params.set("author", filters.authors.join(","));
  if (filters.repos?.length) params.set("repos", filters.repos.join(","));
  if (filters.q) params.set("q", filters.q);
  if (filters.sort) params.set("sort", filters.sort);
  const query = params.toString();

  return useQuery<PullRequestListResponse>({
    queryKey: queryKeys.reviews(orgId, query),
    queryFn: () => fetchWithAuth(`${API_URL}/api/reviews?${query}`, token, orgId),
    enabled: !!token && !!orgId,
    staleTime: 30 * 1000,
    // Keep the current list up while a new filter loads, so the header and rows don't jump
    placeholderData: (previous) => previous,
  });
}

/** Fetches full pull request detail by ID, auto-polling while summary generation is in progress. */
export function usePullRequestDetail(token?: string, orgId?: string | null, reviewId?: string) {
  return useQuery<PullRequestDetailResponse>({
    queryKey: queryKeys.reviewDetail(orgId, reviewId),
    queryFn: () => fetchWithAuth(`${API_URL}/api/reviews/${reviewId}`, token, orgId),
    enabled: !!token && !!orgId && !!reviewId,
    staleTime: 15 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      const r = data?.review;
      if ((r?.summaryStatus === 1 && !r.summary) || (r?.fileTitlesStatus === 1 && !r.fileTitles)) {
        return 3000;
      }
      return false;
    },
  });
}

/** Mutation hook for updating a pull request's assignees or labels. */
export function useUpdatePullRequest(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reviewId,
      assignees,
      labels,
    }: { reviewId: string; assignees?: string[]; labels?: string[] }) => {
      const response = await fetch(`${API_URL}/api/reviews/${reviewId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
        body: JSON.stringify({ assignees, labels }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to update pull request");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewDetail"] });
    },
  });
}

/** Mutation hook for accepting a suggested fix and committing it to the PR branch. */
export function useAcceptFix(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reviewId, fixId }: { reviewId: string; fixId: string }) => {
      const response = await fetch(`${API_URL}/api/reviews/${reviewId}/fixes/${fixId}/accept`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to accept fix");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewDetail"] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}

/** Mutation hook for rejecting a suggested fix. */
export function useRejectFix(token?: string, orgId?: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ reviewId, fixId }: { reviewId: string; fixId: string }) => {
      const response = await fetch(`${API_URL}/api/reviews/${reviewId}/fixes/${fixId}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(orgId ? { "X-Organization-Id": orgId } : {}),
        },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to reject fix");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reviewDetail"] });
      queryClient.invalidateQueries({ queryKey: ["reviews"] });
    },
  });
}
