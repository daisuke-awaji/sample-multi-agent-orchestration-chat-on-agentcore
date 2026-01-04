/**
 * Structured Logger for Lambda
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private requestId: string = '';

  setRequestId(reqId: string): void {
    this.requestId = reqId;
  }

  private log(level: LogLevel, event: string, metadata?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      event,
      requestId: this.requestId,
      ...metadata,
    };
    console.log(JSON.stringify(logEntry));
  }

  debug(event: string, metadata?: Record<string, unknown>): void {
    this.log('DEBUG', event, metadata);
  }

  info(event: string, metadata?: Record<string, unknown>): void {
    this.log('INFO', event, metadata);
  }

  warn(event: string, metadata?: Record<string, unknown>): void {
    this.log('WARN', event, metadata);
  }

  error(event: string, metadata?: Record<string, unknown>): void {
    this.log('ERROR', event, metadata);
  }
}

export const logger = new Logger();
