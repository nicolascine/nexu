// Structured logger for consistent error handling and debugging

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  timestamp: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

function formatError(error: unknown): LogEntry['error'] | undefined {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  if (error) {
    return {
      name: 'UnknownError',
      message: String(error),
    };
  }
  return undefined;
}

function createLogEntry(
  level: LogLevel,
  message: string,
  context?: LogContext,
  error?: unknown
): LogEntry {
  return {
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
    error: formatError(error),
  };
}

function log(entry: LogEntry): void {
  const output = JSON.stringify(entry);

  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(output);
      }
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    log(createLogEntry('debug', message, context));
  },

  info(message: string, context?: LogContext): void {
    log(createLogEntry('info', message, context));
  },

  warn(message: string, context?: LogContext, error?: unknown): void {
    log(createLogEntry('warn', message, context, error));
  },

  error(message: string, context?: LogContext, error?: unknown): void {
    log(createLogEntry('error', message, context, error));
  },
};

export default logger;
