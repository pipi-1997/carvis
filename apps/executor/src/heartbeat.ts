import type { HeartbeatMonitor } from "@carvis/core";

export function renewRunHeartbeat(heartbeats: HeartbeatMonitor, runId: string, now = Date.now()) {
  heartbeats.beat(runId, now);
}
