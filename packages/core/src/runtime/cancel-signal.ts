export interface CancelSignalDriver {
  clear(runId: string): Promise<void>;
  isCancellationRequested(runId: string): Promise<boolean>;
  requestCancellation(runId: string): Promise<void>;
  waitForCancellation(runId: string): Promise<void>;
}

export class CancelSignalStore implements CancelSignalDriver {
  private readonly requested = new Set<string>();
  private readonly listeners = new Map<string, Array<() => void>>();

  async requestCancellation(runId: string): Promise<void> {
    this.requested.add(runId);
    const listeners = this.listeners.get(runId) ?? [];
    for (const listener of listeners) {
      listener();
    }
    this.listeners.delete(runId);
  }

  async isCancellationRequested(runId: string): Promise<boolean> {
    return this.requested.has(runId);
  }

  waitForCancellation(runId: string): Promise<void> {
    if (this.requested.has(runId)) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const current = this.listeners.get(runId) ?? [];
      this.listeners.set(runId, [...current, resolve]);
    });
  }

  async clear(runId: string): Promise<void> {
    this.requested.delete(runId);
    this.listeners.delete(runId);
  }
}

export interface RedisCancelClient {
  del(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: "NX"): Promise<"OK" | null>;
}

export class RedisCancelSignalStore implements CancelSignalDriver {
  constructor(private readonly redis: RedisCancelClient, private readonly prefix = "carvis:cancel") {}

  private key(runId: string) {
    return `${this.prefix}:${runId}`;
  }

  async requestCancellation(runId: string): Promise<void> {
    await this.redis.set(this.key(runId), "1");
  }

  async isCancellationRequested(runId: string): Promise<boolean> {
    return (await this.redis.get(this.key(runId))) === "1";
  }

  async waitForCancellation(runId: string): Promise<void> {
    while (!(await this.isCancellationRequested(runId))) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async clear(runId: string): Promise<void> {
    await this.redis.del(this.key(runId));
  }
}
