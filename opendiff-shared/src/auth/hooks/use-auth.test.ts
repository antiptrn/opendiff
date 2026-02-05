import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import { useAuth } from "./use-auth";
import { createWrapper } from "../../test/test-utils";

// Mock window.location
const originalLocation = window.location;
beforeEach(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...originalLocation, href: "" },
  });
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

const mockUser = {
  id: 1,
  visitorId: "visitor-123",
  login: "testuser",
  name: "Test User",
  avatar_url: "https://example.com/avatar.png",
  access_token: "test-token",
  auth_provider: "github" as const,
  onboardingCompletedAt: "2025-01-01",
  accountType: "SOLO" as const,
  hasGithubLinked: true,
  personalOrgId: "org-1",
};

describe("useAuth", () => {
  it("starts with no user when localStorage is empty", () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });
    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.accounts).toHaveLength(0);
  });

  it("setUser stores a user and makes it active", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.setUser(mockUser);
    });

    await waitFor(() => {
      expect(result.current.user).toMatchObject({ login: "testuser" });
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.accounts).toHaveLength(1);
  });

  it("switchAccount changes the active user", async () => {
    const secondUser = {
      ...mockUser,
      id: 2,
      visitorId: "visitor-456",
      login: "seconduser",
    };

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.setUser(mockUser);
    });
    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(1);
    });

    act(() => {
      result.current.setUser(secondUser);
    });
    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(2);
    });

    expect(result.current.user?.login).toBe("seconduser");

    act(() => {
      result.current.switchAccount("visitor-123");
    });

    await waitFor(() => {
      expect(result.current.user?.login).toBe("testuser");
    });
  });

  it("removeAccount removes an account from localStorage", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.setUser(mockUser);
    });
    await waitFor(() => {
      expect(result.current.accounts).toHaveLength(1);
    });

    act(() => {
      result.current.removeAccount("visitor-123");
    });

    const stored = JSON.parse(localStorage.getItem("opendiff_accounts") || "{}");
    expect(stored.accounts).toHaveLength(0);
    expect(stored.activeAccountId).toBeNull();
  });

  it("logout removes the current user from localStorage", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.setUser(mockUser);
    });
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    act(() => {
      result.current.logout();
    });

    const stored = JSON.parse(localStorage.getItem("opendiff_accounts") || "{}");
    expect(stored.accounts).toHaveLength(0);
  });

  it("login redirects to GitHub auth URL", () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.login();
    });

    expect(window.location.href).toContain("/auth/github");
  });

  it("login includes redirect URL when provided", () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.login("/console");
    });

    expect(window.location.href).toContain("redirectUrl=%2Fconsole");
  });

  it("refreshAccountToken returns the account for github provider", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.setUser(mockUser);
    });

    const refreshed = await result.current.refreshAccountToken(mockUser);
    expect(refreshed).toEqual(mockUser);
  });

  it("refreshAccountToken calls refresh endpoint for non-github providers", async () => {
    const googleUser = { ...mockUser, auth_provider: "google" as const };
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ access_token: "new-token" }), { status: 200 })
      );

    const { result } = renderHook(() => useAuth(), { wrapper: createWrapper() });

    act(() => {
      result.current.setUser(googleUser);
    });

    const refreshed = await result.current.refreshAccountToken(googleUser);
    expect(refreshed?.access_token).toBe("new-token");
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/auth/refresh"),
      expect.objectContaining({ method: "POST" })
    );

    fetchSpy.mockRestore();
  });
});
