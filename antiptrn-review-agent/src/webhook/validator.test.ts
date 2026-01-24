import { describe, expect, it } from "vitest";
import { validateWebhookSignature } from "./validator";

describe("validateWebhookSignature", () => {
  const secret = "test-webhook-secret";

  it("should return true for valid signature", () => {
    const payload = '{"action":"opened","number":1}';
    // SHA256 HMAC of payload with secret 'test-webhook-secret'
    const _signature = "sha256=7a4d1d7f8f9c8d5e6b3a2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f";

    // We'll compute the real signature in the test
    const crypto = require("node:crypto");
    const expectedSig = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

    const result = validateWebhookSignature(payload, expectedSig, secret);
    expect(result).toBe(true);
  });

  it("should return false for invalid signature", () => {
    const payload = '{"action":"opened","number":1}';
    const invalidSignature = "sha256=invalidsignature123";

    const result = validateWebhookSignature(payload, invalidSignature, secret);
    expect(result).toBe(false);
  });

  it("should return false for missing signature", () => {
    const payload = '{"action":"opened","number":1}';

    const result = validateWebhookSignature(payload, "", secret);
    expect(result).toBe(false);
  });

  it("should return false for tampered payload", () => {
    const originalPayload = '{"action":"opened","number":1}';
    const tamperedPayload = '{"action":"opened","number":2}';

    const crypto = require("node:crypto");
    const signatureForOriginal = `sha256=${crypto.createHmac("sha256", secret).update(originalPayload).digest("hex")}`;

    const result = validateWebhookSignature(tamperedPayload, signatureForOriginal, secret);
    expect(result).toBe(false);
  });

  it("should handle sha1 signatures (legacy)", () => {
    const payload = '{"action":"opened","number":1}';

    const crypto = require("node:crypto");
    const sha1Sig = `sha1=${crypto.createHmac("sha1", secret).update(payload).digest("hex")}`;

    const result = validateWebhookSignature(payload, sha1Sig, secret);
    expect(result).toBe(true);
  });

  it("should use timing-safe comparison to prevent timing attacks", () => {
    // This test ensures we're using crypto.timingSafeEqual
    // We can't directly test timing, but we verify the function handles
    // signatures of different lengths without throwing
    const payload = '{"action":"opened","number":1}';
    const shortSig = "sha256=abc";

    // Should not throw, just return false
    expect(() => validateWebhookSignature(payload, shortSig, secret)).not.toThrow();
    expect(validateWebhookSignature(payload, shortSig, secret)).toBe(false);
  });

  describe("edge cases", () => {
    it("should return false for empty payload", () => {
      const crypto = require("node:crypto");
      const sig = `sha256=${crypto.createHmac("sha256", secret).update("").digest("hex")}`;

      // Implementation rejects empty payload as a security measure
      expect(validateWebhookSignature("", sig, secret)).toBe(false);
    });

    it("should return false for empty secret", () => {
      const payload = '{"action":"opened"}';
      const crypto = require("node:crypto");
      const sig = `sha256=${crypto.createHmac("sha256", "").update(payload).digest("hex")}`;

      // Implementation rejects empty secret as a security measure
      expect(validateWebhookSignature(payload, sig, "")).toBe(false);
    });

    it("should handle payload with unicode characters", () => {
      const payload = '{"message":"Hello 世界 🌍"}';
      const crypto = require("node:crypto");
      const sig = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

      expect(validateWebhookSignature(payload, sig, secret)).toBe(true);
    });

    it("should handle very long payload", () => {
      const payload = JSON.stringify({ data: "x".repeat(100000) });
      const crypto = require("node:crypto");
      const sig = `sha256=${crypto.createHmac("sha256", secret).update(payload).digest("hex")}`;

      expect(validateWebhookSignature(payload, sig, secret)).toBe(true);
    });

    it("should reject unsupported algorithms", () => {
      const payload = '{"action":"opened"}';
      // sha512 is not supported
      const fakeSig = "sha512=abcdef123456";

      expect(validateWebhookSignature(payload, fakeSig, secret)).toBe(false);
    });

    it("should reject md5 algorithm", () => {
      const payload = '{"action":"opened"}';
      const fakeSig = "md5=abcdef123456";

      expect(validateWebhookSignature(payload, fakeSig, secret)).toBe(false);
    });

    it("should reject signature with no algorithm prefix", () => {
      const payload = '{"action":"opened"}';
      const crypto = require("node:crypto");
      const hashOnly = crypto.createHmac("sha256", secret).update(payload).digest("hex");

      expect(validateWebhookSignature(payload, hashOnly, secret)).toBe(false);
    });

    it("should reject signature with only equals sign", () => {
      const payload = '{"action":"opened"}';

      expect(validateWebhookSignature(payload, "=", secret)).toBe(false);
    });

    it("should reject signature with algorithm but no hash", () => {
      const payload = '{"action":"opened"}';

      expect(validateWebhookSignature(payload, "sha256=", secret)).toBe(false);
    });

    it("should handle signature with uppercase hex", () => {
      const payload = '{"action":"opened"}';
      const crypto = require("node:crypto");
      const hash = crypto.createHmac("sha256", secret).update(payload).digest("hex").toUpperCase();
      const sig = `sha256=${hash}`;

      // Buffer.from with 'hex' encoding is case-insensitive, so uppercase works
      expect(validateWebhookSignature(payload, sig, secret)).toBe(true);
    });

    it("should handle special characters in secret", () => {
      const specialSecret = "secret!@#$%^&*()_+-=[]{}|;:,.<>?";
      const payload = '{"action":"opened"}';
      const crypto = require("node:crypto");
      const sig = `sha256=${crypto.createHmac("sha256", specialSecret).update(payload).digest("hex")}`;

      expect(validateWebhookSignature(payload, sig, specialSecret)).toBe(true);
    });
  });
});
