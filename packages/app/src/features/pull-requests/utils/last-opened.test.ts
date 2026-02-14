import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLastOpenedTimes, setLastOpenedTime } from "./last-opened";

describe("getLastOpenedTimes", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty object when nothing is stored", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    const result = getLastOpenedTimes();

    expect(result).toEqual({});
    expect(localStorage.getItem).toHaveBeenCalledWith("opendiff_repo_last_opened");
  });

  it("returns parsed data from localStorage", () => {
    const stored = { "owner/repo1": 1700000000000, "owner/repo2": 1700000001000 };
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(stored));

    const result = getLastOpenedTimes();

    expect(result).toEqual(stored);
  });

  it("returns empty object when localStorage throws", () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("Storage access denied");
    });

    const result = getLastOpenedTimes();

    expect(result).toEqual({});
  });

  it("returns empty object when stored value is invalid JSON", () => {
    vi.mocked(localStorage.getItem).mockReturnValue("not-valid-json");

    const result = getLastOpenedTimes();

    expect(result).toEqual({});
  });
});

describe("setLastOpenedTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-06-15T12:00:00Z"));
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("stores timestamp for a repository", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    setLastOpenedTime("owner/repo1");

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "opendiff_repo_last_opened",
      JSON.stringify({ "owner/repo1": Date.now() })
    );
  });

  it("preserves existing entries when adding a new one", () => {
    const existing = { "owner/repo1": 1700000000000 };
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing));

    setLastOpenedTime("owner/repo2");

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "opendiff_repo_last_opened",
      JSON.stringify({
        "owner/repo1": 1700000000000,
        "owner/repo2": Date.now(),
      })
    );
  });

  it("updates timestamp for an existing repository", () => {
    const existing = { "owner/repo1": 1700000000000 };
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(existing));

    setLastOpenedTime("owner/repo1");

    expect(localStorage.setItem).toHaveBeenCalledWith(
      "opendiff_repo_last_opened",
      JSON.stringify({ "owner/repo1": Date.now() })
    );
  });

  it("handles localStorage.setItem throwing gracefully", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    vi.mocked(localStorage.setItem).mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => setLastOpenedTime("owner/repo1")).not.toThrow();
  });

  it("handles localStorage.getItem throwing gracefully during set", () => {
    vi.mocked(localStorage.getItem).mockImplementation(() => {
      throw new Error("Storage access denied");
    });

    expect(() => setLastOpenedTime("owner/repo1")).not.toThrow();
  });
});
