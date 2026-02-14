import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWrapper } from "../../test/test-utils";

const mockUser = {
  id: 1,
  visitorId: "visitor-123",
  login: "testuser",
  access_token: "test-token",
  auth_provider: "github" as const,
  onboardingCompletedAt: "2025-01-01",
  accountType: "TEAM" as const,
  hasGithubLinked: true,
  personalOrgId: "personal-org-1",
};

vi.mock("../../auth", () => ({
  useAuth: () => ({
    user: mockUser,
    accounts: [mockUser],
    isLoading: false,
    isAuthenticated: true,
  }),
}));

const mockSetSelectedOrgId = vi.fn();
vi.mock("../context", () => ({
  useOrganizationContext: () => ({
    selectedOrgId: "org-1",
    setSelectedOrgId: mockSetSelectedOrgId,
  }),
}));

const mockOrgs = [
  {
    id: "org-1",
    name: "Team Org",
    role: "OWNER",
    isPersonal: false,
    avatarUrl: null,
  },
  {
    id: "personal-org-1",
    name: "Personal",
    role: "OWNER",
    isPersonal: true,
    avatarUrl: null,
  },
];

describe("useOrganization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("fetches organizations on mount", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(mockOrgs), { status: 200 }));

    const { useOrganization } = await import("./use-organization");
    const { result } = renderHook(() => useOrganization(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isLoadingOrgs).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/api/organizations"),
      expect.any(Object)
    );

    fetchSpy.mockRestore();
  });

  it("filters personal orgs from visible organizations", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockOrgs), { status: 200 })
    );

    const { useOrganization } = await import("./use-organization");
    const { result } = renderHook(() => useOrganization(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.hasFetchedOrgs).toBe(true);
    });

    expect(result.current.organizations.every((o) => !o.isPersonal)).toBe(true);

    vi.restoreAllMocks();
  });

  it("handles 401 error as unauthorized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
    );

    const { useOrganization } = await import("./use-organization");
    const { result } = renderHook(() => useOrganization(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.isUnauthorized).toBe(true);
    });

    vi.restoreAllMocks();
  });
});
