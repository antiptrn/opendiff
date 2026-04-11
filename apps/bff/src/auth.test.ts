import { describe, expect, it } from "bun:test";
import { getDbUserWhere, getOrgIdFromHeader } from "./auth";
import type { ProviderUser } from "./auth";

describe("getDbUserWhere", () => {
  it("should return githubId clause for GitHub provider", () => {
    const user: ProviderUser = {
      id: 12345,
      _provider: "github",
      _githubId: 12345,
    };
    expect(getDbUserWhere(user)).toEqual({ githubId: 12345 });
  });

  it("should return googleId clause for Google provider", () => {
    const user: ProviderUser = {
      id: "google-id-abc",
      _provider: "google",
      _googleId: "google-id-abc",
    };
    expect(getDbUserWhere(user)).toEqual({ googleId: "google-id-abc" });
  });

  it("should return null for GitHub provider without githubId", () => {
    const user: ProviderUser = {
      id: 12345,
      _provider: "github",
      // _githubId is undefined
    };
    expect(getDbUserWhere(user)).toBeNull();
  });

  it("should return null for Google provider without googleId", () => {
    const user: ProviderUser = {
      id: "google-id-abc",
      _provider: "google",
      // _googleId is undefined
    };
    expect(getDbUserWhere(user)).toBeNull();
  });
});

describe("getOrgIdFromHeader", () => {
  it("should extract X-Organization-Id header", () => {
    const mockContext = {
      req: {
        header: (name: string) => (name === "X-Organization-Id" ? "org-123" : undefined),
      },
    };
    expect(getOrgIdFromHeader(mockContext)).toBe("org-123");
  });

  it("should return undefined when header is missing", () => {
    const mockContext = {
      req: {
        header: (_name: string) => undefined,
      },
    };
    expect(getOrgIdFromHeader(mockContext)).toBeUndefined();
  });
});
