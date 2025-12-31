/**
 * Unified Logger for Agent
 * 構造化ロギングを提供する統一ロガー
 */

/**
 * ログレベル
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * ログレベルの優先度
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * ログコンテキスト
 */
export interface LogContext {
  requestId?: string;
  userId?: string;
  sessionId?: string;
  actorId?: string;
  [key: string]: unknown;
}

/**
 * ログエントリ
 */
interface LogEntry {
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
 * ロガー設定
 */
interface LoggerConfig {
  level: LogLevel;
  isDevelopment: boolean;
  serviceName: string;
}

/**
 * 環境変数からログレベルを取得
 */
function getLogLevelFromEnv(): LogLevel {
  const level = process.env.LOG_LEVEL?.toLowerCase();
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') {
    return level;
  }
  return 'info'; // デフォルト
}

/**
 * ロガー設定を取得
 */
function getLoggerConfig(): LoggerConfig {
  return {
    level: getLogLevelFromEnv(),
    isDevelopment: process.env.NODE_ENV !== 'production',
    serviceName: 'agentcore-agent',
  };
}

/**
 * エラーオブジェクトをシリアライズ
 */
function serializeError(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: 'UnknownError',
    message: String(error),
  };
}

/**
 * コンテキストを文字列に整形
 */
function formatContext(context: LogContext): string {
  const parts: string[] = [];
  if (context.requestId) parts.push(`reqId: ${context.requestId}`);
  if (context.userId) parts.push(`userId: ${context.userId}`);
  if (context.actorId) parts.push(`actorId: ${context.actorId}`);
  if (context.sessionId) parts.push(`session: ${context.sessionId}`);
  return parts.join(', ');
}

/**
 * ログエントリを整形して出力
 */
function formatAndOutput(entry: LogEntry, config: LoggerConfig): void {
  if (config.isDevelopment) {
    // 開発環境: 人間が読みやすい形式
    const emoji = {
      debug: '🔍',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
    }[entry.level];

    const contextStr = entry.context ? ` [${formatContext(entry.context)}]` : '';
    const metadataStr = entry.metadata ? ` ${JSON.stringify(entry.metadata)}` : '';
    const errorStr = entry.error
      ? `\n  Error: ${entry.error.message}\n  Stack: ${entry.error.stack}`
      : '';

    const logMessage = `${emoji} [${entry.level.toUpperCase()}] ${entry.timestamp}${contextStr} ${entry.message}${metadataStr}${errorStr}`;

    switch (entry.level) {
      case 'error':
        console.error(logMessage);
        break;
      case 'warn':
        console.warn(logMessage);
        break;
      default:
        console.log(logMessage);
    }
  } else {
    // 本番環境: JSON形式（CloudWatch Logs Insights用）
    const output = JSON.stringify({
      ...entry,
      service: config.serviceName,
    });

    switch (entry.level) {
      case 'error':
        console.error(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      default:
        console.log(output);
    }
  }
}

/**
 * ロガークラス
 */
export class Logger {
  private config: LoggerConfig;
  private context: LogContext;

  constructor(config: LoggerConfig, context: LogContext = {}) {
    this.config = config;
    this.context = context;
  }

  /**
   * ログレベルが有効かチェック
   */
  private isLevelEnabled(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * ログエントリを作成
   */
  private createLogEntry(
    level: LogLevel,
    message: string,
    metadata?: Record<string, unknown>
  ): LogEntry {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      message,
    };

    // コンテキストがある場合は追加
    if (Object.keys(this.context).length > 0) {
      entry.context = this.context;
    }

    // メタデータを処理（errorがある場合は分離）
    if (metadata) {
      const { error, ...rest } = metadata;
      if (Object.keys(rest).length > 0) {
        entry.metadata = rest;
      }
      if (error) {
        entry.error = serializeError(error);
      }
    }

    return entry;
  }

  /**
   * ログを出力
   */
  private log(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
    if (!this.isLevelEnabled(level)) {
      return;
    }

    const entry = this.createLogEntry(level, message, metadata);
    formatAndOutput(entry, this.config);
  }

  /**
   * デバッグログ
   */
  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('debug', message, metadata);
  }

  /**
   * 情報ログ
   */
  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('info', message, metadata);
  }

  /**
   * 警告ログ
   */
  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('warn', message, metadata);
  }

  /**
   * エラーログ
   */
  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('error', message, metadata);
  }

  /**
   * 子ロガーを作成
   * コンテキスト情報を継承した新しいロガーを返す
   */
  child(additionalContext: LogContext): Logger {
    return new Logger(this.config, {
      ...this.context,
      ...additionalContext,
    });
  }
}

/**
 * グローバルロガーインスタンス
 */
export const logger = new Logger(getLoggerConfig());
