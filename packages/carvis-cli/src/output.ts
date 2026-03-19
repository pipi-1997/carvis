type CliCommand =
  | "configure"
  | "daemon"
  | "doctor"
  | "infra"
  | "install"
  | "onboard"
  | "start"
  | "status"
  | "stop"
  | "uninstall";

export function renderHumanResult(command: CliCommand, payload: Record<string, unknown>): string {
  switch (command) {
    case "install":
    case "onboard":
    case "start":
    case "stop":
    case "daemon":
    case "infra":
    case "uninstall":
      return [
        String(payload.summary ?? ""),
        typeof payload.mappedTo === "string" ? `mapped to: ${payload.mappedTo}` : "",
      ].filter(Boolean).join("\n");
    case "status":
      return [
        `overall: ${String(payload.overallStatus ?? "unknown")}`,
        `install: ${String((payload.install as { status?: string } | undefined)?.status ?? "unknown")}`,
        `daemon: ${String((payload.daemon as { status?: string } | undefined)?.status ?? "unknown")}`,
        `runtime: ${String((payload.runtime as { status?: string } | undefined)?.status ?? "unknown")}`,
      ].join("\n");
    case "doctor": {
      const checks = Array.isArray(payload.checks) ? payload.checks as Array<{ checkId?: string; layer?: string; status?: string; message?: string }> : [];
      return [
        String(payload.summary ?? ""),
        ...checks.map((check) => `- [${check.status}] ${check.layer ?? "unknown"}:${check.checkId}: ${check.message}`),
      ].filter(Boolean).join("\n");
    }
    default:
      return String(payload.summary ?? "");
  }
}
