import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

/**
 * Validates a GitHub webhook signature against a payload.
 * Supports both sha256 (preferred) and sha1 (legacy) signatures.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function validateWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  if (!signature || !payload || !secret) {
    return false;
  }

  // Parse the signature format: "sha256=..." or "sha1=..."
  const [algorithm, hash] = signature.split("=");

  if (!algorithm || !hash) {
    return false;
  }

  // Only support sha256 and sha1
  if (algorithm !== "sha256" && algorithm !== "sha1") {
    return false;
  }

  try {
    const expectedHash = createHmac(algorithm, secret).update(payload).digest("hex");

    const expectedBuffer = Buffer.from(expectedHash, "hex");
    const actualBuffer = Buffer.from(hash, "hex");

    // Timing-safe comparison requires equal lengths
    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, actualBuffer);
  } catch {
    return false;
  }
}
