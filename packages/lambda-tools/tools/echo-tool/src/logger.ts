/**
 * 構造化ログユーティリティ
 *
 * 1行のJSONログを出力する独自ロガー
 * リクエストIDの自動付与やログレベル対応を提供
 */

interface LogContext {
  [key: string]: unknown;
}

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

class Logger {
  private reqId?: string;
  private logLevel: LogLevel = 'INFO';

  /**
   * リクエストIDを設定（全ログに自動付与される）
   */
  setRequestId(reqId: string): void {
    this.reqId = reqId;
  }

  /**
   * ログレベルを設定
   */
  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  /**
   * ログレベルの数値化（比較用）
   */
  private getLogLevelValue(level: LogLevel): number {
    const levels = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
    return levels[level];
  }

  /**
   * ログ出力の共通処理
   */
  private log(level: LogLevel, tag: string, data: LogContext): void {
    if (this.getLogLevelValue(level) < this.getLogLevelValue(this.logLevel)) {
      return;
    }

    // リクエストIDを自動付与
    const logData = this.reqId ? { reqId: this.reqId, ...data } : data;

    // エラーオブジェクトの特殊処理
    const processedData = this.processErrorObjects(logData);

    const logMessage = `[${tag}] ${JSON.stringify(processedData)}`;

    switch (level) {
      case 'ERROR':
        console.error(logMessage);
        break;
      case 'WARN':
        console.warn(logMessage);
        break;
      case 'DEBUG':
      case 'INFO':
      default:
        console.log(logMessage);
        break;
    }
  }

  /**
   * エラーオブジェクトをログ出力可能な形式に変換
   */
  private processErrorObjects(obj: unknown): unknown {
    if (obj instanceof Error) {
      return {
        message: obj.message,
        name: obj.name,
        stack: obj.stack,
      };
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.processErrorObjects(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const processed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = this.processErrorObjects(value);
      }
      return processed;
    }

    return obj;
  }

  /**
   * DEBUGレベルログ
   */
  debug(tag: string, data: LogContext = {}): void {
    this.log('DEBUG', tag, data);
  }

  /**
   * INFOレベルログ
   */
  info(tag: string, data: LogContext = {}): void {
    this.log('INFO', tag, data);
  }

  /**
   * WARNレベルログ
   */
  warn(tag: string, data: LogContext = {}): void {
    this.log('WARN', tag, data);
  }

  /**
   * ERRORレベルログ
   */
  error(tag: string, data: LogContext = {}): void {
    this.log('ERROR', tag, data);
  }

  /**
   * リクエストID付きでコンテキストを簡単に作成
   */
  createContext(data: LogContext = {}): LogContext {
    return this.reqId ? { reqId: this.reqId, ...data } : data;
  }

  /**
   * タイムスタンプ付きコンテキスト
   */
  createTimestampedContext(data: LogContext = {}): LogContext {
    return {
      timestamp: new Date().toISOString(),
      ...this.createContext(data),
    };
  }

  /**
   * パフォーマンス測定用のヘルパー
   */
  measureExecution<T>(tag: string, fn: () => T): T {
    const start = process.hrtime.bigint();
    try {
      const result = fn();
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;

      this.debug(`${tag}_PERF`, { durationMs });
      return result;
    } catch (error) {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;

      this.error(`${tag}_PERF_ERROR`, {
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

/**
 * シングルトンロガーインスタンス
 */
export const logger = new Logger();

// 環境変数でログレベル設定
const envLogLevel = process.env.LOG_LEVEL?.toUpperCase() as LogLevel;
if (envLogLevel && ['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(envLogLevel)) {
  logger.setLogLevel(envLogLevel);
}
