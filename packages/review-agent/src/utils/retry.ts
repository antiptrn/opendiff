/**
 * Retry a function with increasing delays.
 * First retry after 10s, then adds 30s each time: 10s, 30s, 60s, 90s, ...
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 5
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        console.error(`${label} failed after ${attempt} attempts, giving up`);
        throw error;
      }
      const delayMs = attempt === 1 ? 10_000 : (attempt - 1) * 30_000;
      console.warn(
        `${label} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs / 1000}s:`,
        error instanceof Error ? error.message : error
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
