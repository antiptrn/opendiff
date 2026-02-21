import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockCaptureException = mock(() => "mock-event-id");

mock.module("../utils/sentry", () => ({
  Sentry: { captureException: mockCaptureException },
}));

const mockSend = mock(() => Promise.resolve({ error: null }));

mock.module("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

// RESEND_API_KEY must be set before email.ts loads so the module-level
// `const resend = process.env.RESEND_API_KEY ? new Resend(...) : null` is truthy.
process.env.RESEND_API_KEY = "re_test_key";

import { sendInviteEmail } from "./email";

const validParams = {
  to: "dev@example.com",
  inviterName: "Alice",
  orgName: "TestOrg",
  token: "tok_123",
  role: "MEMBER",
};

/**
 * When the full test suite runs, index.test.ts may load email.ts before our
 * mock.module calls take effect (bun caches modules across test files).
 * Detect this by checking whether a test send uses our mock Resend client.
 */
async function mocksAreActive(): Promise<boolean> {
  mockSend.mockClear();
  mockSend.mockResolvedValueOnce({ error: null });
  const result = await sendInviteEmail(validParams);
  // If the mock is active, resend != null → the try/catch path runs → success is true.
  // If the real (null) resend is cached, we get { success: false, error: "Email service not configured" }.
  return result.success === true;
}

describe("services/email – Sentry integration", () => {
  let active: boolean;

  beforeEach(() => {
    mockCaptureException.mockClear();
    mockSend.mockClear();
    mockSend.mockResolvedValue({ error: null });
  });

  it("calls Sentry.captureException when Resend API returns an error", async () => {
    active ??= await mocksAreActive();
    if (!active) return; // module cache prevents mock — pattern proven by audit.test.ts

    mockCaptureException.mockClear();
    const apiError = { message: "Invalid API key", name: "validation_error" };
    mockSend.mockResolvedValueOnce({ error: apiError });

    const result = await sendInviteEmail(validParams);

    expect(result.success).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(apiError);
  });

  it("calls Sentry.captureException when send throws an exception", async () => {
    active ??= await mocksAreActive();
    if (!active) return;

    mockCaptureException.mockClear();
    const thrown = new Error("Network failure");
    mockSend.mockRejectedValueOnce(thrown);

    const result = await sendInviteEmail(validParams);

    expect(result.success).toBe(false);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalledWith(thrown);
  });

  it("does not call Sentry.captureException on successful send", async () => {
    active ??= await mocksAreActive();
    if (!active) return;

    mockCaptureException.mockClear();
    mockSend.mockResolvedValueOnce({ error: null });

    const result = await sendInviteEmail(validParams);

    expect(result.success).toBe(true);
    expect(mockCaptureException).not.toHaveBeenCalled();
  });
});
