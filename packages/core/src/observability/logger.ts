export interface LogEntry {
  level: "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}

type StructuredLoggerOptions = {
  sink?: (entry: LogEntry) => void;
};

export class StructuredLogger {
  private readonly entries: LogEntry[] = [];
  private readonly sink?: (entry: LogEntry) => void;

  constructor(options: StructuredLoggerOptions = {}) {
    this.sink = options.sink;
  }

  info(message: string, context?: Record<string, unknown>) {
    this.record({ level: "info", message, context });
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.record({ level: "warn", message, context });
  }

  error(message: string, context?: Record<string, unknown>) {
    this.record({ level: "error", message, context });
  }

  listEntries(): LogEntry[] {
    return [...this.entries];
  }

  private record(entry: LogEntry) {
    this.entries.push(entry);
    this.sink?.(entry);
  }
}

export function createConsoleLogSink() {
  return (entry: LogEntry) => {
    const context = entry.context ? ` ${JSON.stringify(entry.context)}` : "";
    if (entry.level === "error") {
      console.error(`${entry.message}${context}`);
      return;
    }
    if (entry.level === "warn") {
      console.warn(`${entry.message}${context}`);
      return;
    }
    console.info(`${entry.message}${context}`);
  };
}
