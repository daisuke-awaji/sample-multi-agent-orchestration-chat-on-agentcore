/**
 * Logger Type Definitions
 * 統一ロガーの型定義
 */

/**
 * ログレベル
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * ログレベルの優先度
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ログコンテキスト
 * ログに自動的に付与される情報
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  username?: string;
  sessionId?: string;
  [key: string]: unknown;
}

/**
 * ログエントリ
 * 構造化ログの形式
 */
export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  message: string;
  context?: LogContext;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * ロガーインターフェース
 */
export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
  child(context: LogContext): Logger;
}
