export type QueueEnqueueStatus = "queued" | "replaced" | "full";
export type QueueJobStatus = "queued" | "running" | "retrying" | "completed" | "failed";

export interface QueueJobContext {
  id: string;
  key: string;
  attempt: number;
  maxAttempts: number;
}

export interface QueueJobSnapshot {
  id: string;
  key: string;
  status: QueueJobStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
}

export interface AsyncJobQueueOptions<T> {
  name: string;
  concurrency: number;
  maxQueuedJobs: number;
  maxAttempts: number;
  retryDelayMs: number;
  processor: (job: T, context: QueueJobContext) => Promise<void>;
  onError?: (error: unknown, job: T, context: QueueJobContext) => void;
}

export interface QueueStats {
  name: string;
  concurrency: number;
  maxQueuedJobs: number;
  queued: number;
  running: number;
  completed: number;
  failed: number;
  retries: number;
}

export interface QueueEnqueueResult {
  accepted: boolean;
  status: QueueEnqueueStatus;
  jobId?: string;
  key: string;
  stats: QueueStats;
}

interface QueueEntry<T> {
  id: string;
  key: string;
  data: T;
  attempts: number;
  status: QueueJobStatus;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export class AsyncJobQueue<T> {
  private readonly concurrency: number;
  private readonly maxQueuedJobs: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly processor: AsyncJobQueueOptions<T>["processor"];
  private readonly onError?: AsyncJobQueueOptions<T>["onError"];
  private readonly queue: Array<QueueEntry<T>> = [];
  private readonly queuedByKey = new Map<string, QueueEntry<T>>();
  private readonly runningById = new Map<string, QueueEntry<T>>();
  private readonly runningKeys = new Set<string>();
  private readonly recentJobs = new Map<string, QueueJobSnapshot>();
  private sequence = 0;
  private completed = 0;
  private failed = 0;
  private retries = 0;

  constructor(private readonly options: AsyncJobQueueOptions<T>) {
    this.concurrency = Math.max(1, Math.floor(options.concurrency));
    this.maxQueuedJobs = Math.max(1, Math.floor(options.maxQueuedJobs));
    this.maxAttempts = Math.max(1, Math.floor(options.maxAttempts));
    this.retryDelayMs = Math.max(0, Math.floor(options.retryDelayMs));
    this.processor = options.processor;
    this.onError = options.onError;
  }

  enqueue(key: string, data: T): QueueEnqueueResult {
    const existingQueued = this.queuedByKey.get(key);

    if (existingQueued) {
      existingQueued.data = data;
      existingQueued.updatedAt = Date.now();
      existingQueued.lastError = undefined;
      existingQueued.status = "queued";
      this.remember(existingQueued);
      this.drain();
      return {
        accepted: true,
        status: "replaced",
        jobId: existingQueued.id,
        key,
        stats: this.getStats(),
      };
    }

    if (this.queue.length >= this.maxQueuedJobs) {
      return {
        accepted: false,
        status: "full",
        key,
        stats: this.getStats(),
      };
    }

    const entry: QueueEntry<T> = {
      id: this.nextId(),
      key,
      data,
      attempts: 0,
      status: "queued",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.queue.push(entry);
    this.queuedByKey.set(key, entry);
    this.remember(entry);
    this.drain();

    return {
      accepted: true,
      status: "queued",
      jobId: entry.id,
      key,
      stats: this.getStats(),
    };
  }

  getStats(): QueueStats {
    return {
      name: this.options.name,
      concurrency: this.concurrency,
      maxQueuedJobs: this.maxQueuedJobs,
      queued: this.queue.length,
      running: this.runningById.size,
      completed: this.completed,
      failed: this.failed,
      retries: this.retries,
    };
  }

  getSnapshot(): { stats: QueueStats; jobs: QueueJobSnapshot[] } {
    return {
      stats: this.getStats(),
      jobs: [...this.recentJobs.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    };
  }

  private drain(): void {
    while (this.runningById.size < this.concurrency) {
      const nextIndex = this.queue.findIndex((entry) => !this.runningKeys.has(entry.key));
      if (nextIndex === -1) {
        return;
      }

      const [entry] = this.queue.splice(nextIndex, 1);
      this.queuedByKey.delete(entry.key);
      this.start(entry);
    }
  }

  private start(entry: QueueEntry<T>): void {
    entry.status = "running";
    entry.attempts += 1;
    entry.updatedAt = Date.now();
    this.runningById.set(entry.id, entry);
    this.runningKeys.add(entry.key);
    this.remember(entry);

    void this.run(entry);
  }

  private async run(entry: QueueEntry<T>): Promise<void> {
    const context: QueueJobContext = {
      id: entry.id,
      key: entry.key,
      attempt: entry.attempts,
      maxAttempts: this.maxAttempts,
    };

    try {
      await this.processor(entry.data, context);
      entry.status = "completed";
      entry.updatedAt = Date.now();
      this.completed += 1;
      this.remember(entry);
    } catch (error) {
      entry.lastError = error instanceof Error ? error.message : String(error);
      entry.updatedAt = Date.now();
      this.onError?.(error, entry.data, context);

      if (entry.attempts < this.maxAttempts && !this.queuedByKey.has(entry.key)) {
        entry.status = "retrying";
        this.retries += 1;
        this.remember(entry);
        setTimeout(() => this.retry(entry), this.retryDelayMs);
      } else {
        entry.status = "failed";
        this.failed += 1;
        this.remember(entry);
      }
    } finally {
      this.runningById.delete(entry.id);
      this.runningKeys.delete(entry.key);
      this.drain();
    }
  }

  private retry(entry: QueueEntry<T>): void {
    if (this.queuedByKey.has(entry.key)) {
      return;
    }

    if (this.queue.length >= this.maxQueuedJobs) {
      entry.status = "failed";
      entry.lastError = entry.lastError || "Queue full before retry";
      entry.updatedAt = Date.now();
      this.failed += 1;
      this.remember(entry);
      return;
    }

    entry.status = "queued";
    entry.updatedAt = Date.now();
    this.queue.push(entry);
    this.queuedByKey.set(entry.key, entry);
    this.remember(entry);
    this.drain();
  }

  private remember(entry: QueueEntry<T>): void {
    this.recentJobs.set(entry.id, {
      id: entry.id,
      key: entry.key,
      status: entry.status,
      attempts: entry.attempts,
      createdAt: new Date(entry.createdAt).toISOString(),
      updatedAt: new Date(entry.updatedAt).toISOString(),
      ...(entry.lastError ? { lastError: entry.lastError } : {}),
    });

    if (this.recentJobs.size <= 100) {
      return;
    }

    const oldest = [...this.recentJobs.entries()].sort((a, b) =>
      a[1].updatedAt.localeCompare(b[1].updatedAt)
    )[0]?.[0];
    if (oldest) {
      this.recentJobs.delete(oldest);
    }
  }

  private nextId(): string {
    this.sequence += 1;
    return `${this.options.name}-${Date.now().toString(36)}-${this.sequence.toString(36)}`;
  }
}
