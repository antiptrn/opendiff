import { afterEach, describe, expect, it } from "bun:test";
import { getDbUserWhere, getOrgIdFromHeader } from "./auth";
import type { ProviderUser } from "./auth";
import { isLoginEmailAllowed } from "./routes/auth/utils";

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

  it("should return microsoftId clause for Microsoft provider", () => {
    const user: ProviderUser = {
      id: "microsoft-id-abc",
      _provider: "microsoft",
      _microsoftId: "microsoft-id-abc",
    };
    expect(getDbUserWhere(user)).toEqual({ microsoftId: "microsoft-id-abc" });
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

describe("isLoginEmailAllowed", () => {
  const originalAllowedEmails = process.env.AUTH_ALLOWED_EMAILS;
  const originalAllowedDomains = process.env.AUTH_ALLOWED_DOMAINS;

  function resetAuthAllowlistEnv() {
    if (originalAllowedEmails === undefined) {
      delete process.env.AUTH_ALLOWED_EMAILS;
    } else {
      process.env.AUTH_ALLOWED_EMAILS = originalAllowedEmails;
    }

    if (originalAllowedDomains === undefined) {
      delete process.env.AUTH_ALLOWED_DOMAINS;
    } else {
      process.env.AUTH_ALLOWED_DOMAINS = originalAllowedDomains;
    }
  }

  afterEach(() => {
    resetAuthAllowlistEnv();
  });

  it("allows everyone when no allowlist is configured", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    delete process.env.AUTH_ALLOWED_DOMAINS;

    expect(isLoginEmailAllowed("person@example.com")).toBe(true);
  });

  it("allows exact configured emails case-insensitively", () => {
    process.env.AUTH_ALLOWED_EMAILS = "Alice@Example.com,bob@example.com";
    delete process.env.AUTH_ALLOWED_DOMAINS;

    expect(isLoginEmailAllowed("alice@example.com")).toBe(true);
    expect(isLoginEmailAllowed("carol@example.com")).toBe(false);
  });

  it("allows configured domains", () => {
    delete process.env.AUTH_ALLOWED_EMAILS;
    process.env.AUTH_ALLOWED_DOMAINS = "example.com,@visma.com";

    expect(isLoginEmailAllowed("alice@visma.com")).toBe(true);
    expect(isLoginEmailAllowed("bob@example.com")).toBe(true);
    expect(isLoginEmailAllowed("carol@other.com")).toBe(false);
  });
});
