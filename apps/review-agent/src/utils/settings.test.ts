import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
let moduleVersion = 0;

async function loadSettingsModule() {
  moduleVersion += 1;
  return await import(`./settings.ts?test=${moduleVersion}`);
}

describe("settings API client", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    globalThis.fetch = originalFetch;
  });

  it("passes the stable GitHub repo id when fetching repository settings", async () => {
    process.env.SETTINGS_API_URL = "https://settings.internal";
    process.env.REVIEW_AGENT_API_KEY = "internal-secret";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          owner: "owner",
          repo: "repo",
          enabled: true,
          effectiveEnabled: true,
          autofixEnabled: false,
          sensitivity: 50,
        }),
        { status: 200 }
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { getRepositorySettings } = await loadSettingsModule();
    const settings = await getRepositorySettings("owner", "repo", 123);

    expect(settings.effectiveEnabled).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      "https://settings.internal/api/internal/settings/owner/repo?githubRepoId=123"
    );
    expect(init.headers).toEqual({ "X-API-Key": "internal-secret" });
  });

  it("throws instead of treating settings API failures as disabled repositories", async () => {
    process.env.SETTINGS_API_URL = "https://settings.internal";
    process.env.REVIEW_AGENT_API_KEY = "internal-secret";

    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("unavailable", { status: 503 })) as unknown as typeof fetch;

    const { getRepositorySettings, SettingsApiUnavailableError } = await loadSettingsModule();

    await expect(getRepositorySettings("owner", "repo", 123)).rejects.toBeInstanceOf(
      SettingsApiUnavailableError
    );
    await expect(getRepositorySettings("owner", "repo", 123)).rejects.toMatchObject({
      status: 503,
    });
  });

  it("fails closed at startup in production when SETTINGS_API_URL is missing", async () => {
    process.env.SETTINGS_API_URL = undefined;
    process.env.NODE_ENV = "production";

    const { getRepositorySettings, SettingsApiUnavailableError } = await loadSettingsModule();

    await expect(getRepositorySettings("owner", "repo")).rejects.toBeInstanceOf(
      SettingsApiUnavailableError
    );
  });
});
