import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  usePullRequests,
  usePullRequestDetail,
  useAcceptFix,
  useRejectFix,
} from "./use-pull-requests";
import { createWrapper } from "@/test/test-utils";

vi.mock("opendiff-shared/services", () => ({
  fetchWithAuth: vi.fn(),
  API_URL: "http://localhost:3001",
  queryKeys: {
    reviews: (orgId?: string | null, page?: number, repo?: string) =>
      ["reviews", orgId, page, repo] as const,
    reviewDetail: (orgId?: string | null, reviewId?: string) =>
      ["reviewDetail", orgId, reviewId] as const,
  },
}));

describe("usePullRequests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch when token is missing", () => {
    const { result } = renderHook(() => usePullRequests(undefined, "org-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it("does not fetch when orgId is missing", () => {
    const { result } = renderHook(() => usePullRequests("token", null), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it("fetches reviews when token and orgId are provided", async () => {
    const mockResponse = {
      reviews: [
        {
          id: "review-1",
          owner: "org",
          repo: "repo",
          pullNumber: 1,
          pullTitle: "Test PR",
          commentCount: 3,
          fixCount: 1,
          createdAt: "2025-01-01",
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    };

    const { fetchWithAuth } = await import("opendiff-shared/services");
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(mockResponse);

    const { result } = renderHook(() => usePullRequests("test-token", "org-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockResponse);
    });
  });
});

describe("usePullRequestDetail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("does not fetch when reviewId is missing", () => {
    const { result } = renderHook(() => usePullRequestDetail("token", "org-1", undefined), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it("fetches review detail when all params provided", async () => {
    const mockDetail = {
      review: {
        id: "review-1",
        owner: "org",
        repo: "repo",
        pullNumber: 1,
        pullTitle: "Test PR",
        comments: [],
        summary: "AI summary",
        summaryStatus: 2,
      },
    };

    const { fetchWithAuth } = await import("opendiff-shared/services");
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(mockDetail);

    const { result } = renderHook(() => usePullRequestDetail("test-token", "org-1", "review-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockDetail);
    });
  });
});

describe("useAcceptFix", () => {
  it("returns a mutation function", () => {
    const { result } = renderHook(() => useAcceptFix("token", "org-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutateAsync).toBeDefined();
    expect(result.current.isPending).toBe(false);
  });
});

describe("useRejectFix", () => {
  it("returns a mutation function", () => {
    const { result } = renderHook(() => useRejectFix("token", "org-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutateAsync).toBeDefined();
    expect(result.current.isPending).toBe(false);
  });
});
