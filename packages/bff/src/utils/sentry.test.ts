import { describe, expect, it, mock, beforeEach } from "bun:test";

const mockInit = mock(() => {});

mock.module("@sentry/node", () => ({
  init: mockInit,
  captureException: () => "mock-event-id",
  captureMessage: () => "mock-event-id",
  withScope: (cb: (scope: unknown) => void) => cb({ setTag: () => {} }),
}));

import { initSentry, Sentry } from "./sentry";

describe("utils/sentry", () => {
  beforeEach(() => {
    mockInit.mockClear();
  });

  describe("initSentry", () => {
    it("calls Sentry.init with the default DSN when SENTRY_DSN is not set", () => {
      const original = process.env.SENTRY_DSN;
      delete process.env.SENTRY_DSN;

      initSentry();

      expect(mockInit).toHaveBeenCalledTimes(1);
      const callArgs = mockInit.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.dsn).toContain("sentry.io");
      expect(callArgs.sendDefaultPii).toBe(true);

      if (original !== undefined) process.env.SENTRY_DSN = original;
    });

    it("uses SENTRY_DSN env var when set", () => {
      const original = process.env.SENTRY_DSN;
      process.env.SENTRY_DSN = "https://custom@sentry.io/123";

      initSentry();

      const callArgs = mockInit.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.dsn).toBe("https://custom@sentry.io/123");

      if (original !== undefined) process.env.SENTRY_DSN = original;
      else delete process.env.SENTRY_DSN;
    });

    it("sets environment from NODE_ENV", () => {
      const original = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      initSentry();

      const callArgs = mockInit.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.environment).toBe("production");

      process.env.NODE_ENV = original;
    });

    it("defaults environment to 'development' when NODE_ENV is not set", () => {
      const original = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      initSentry();

      const callArgs = mockInit.mock.calls[0][0] as Record<string, unknown>;
      expect(callArgs.environment).toBe("development");

      if (original !== undefined) process.env.NODE_ENV = original;
    });
  });

  describe("Sentry export", () => {
    it("re-exports the @sentry/node namespace", () => {
      expect(Sentry).toBeDefined();
      expect(typeof Sentry).toBe("object");
    });
  });
});
