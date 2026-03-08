export interface WorkspaceLockDriver {
  acquire(workspace: string, runId: string): boolean | Promise<boolean>;
  getActiveRunId(workspace: string): string | null | Promise<string | null>;
  release(workspace: string, runId: string): void | Promise<void>;
}

export class WorkspaceLockManager {
  private readonly locks = new Map<string, string>();

  acquire(workspace: string, runId: string): boolean {
    if (this.locks.has(workspace)) {
      return false;
    }
    this.locks.set(workspace, runId);
    return true;
  }

  release(workspace: string, runId: string): void {
    if (this.locks.get(workspace) === runId) {
      this.locks.delete(workspace);
    }
  }

  getActiveRunId(workspace: string): string | null {
    return this.locks.get(workspace) ?? null;
  }
}

export interface RedisLockClient {
  del(key: string): Promise<number>;
  get(key: string): Promise<string | null>;
  pexpire(key: string, ttlMs: number): Promise<number>;
  set(key: string, value: string, mode?: "NX"): Promise<"OK" | null>;
}

export class RedisWorkspaceLockManager {
  constructor(
    private readonly redis: RedisLockClient,
    private readonly ttlMs = 30_000,
    private readonly prefix = "carvis:lock",
  ) {}

  private key(workspace: string) {
    return `${this.prefix}:${workspace}`;
  }

  async acquire(workspace: string, runId: string): Promise<boolean> {
    const result = await this.redis.set(this.key(workspace), runId, "NX");
    if (result === "OK") {
      await this.redis.pexpire(this.key(workspace), this.ttlMs);
      return true;
    }
    return false;
  }

  async release(workspace: string, runId: string): Promise<void> {
    const active = await this.redis.get(this.key(workspace));
    if (active === runId) {
      await this.redis.del(this.key(workspace));
    }
  }

  async getActiveRunId(workspace: string): Promise<string | null> {
    return this.redis.get(this.key(workspace));
  }
}
