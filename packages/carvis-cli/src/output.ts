type CliCommand = "configure" | "doctor" | "onboard" | "start" | "status" | "stop";

export function renderHumanResult(command: CliCommand, payload: Record<string, unknown>): string {
  switch (command) {
    case "status":
      return [
        `overall: ${String(payload.overallStatus ?? "unknown")}`,
        `gateway: ${String((payload.gateway as { status?: string } | undefined)?.status ?? "unknown")}`,
        `executor: ${String((payload.executor as { status?: string } | undefined)?.status ?? "unknown")}`,
      ].join("\n");
    case "doctor": {
      const checks = Array.isArray(payload.checks) ? payload.checks as Array<{ checkId?: string; status?: string; message?: string }> : [];
      return [
        String(payload.summary ?? ""),
        ...checks.map((check) => `- [${check.status}] ${check.checkId}: ${check.message}`),
      ].filter(Boolean).join("\n");
    }
    case "stop":
      return [
        String(payload.summary ?? ""),
        Array.isArray(payload.missing) && payload.missing.length > 0 ? `missing: ${(payload.missing as string[]).join(", ")}` : "",
      ].filter(Boolean).join("\n");
    default:
      return String(payload.summary ?? "");
  }
}
