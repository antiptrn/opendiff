/**
 * Retry a function with exponential backoff.
 * Delays between retries: 1s, 2s, 4s, 8s, 16s, 30s, 30s, ... (capped at 30s).
 * Default maxRetries=5 means up to 5 attempts with delays of: 1s, 2s, 4s, 8s between them.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 5
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries) {
        console.error(`${label} failed after ${attempt} attempts, giving up`);
        throw error;
      }
      const delayMs = Math.min(2 ** (attempt - 1) * 1000, 30_000);
      console.warn(
        `${label} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs / 1000}s:`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  // This should never be reached, but TypeScript can't prove it
  throw new Error(`${label} failed: max retries exhausted`);
}
