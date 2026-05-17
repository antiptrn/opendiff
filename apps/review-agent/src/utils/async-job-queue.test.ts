import { describe, expect, it } from "vitest";
import { AsyncJobQueue } from "./async-job-queue";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(assertion: () => boolean, timeoutMs = 1_000): Promise<void> {
  const startedAt = Date.now();
  while (!assertion()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for queue condition");
    }
    await delay(5);
  }
}

describe("AsyncJobQueue", () => {
  it("limits concurrent jobs", async () => {
    let active = 0;
    let maxActive = 0;
    const processed: number[] = [];
    const queue = new AsyncJobQueue<number>({
      name: "test",
      concurrency: 2,
      maxQueuedJobs: 10,
      maxAttempts: 1,
      retryDelayMs: 1,
      processor: async (job) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay(20);
        processed.push(job);
        active -= 1;
      },
    });

    for (let i = 0; i < 5; i += 1) {
      queue.enqueue(`job-${i}`, i);
    }

    await waitFor(() => queue.getStats().completed === 5);

    expect(maxActive).toBeLessThanOrEqual(2);
    expect(processed).toHaveLength(5);
  });

  it("coalesces queued jobs by key while preserving a running job", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstJobDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const processed: string[] = [];
    const queue = new AsyncJobQueue<string>({
      name: "test",
      concurrency: 1,
      maxQueuedJobs: 10,
      maxAttempts: 1,
      retryDelayMs: 1,
      processor: async (job) => {
        processed.push(job);
        if (job === "first") {
          await firstJobDone;
        }
      },
    });

    queue.enqueue("owner/repo#1", "first");
    await waitFor(() => queue.getStats().running === 1);

    const queued = queue.enqueue("owner/repo#1", "second");
    const replaced = queue.enqueue("owner/repo#1", "third");
    releaseFirst();

    await waitFor(() => queue.getStats().completed === 2);

    expect(queued.status).toBe("queued");
    expect(replaced.status).toBe("replaced");
    expect(processed).toEqual(["first", "third"]);
  });

  it("retries failed jobs without throwing from the queue", async () => {
    let attempts = 0;
    const queue = new AsyncJobQueue<string>({
      name: "test",
      concurrency: 1,
      maxQueuedJobs: 10,
      maxAttempts: 2,
      retryDelayMs: 1,
      processor: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary failure");
        }
      },
    });

    queue.enqueue("owner/repo#1", "review");

    await waitFor(() => queue.getStats().completed === 1);

    expect(attempts).toBe(2);
    expect(queue.getStats().retries).toBe(1);
    expect(queue.getStats().failed).toBe(0);
  });

  it("rejects new jobs when the pending queue is full", async () => {
    let releaseFirst: () => void = () => undefined;
    const firstJobDone = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const queue = new AsyncJobQueue<string>({
      name: "test",
      concurrency: 1,
      maxQueuedJobs: 1,
      maxAttempts: 1,
      retryDelayMs: 1,
      processor: async (job) => {
        if (job === "first") {
          await firstJobDone;
        }
      },
    });

    queue.enqueue("owner/repo#1", "first");
    await waitFor(() => queue.getStats().running === 1);

    const queued = queue.enqueue("owner/repo#2", "second");
    const rejected = queue.enqueue("owner/repo#3", "third");
    releaseFirst();

    await waitFor(() => queue.getStats().completed === 2);

    expect(queued.accepted).toBe(true);
    expect(rejected.accepted).toBe(false);
    expect(rejected.status).toBe("full");
  });
});
