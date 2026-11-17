export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

function write(
  level: LogLevel,
  threshold: LogLevel,
  event: string,
  fields: Record<string, unknown> | undefined,
) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[threshold]) return;

  const line = {
    level,
    time: new Date().toISOString(),
    event,
    ...fields,
  };

  const output = JSON.stringify(line);
  if (level === "error") {
    console.error(output);
  } else if (level === "warn") {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export function createLogger(threshold: LogLevel = "info"): Logger {
  return {
    debug: (event, fields) => write("debug", threshold, event, fields),
    info: (event, fields) => write("info", threshold, event, fields),
    warn: (event, fields) => write("warn", threshold, event, fields),
    error: (event, fields) => write("error", threshold, event, fields),
  };
}
