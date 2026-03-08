import type { HeartbeatDriver } from "@carvis/core";

export async function renewRunHeartbeat(heartbeats: HeartbeatDriver, runId: string, now = Date.now()) {
  await heartbeats.beat(runId, now);
}
