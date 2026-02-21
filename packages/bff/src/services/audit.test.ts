import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockCaptureException = mock(() => "mock-event-id");

mock.module("../utils/sentry", () => ({
  Sentry: { captureException: mockCaptureException },
}));

// Note: @prisma/client can't be easily mocked in bun because it resolves to
// the generated .prisma/client path.  Without DATABASE_URL the real
// PrismaClient will fail on every query, which is exactly what we need to
// exercise the catch-block Sentry integration.

import { logAudit } from "./audit";

describe("services/audit – Sentry integration", () => {
  beforeEach(() => {
    mockCaptureException.mockClear();
  });

  it("calls Sentry.captureException when prisma create fails", async () => {
    // No DATABASE_URL → PrismaClient throws on any query.
    // logAudit swallows the error and should report it via Sentry.
    await logAudit({ action: "user.login", userId: "u1" });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const capturedError = mockCaptureException.mock.calls[0][0];
    expect(capturedError).toBeDefined();
    expect(capturedError).toBeInstanceOf(Error);
  });
});
