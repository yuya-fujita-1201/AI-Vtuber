import fs from 'fs';
import path from 'path';
import { config, LogLevel } from '../config/AppConfig';

type LogEntry = {
  timestamp: string;
  level: LogLevel;
  message: string;
  meta?: unknown[];
};

const levelPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const ensureDir = (dirPath: string) => {
  try {
    fs.mkdirSync(dirPath, { recursive: true });
  } catch {
    // Directory creation failure should not crash the app; logging will fallback to console.
  }
};

const normalizeMeta = (meta: unknown[]): unknown[] => {
  return meta.map((item) => {
    if (item instanceof Error) {
      return {
        name: item.name,
        message: item.message,
        stack: item.stack
      };
    }
    return item;
  });
};

const safeStringify = (value: unknown): string => {
  const seen = new WeakSet();
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') {
      return val.toString();
    }
    if (val instanceof Error) {
      return { name: val.name, message: val.message, stack: val.stack };
    }
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) {
        return '[Circular]';
      }
      seen.add(val);
    }
    return val;
  });
};

class Logger {
  private level: LogLevel;
  private consoleEnabled: boolean;
  private fileEnabled: boolean;
  private filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.level = config.logging.level;
    this.consoleEnabled = config.logging.console;
    this.fileEnabled = config.logging.file.enabled;
    this.filePath = config.logging.file.path;

    if (this.fileEnabled) {
      ensureDir(path.dirname(this.filePath));
    }
  }

  public debug(message: string, ...meta: unknown[]): void {
    this.log('debug', message, ...meta);
  }

  public info(message: string, ...meta: unknown[]): void {
    this.log('info', message, ...meta);
  }

  public warn(message: string, ...meta: unknown[]): void {
    this.log('warn', message, ...meta);
  }

  public error(message: string, ...meta: unknown[]): void {
    this.log('error', message, ...meta);
  }

  private shouldLog(level: LogLevel): boolean {
    return levelPriority[level] >= levelPriority[this.level];
  }

  private log(level: LogLevel, message: string, ...meta: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    if (meta.length > 0) {
      entry.meta = normalizeMeta(meta);
    }

    if (this.consoleEnabled) {
      const consoleFn =
        level === 'error'
          ? console.error
          : level === 'warn'
            ? console.warn
            : level === 'debug'
              ? console.debug
              : console.log;
      consoleFn(message, ...meta);
    }

    if (this.fileEnabled) {
      const line = safeStringify(entry);
      this.writeQueue = this.writeQueue
        .then(() => fs.promises.appendFile(this.filePath, `${line}\n`))
        .catch(() => undefined);
    }
  }
}

export const logger = new Logger();
