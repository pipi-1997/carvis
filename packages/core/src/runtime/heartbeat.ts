export interface HeartbeatDriver {
  beat(runId: string, now?: number): void | Promise<void>;
  clear(runId: string): void | Promise<void>;
  findExpired(now?: number): string[] | Promise<string[]>;
  hasRun(runId: string): boolean | Promise<boolean>;
}

export class HeartbeatMonitor {
  private readonly beats = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(options?: { ttlMs?: number }) {
    this.ttlMs = options?.ttlMs ?? 30_000;
  }

  beat(runId: string, now = Date.now()): void {
    this.beats.set(runId, now);
  }

  clear(runId: string): void {
    this.beats.delete(runId);
  }

  hasRun(runId: string): boolean {
    return this.beats.has(runId);
  }

  findExpired(now = Date.now()): string[] {
    return Array.from(this.beats.entries())
      .filter(([, timestamp]) => now - timestamp > this.ttlMs)
      .map(([runId]) => runId);
  }
}

export interface RedisHeartbeatClient {
  del(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  keys(pattern: string): Promise<string[]>;
  psetex(key: string, ttlMs: number, value: string): Promise<unknown>;
}

export class RedisHeartbeatMonitor {
  constructor(
    private readonly redis: RedisHeartbeatClient,
    private readonly ttlMs = 30_000,
    private readonly prefix = "carvis:heartbeat",
  ) {}

  private key(runId: string) {
    return `${this.prefix}:${runId}`;
  }

  async beat(runId: string, now = Date.now()): Promise<void> {
    await this.redis.psetex(this.key(runId), this.ttlMs, String(now));
  }

  async clear(runId: string): Promise<void> {
    await this.redis.del(this.key(runId));
  }

  async hasRun(runId: string): Promise<boolean> {
    return (await this.redis.get(this.key(runId))) !== null;
  }

  async findExpired(now = Date.now()): Promise<string[]> {
    const keys = await this.redis.keys(`${this.prefix}:*`);
    const expired: string[] = [];

    for (const key of keys) {
      const value = await this.redis.get(key);
      if (!value) {
        continue;
      }
      if (now - Number(value) > this.ttlMs) {
        expired.push(key.slice(this.prefix.length + 1));
      }
    }

    return expired;
  }
}
