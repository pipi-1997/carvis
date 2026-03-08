export interface QueueDriver {
  aheadCount(workspace: string, runId: string, hasActiveRun: boolean): number | Promise<number>;
  dequeue(workspace: string): string | null | Promise<string | null>;
  enqueue(workspace: string, runId: string): number | Promise<number>;
  length(workspace: string): number | Promise<number>;
  remove(workspace: string, runId: string): void | Promise<void>;
}

export class RunQueue {
  private readonly queues = new Map<string, string[]>();

  enqueue(workspace: string, runId: string): number {
    const current = this.queues.get(workspace) ?? [];
    const next = [...current, runId];
    this.queues.set(workspace, next);
    return next.length - 1;
  }

  dequeue(workspace: string): string | null {
    const current = this.queues.get(workspace) ?? [];
    const nextRunId = current[0] ?? null;
    this.queues.set(workspace, current.slice(1));
    return nextRunId;
  }

  remove(workspace: string, runId: string): void {
    const current = this.queues.get(workspace) ?? [];
    this.queues.set(
      workspace,
      current.filter((candidate) => candidate !== runId),
    );
  }

  length(workspace: string): number {
    return (this.queues.get(workspace) ?? []).length;
  }

  aheadCount(workspace: string, runId: string, hasActiveRun: boolean): number {
    const current = this.queues.get(workspace) ?? [];
    const index = current.indexOf(runId);
    if (index === -1) {
      return hasActiveRun ? 1 : 0;
    }
    return index + (hasActiveRun ? 1 : 0);
  }
}

export interface RedisListClient {
  llen(key: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  lpop(key: string): Promise<string | null>;
  lrem(key: string, count: number, value: string): Promise<number>;
  rpush(key: string, ...values: string[]): Promise<number>;
}

export class RedisRunQueue {
  constructor(private readonly redis: RedisListClient, private readonly prefix = "carvis:queue") {}

  private key(workspace: string) {
    return `${this.prefix}:${workspace}`;
  }

  async enqueue(workspace: string, runId: string): Promise<number> {
    const size = await this.redis.rpush(this.key(workspace), runId);
    return size - 1;
  }

  async dequeue(workspace: string): Promise<string | null> {
    return this.redis.lpop(this.key(workspace));
  }

  async remove(workspace: string, runId: string): Promise<void> {
    await this.redis.lrem(this.key(workspace), 0, runId);
  }

  async length(workspace: string): Promise<number> {
    return this.redis.llen(this.key(workspace));
  }

  async aheadCount(workspace: string, runId: string, hasActiveRun: boolean): Promise<number> {
    const values = await this.redis.lrange(this.key(workspace), 0, -1);
    const index = values.indexOf(runId);
    if (index === -1) {
      return hasActiveRun ? 1 : 0;
    }
    return index + (hasActiveRun ? 1 : 0);
  }
}
