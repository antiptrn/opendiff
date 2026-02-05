import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useRepositories } from "./use-repositories";
import { createWrapper } from "@/test/test-utils";

vi.mock("opendiff-shared/services", () => ({
  fetchWithAuth: vi.fn(),
  API_URL: "http://localhost:3001",
  queryKeys: {
    repos: (orgId?: string | null, query?: string) => ["repos", orgId, query] as const,
    activatedRepos: (orgId?: string | null) => ["activatedRepos", orgId] as const,
    orgRepos: (orgId?: string | null, query?: string) => ["orgRepos", orgId, query] as const,
    orgRepo: (orgId?: string | null, owner?: string, repo?: string) =>
      ["orgRepo", orgId, owner, repo] as const,
    settings: (owner: string, repo: string) => ["settings", owner, repo] as const,
  },
}));

describe("useRepositories", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty data when disabled (no token)", () => {
    const { result } = renderHook(() => useRepositories(undefined, "org-1"), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it("returns empty data when disabled (no orgId)", () => {
    const { result } = renderHook(() => useRepositories("token", null), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it("fetches repos when token and orgId are provided", async () => {
    const mockRepos = [
      { id: 1, full_name: "owner/repo1", name: "repo1" },
      { id: 2, full_name: "owner/repo2", name: "repo2" },
    ];

    const { fetchWithAuth } = await import("opendiff-shared/services");
    vi.mocked(fetchWithAuth).mockResolvedValueOnce(mockRepos);

    const { result } = renderHook(() => useRepositories("test-token", "org-1"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(mockRepos);
    });

    expect(fetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining("/api/repos"),
      "test-token",
      "org-1"
    );
  });

  it("passes query parameter when provided", async () => {
    const { fetchWithAuth } = await import("opendiff-shared/services");
    vi.mocked(fetchWithAuth).mockResolvedValueOnce([]);

    const { result } = renderHook(() => useRepositories("test-token", "org-1", "search-term"), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isFetching).toBe(false);
    });

    expect(fetchWithAuth).toHaveBeenCalledWith(
      expect.stringContaining("q=search-term"),
      "test-token",
      "org-1"
    );
  });
});
