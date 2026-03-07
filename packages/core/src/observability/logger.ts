export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}

export class StructuredLogger {
  private readonly entries: LogEntry[] = [];

  info(message: string, context?: Record<string, unknown>) {
    this.entries.push({ level: "info", message, context });
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.entries.push({ level: "warn", message, context });
  }

  error(message: string, context?: Record<string, unknown>) {
    this.entries.push({ level: "error", message, context });
  }

  listEntries(): LogEntry[] {
    return [...this.entries];
  }
}
